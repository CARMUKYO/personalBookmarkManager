# AGENTS.md

Instructions for AI coding agents (Claude Code, Gemini CLI, etc.) working on this project.
Read this whole file before doing anything.

## About this project

A **Personal Bookmark Manager**: users sign up, log in, and save, categorize, search, and delete their own bookmarks.

This is a **learning project**. The developer is new to AI-assisted development and wants to
understand the code, not just receive it. That changes how you should work (see "How to work with me").

## Tech stack

Stay within this stack. Do not add new libraries without asking first.

- **Language:** TypeScript everywhere
- **Backend:** Node.js + Express, in `server/`
- **Database:** SQLite via Prisma ORM (`server/prisma/schema.prisma`)
- **Auth:** email + password, passwords hashed with bcryptjs (pure JS, no native build), JWT stored in an httpOnly cookie
- **Validation:** zod for every request body and query string
- **Frontend:** React + Vite, in `client/`
- **Tests:** Vitest (both sides), Supertest for API routes

## Project structure

```
server/
  prisma/schema.prisma
  src/
    routes/        # Express routers, one file per resource (auth, bookmarks, categories)
    middleware/    # requireAuth, error handler, validation
    services/      # business logic + database queries
    app.ts         # createApp({ prisma }) builds the Express app (no listen() here; dependencies are passed in so tests can use test.db)
    index.ts       # starts the server
  tests/
client/
  src/
    api/           # all fetch calls live here, nowhere else
    pages/
    components/
docs/
  tasks.md         # the task breakdown; the source of truth for what to build next
```

## Data model

- **User** – id, email (unique), passwordHash, createdAt
- **Category** – id, name, userId → User. Name is unique *per user*.
- **Bookmark** – id, url, title, description?, userId → User, createdAt, updatedAt
- **Bookmark ↔ Category** is many-to-many (a bookmark can have several categories).

Every Bookmark and Category belongs to exactly one User.

## API conventions

- All endpoints under `/api`. REST style, plural nouns: `/api/bookmarks`, `/api/categories`, `/api/auth/login`.
- JSON in, JSON out. Errors always look like: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`
  Validation errors add `details: [{ "path": "email", "message": "..." }]`.
  Throw `HttpError(status, code, message)` from `src/errors.ts` to send an error; never build error JSON by hand.
  Validate input with `validateBody` / `validateQuery` (`src/middleware/validate.ts`); the validated query is in `res.locals.query`.
- Status codes: 200 OK, 201 created, 204 deleted, 400 validation, 401 not logged in, 404 not found / not yours, 409 conflict.
- List endpoints are paginated and return:
  `{ "data": [...], "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 }`
  - Query params: `page` (default 1), `pageSize` (default 20, max 100)
  - Bookmarks also accept: `q` (search in title, url, description), `categoryId`, `sort` (`newest` | `oldest` | `title`)

## Security rules (never break these)

1. **Authorization on every query.** Every database read/update/delete of a Bookmark or Category
   must filter by `userId` of the logged-in user. A user must never see or change another user's data.
2. If a resource exists but belongs to someone else, return **404**, not 403 (don't reveal it exists).
3. Never store or log plain-text passwords. Never return `passwordHash` from any endpoint.
4. Never trust the client for `userId` — take it from the verified JWT only.
5. Login must not reveal whether an email exists: same 401 for unknown email and wrong password, and always run the bcrypt comparison.
   The JWT (HS256, `sub` = user id only, 7 days) lives only in the httpOnly `token` cookie, never in a response body.
6. Secrets (JWT secret, etc.) come from `.env`. Never commit `.env`; keep `.env.example` up to date.

## How to work with me

- **Plan before coding.** For any task bigger than a small fix, first write a short plan
  (which files you'll touch and why) and wait for my OK.
- **One task at a time.** Work on a single task from `docs/tasks.md`. Don't jump ahead.
- **Small changes.** Prefer several small steps over one huge change.
- **Explain as you go.** After finishing a task, give me a short summary:
  what you changed, why, and one concept I should understand (e.g. "why we hash passwords").
- **Ask, don't guess.** If a requirement is unclear, ask me instead of inventing behavior.
- **Update `docs/tasks.md`.** Tick off a task (`- [x]`) when it is done and tested.
- Keep code simple and readable. No clever tricks, no premature abstraction.

## Commands

Backend config lives in `server/.env` (git-ignored). Copy `server/.env.example` to `server/.env` and set `JWT_SECRET`
(32+ characters; the server refuses to start without it). When adding a variable, update `.env.example` and `src/config.ts`.

```bash
# backend
cd server && npm install
npm run dev          # start API on http://localhost:3000
npm test             # run backend tests
npm run db:migrate  # create/apply a migration after editing schema.prisma (use: npx prisma migrate dev --name <name>)
npm run db:generate # regenerate the Prisma client (also runs on npm install)
npm run db:seed     # (re)create demo users alice@example.com / bob@example.com, password: password123

# frontend
cd client && npm install
npm run dev          # start UI on http://localhost:5173 (proxies /api to the backend on :3000)
npm run build        # type-check and bundle
npm run lint         # oxlint
```

The client has no test setup yet; Vitest + Testing Library get added in task 7.1.

## Definition of done

A task is done when:
- The code works and runs without errors
- There is at least one test for the main behavior (and for authorization, if data is involved)
- `npm test` passes
- `docs/tasks.md` is updated
