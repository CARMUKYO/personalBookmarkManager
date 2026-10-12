# Personal Bookmark Manager

A small web app for keeping your own bookmarks. You sign up with an email and password, save links with a
title and an optional note, put them into categories, and find them again with search, filters and sorting.
Every user only ever sees their own bookmarks and categories.

It was built step by step as a learning project. The task list it followed is in [`docs/tasks.md`](docs/tasks.md).

**Features**

- Sign up, log in and log out. The session is kept in an httpOnly cookie.
- Add, edit and delete bookmarks (address, title, optional note).
- Create, rename and delete categories. A bookmark can be in several categories.
- Search by title, address or note, filter by category, and sort by newest, oldest or title.
- Paginated lists.
- Security basics:
  - hashed passwords
  - rate-limited login and sign-up
  - security headers
  - CSRF notes in [`docs/security.md`](docs/security.md)

## Tech stack

- **TypeScript** everywhere
- **Backend:** Node.js + Express 5, in `server/`
- **Database:** SQLite through the Prisma ORM, so no database server is needed
- **Auth:** bcryptjs password hashing, plus a JWT in an httpOnly cookie
- **Validation:** zod
- **Frontend:** React + Vite, in `client/`
- **Tests:** Vitest on both sides, plus Supertest (API) and Testing Library (UI)

## Prerequisites

- **Node.js 22.22.2 or newer on the 22 line, 24.15 or newer on the 24 line, or 26.x.** Node 24 (LTS) is a safe
  choice. Check your version with `node -v`.
  - Why these versions: the test tools (`vitest`, `jsdom`) and `react-router` set the minimum, and the SQLite
    driver (`better-sqlite3`) has no support beyond Node 26 yet.
  - Both `package.json` files declare this range under `engines`, so `npm install` warns you if your Node doesn't
    fit.
- **npm**, which comes with Node.
- **git**, to clone the repo.

## Setup

### 1. Get the code

```bash
git clone <repo-url> personalBookmarkManager
cd personalBookmarkManager
```

### 2. Backend (`server/`)

```bash
cd server
npm install
```

- `npm install` also generates the Prisma database client, through the `postinstall` script.
- Newer npm versions may print an `install-scripts ... not yet covered by allowScripts` warning for packages like
  `prisma` and `better-sqlite3`. It's only a warning; the install still works.
- npm may also report "4 high severity vulnerabilities" and suggest `npm audit fix --force`. **Don't run it**: the
  warnings are in the Prisma command-line tool's own dependencies (not code the app runs), and `--force` would
  downgrade Prisma to version 6 and break the project.

Create your local config file from the example:

```bash
cp .env.example .env
```

Open `server/.env` and set `JWT_SECRET` to a random string of **at least 32 characters**. The server refuses to
start without it. To generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`.env` is git-ignored. Never commit it.

Create the database. This makes `server/dev.db` and applies all migrations:

```bash
npm run db:migrate
```

Prisma may print an "Update available … major update" box. Ignore it; the project is built for Prisma 7.

Optional: add two demo users with sample data (Alice gets 4 categories and 50 bookmarks, Bob 2 categories and
5 bookmarks). Each run deletes and recreates just these two users and their data; nothing else is touched.

```bash
npm run db:seed
```

| Email               | Password    |
|---------------------|-------------|
| `alice@example.com` | password123 |
| `bob@example.com`   | password123 |

### 3. Frontend (`client/`)

In a new terminal, from the repo root:

```bash
cd client
npm install
```

The frontend needs no config file.

## Running the app

Use two terminals.

```bash
# terminal 1
cd server
npm run dev      # API on http://localhost:3000, restarts when you change code
```

```bash
# terminal 2
cd client
npm run dev      # app on http://localhost:5173
```

Open **http://localhost:5173**. Sign up, or log in as `alice@example.com` / `password123` if you ran the seed.

- The frontend dev server forwards every `/api` request to the backend on port 3000. The browser only talks to
  one address, so no CORS setup is needed.
- If you change `PORT` in `server/.env`, also change the proxy target in `client/vite.config.ts`.
- **Hitting "Too many attempts":** sign-up is limited to 10 per hour per IP address, and login to 10 failed tries
  per 15 minutes. Restart the backend to reset the counters.

## Tests, lint and build

```bash
# backend
cd server
npm test             # API and service tests; uses its own test.db, never your dev.db

# frontend
cd client
npm test             # component and page tests in a fake browser (jsdom)
npm run lint         # oxlint
npm run build        # type-check and bundle into client/dist
```

## Project structure

```
server/
  prisma/schema.prisma   # data model (User, Bookmark, Category)
  prisma/migrations/     # database migrations
  src/routes/            # Express routers: auth, bookmarks, categories
  src/services/          # business logic and database queries
  src/middleware/        # requireAuth, validation, rate limits, error handler
  src/app.ts             # builds the Express app (used by tests and index.ts)
  src/index.ts           # starts the server
  tests/                 # Vitest + Supertest
client/
  src/api/               # every fetch call to the backend
  src/pages/             # login, register, bookmarks pages
  src/components/        # layout, toolbar, bookmark row, dialogs, pager
  src/auth/              # who is logged in (AuthProvider)
docs/
```

## More documentation

- [`AGENTS.md`](AGENTS.md): project rules: stack, API conventions, security rules. It's written for AI coding
  agents, but it's also the most complete description of how the API behaves.
- [`docs/tasks.md`](docs/tasks.md): the task breakdown the project was built from, plus open questions and
  decisions.
- [`docs/security.md`](docs/security.md): CSRF, rate limiting and the other security choices, explained.
- [`docs/review-8.2.md`](docs/review-8.2.md): findings from a review by a second AI, and what was done about each.
- [`docs/design/design-plan.md`](docs/design/design-plan.md): the UI design plan (with a static mock in
  `docs/design/mock.html`).
