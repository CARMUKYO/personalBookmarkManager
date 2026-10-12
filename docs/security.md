# Security notes

What protects this app, and why. Written for task 8.1.

## CSRF (cross-site request forgery)

**The attack:** you are logged in to the bookmark manager, then visit `evil.example`. That page quietly sends a
request to our API (for example "delete bookmark 5"). If your browser attaches your login cookie, the server
can't tell the request apart from one you made yourself.

Because we log in with a cookie, this is a real question for us. Our answer is that several layers each block
the attack on their own, so one mistake doesn't open the door.

### Layer 1: `SameSite=Lax` on the login cookie

The browser only sends a `SameSite=Lax` cookie when:

- the request comes from our own site, or
- the user clicks a normal link to our site (a top-level GET navigation).

A POST, PATCH or DELETE from another site, and any `fetch()` from another site, goes out **without** the
cookie. To the server that's just "not logged in", so it answers 401.

The one case Lax still allows is a GET when the user follows a link. That's harmless here, because **no GET
route changes anything**: every GET only reads data. Keep it that way. Never add a GET route that creates,
updates or deletes.

> Caveat: "same-site" is wider than "same-origin". `a.example.com` and `b.example.com` count as the same
> *site*, so if this app ever shared a domain with an untrusted subdomain, Lax alone wouldn't stop it.
> The next two layers still would.

### Layer 2: we only accept JSON bodies

An attacker's page has two ways to send a request:

1. **A plain HTML `<form>`.** A form can only send `application/x-www-form-urlencoded`, `multipart/form-data`
   or `text/plain`. It can't send `application/json`.
2. **JavaScript `fetch()`.** See layer 3.

`express.json()` only reads bodies with `Content-Type: application/json`. For any other type it does nothing,
so `req.body` stays empty. This holds even for a `text/plain` body that *looks* like JSON, such as
`{"url":"...","title":"..."}`. Our zod validation then rejects the empty body with **400**, and nothing is
saved. `tests/security.test.ts` checks this for `text/plain` and urlencoded POSTs.

### Layer 3: no CORS, so the browser blocks cross-site `fetch()`

For a "non-simple" request, the browser first asks the server for permission with an `OPTIONS` *preflight*
request. Non-simple means:

- a `Content-Type: application/json` body, or
- the methods `PATCH` or `DELETE`.

Our server never sends CORS headers (`Access-Control-Allow-Origin` etc.), so the browser treats the missing
headers as "no" and **never sends the real request**. That covers all our PATCH and DELETE routes too, even
though DELETE has no body.

(The frontend doesn't need CORS. In development Vite proxies `/api` to the backend, so the browser only ever
talks to one origin.)

### Logout

`POST /api/auth/logout` has no body, so layer 2 doesn't apply to it. Layer 1 still does: from another site the
cookie isn't sent. Even in the worst case, the attacker could only log you out, which is annoying but harmless.

### Conclusion

There's no need for CSRF tokens right now.

**Possible extra layer (not built):** reject POST/PATCH/DELETE requests whose `Origin` header is present and
isn't our own site. Browsers add `Origin` to these requests automatically, so it would be a cheap fourth check.
Worth adding if we ever enable CORS, accept form posts, or share a domain with other apps.

**Rules that keep us safe:**

- Never add a GET route that changes data.
- Never enable CORS with credentials.
- Never accept non-JSON bodies on state-changing routes.

## Rate limiting (login and sign-up)

Implemented with `express-rate-limit` in `server/src/middleware/rateLimit.ts`, set up in `createApp()`.

| Route                     | Limit per IP                  | What counts                             |
|---------------------------|-------------------------------|-----------------------------------------|
| `POST /api/auth/login`    | 10 per 15 minutes             | only **failed** attempts (status ≥ 400) |
| `POST /api/auth/register` | 10 per hour                   | every attempt                           |

- **Why these numbers:**
  - Login: a real user rarely mistypes their password 10 times in 15 minutes. An attacker guessing passwords
    from one IP is held to about 1,000 guesses a day instead of thousands per minute.
  - Login: successful logins don't count, so signing in and out repeatedly never locks anyone out.
  - Register: sign-ups are rare for a real person. Each one also costs a bcrypt hash, so unlimited sign-ups
    would be an easy way to flood the server.
- **What happens when blocked:** the server answers `429` with
  `{ "error": { "code": "TOO_MANY_REQUESTS", "message": "Too many attempts. Please wait a few minutes and try again." } }`.
  - It sends the standard `RateLimit` / `RateLimit-Policy` headers and a `Retry-After` header (seconds to wait).
  - The login and register pages show the message.
- **Keyed by IP address:**
  - Counters are per IP address. IPv6 addresses are grouped by network block (the library's default), so an
    attacker can't dodge the limit just by switching between their many IPv6 addresses.
  - Counters live in memory. They reset when the server restarts and aren't shared if you run several server
    processes; that would need a shared store such as Redis.
- **In local development** every request comes from the same IP (your machine), so testing sign-up more than
  10 times in an hour will hit the limit. Restart the server to reset the counters.
- **Behind a reverse proxy in production** (nginx, a load balancer, a hosting platform), every request reaches
  Express from the *proxy's* IP. All users would then share one counter, and one attacker could lock everyone
  out.
  - The fix is `app.set("trust proxy", 1)`, where `1` is the number of proxies in front of the app. Express then
    reads the real client IP from the `X-Forwarded-For` header.
  - Don't set it to `true` or a number that's too high: then a client could fake their IP by sending their own
    `X-Forwarded-For` header and get unlimited attempts.
  - Not set today, because deployment is out of scope.

## Other protections

- **helmet** (default settings) adds security headers to every response and removes `X-Powered-By`, which would
  otherwise tell attackers we run Express. Examples:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN` (no embedding our pages in another site's frame)
  - a strict `Content-Security-Policy`
- **Login cookie flags**, tested in `server/tests/auth.login.test.ts`:
  - `HttpOnly`: page JavaScript can't read the token, which limits the damage of an XSS bug.
  - `SameSite=Lax`
  - `Path=/`
  - 7-day `Max-Age`
  - `Secure` (HTTPS only) when `NODE_ENV=production`
- **The rest** is covered in `AGENTS.md`:
  - passwords hashed with bcrypt
  - the same 401 for an unknown email and a wrong password
  - every query filtered by the logged-in user
  - 404 (not 403) for other people's data
