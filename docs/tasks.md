# Task Breakdown: Personal Bookmark Manager

Requirement: users can save, categorize, search and delete bookmarks, covering authentication,
authorization, search/filtering, pagination, database relationships, API design and
frontend/backend integration.

Work top to bottom. Each task is about 30-90 minutes. Tick `[x]` when done and tested.

---

## Milestone 1: Setup

- [x] **1.1 Scaffold the backend**
  - **What:** Create `server/` with TypeScript, Express, Vitest and Supertest. Split `app.ts` (builds the app) from `index.ts` (calls `listen`).
  - **Acceptance criteria:**
    - `npm run dev` starts the API on port 3000
    - `GET /api/health` returns `{ "status": "ok" }`
    - One Supertest test for `/api/health` passes with `npm test`
  - **Depends on:** none

- [x] **1.2 Scaffold the frontend**
  - **What:** Create `client/` with React, Vite and TypeScript. Proxy `/api` to the backend in the Vite config.
  - **Acceptance criteria:**
    - `npm run dev` shows a page on port 5173
    - The page calls `/api/health` and displays the result
  - **Depends on:** 1.1

- [x] **1.3 Environment config and git hygiene**
  - **What:** Add `.env` loading, `.env.example`, and a `.gitignore` covering `.env`, `node_modules` and the SQLite file. Fill in the Commands section of `AGENTS.md`.
  - **Acceptance criteria:**
    - `.env` is not tracked by git
    - `.env.example` lists every variable (`JWT_SECRET`, `DATABASE_URL`, `PORT`)
    - The server fails to start with a clear message if `JWT_SECRET` is missing
  - **Depends on:** 1.1

## Milestone 2: Database

- [x] **2.1 Prisma schema: User**
  - **What:** Install Prisma with SQLite. Define `User` (id, email unique, passwordHash, createdAt) and run the first migration.
  - **Acceptance criteria:**
    - `npx prisma migrate dev` creates the database
    - A test can create a user and reading back a duplicate email fails
  - **Depends on:** 1.3

- [x] **2.2 Prisma schema: Bookmark and Category relations**
  - **What:** Add `Bookmark` and `Category`, each with a `userId` foreign key. Add the many-to-many link between them. Category name is unique per user (`@@unique([userId, name])`).
  - **Acceptance criteria:**
    - A bookmark can have several categories and a category several bookmarks
    - Deleting a user deletes their bookmarks and categories (cascade)
    - Deleting a category does NOT delete its bookmarks
  - **Depends on:** 2.1

- [x] **2.3 Indexes and a seed script**
  - **What:** Add indexes on `userId` and `createdAt`. Write a seed script creating two users with sample bookmarks (about 50 for one user, to test pagination later).
  - **Acceptance criteria:**
    - `npx prisma db seed` runs and can be re-run safely
    - Seed data includes bookmarks for BOTH users (needed to test authorization)
  - **Depends on:** 2.2

## Milestone 3: Authentication

- [x] **3.1 Shared error handling and validation**
  - **What:** Add the global error handler returning `{ "error": { "code", "message" } }` and a zod validation middleware that returns 400 on bad input.
  - **Acceptance criteria:**
    - An unknown route returns 404 in the standard error shape
    - Invalid input returns 400 with a readable message
  - **Depends on:** 1.1

- [x] **3.2 Sign-up endpoint**
  - **What:** `POST /api/auth/register` validates email and password (minimum length), hashes with bcrypt, creates the user.
  - **Acceptance criteria:**
    - 201 on success, and the response never contains `passwordHash`
    - 409 if the email already exists
    - 400 on invalid email or short password
    - The stored password is a hash, not plain text (test checks this)
  - **Depends on:** 2.1, 3.1

- [x] **3.3 Login and logout endpoints**
  - **What:** `POST /api/auth/login` verifies the password and sets a JWT in an httpOnly cookie. `POST /api/auth/logout` clears it.
  - **Acceptance criteria:**
    - Correct credentials: 200 and a cookie flagged httpOnly
    - Wrong password and unknown email both return the same 401 (no hint which one was wrong)
    - Logout clears the cookie
  - **Depends on:** 3.2

- [x] **3.4 `requireAuth` middleware and `/api/auth/me`**
  - **What:** Middleware that verifies the JWT cookie and attaches `req.userId`. `GET /api/auth/me` returns the current user.
  - **Acceptance criteria:**
    - No cookie, a bad token, or an expired token all return 401
    - `/me` returns the logged-in user without `passwordHash`
  - **Depends on:** 3.3

## Milestone 4: Bookmarks API (CRUD and authorization)

- [x] **4.1 Create a bookmark**
  - **What:** `POST /api/bookmarks` (auth required) with url, title, optional description and optional `categoryIds`.
  - **Acceptance criteria:**
    - `userId` comes from the JWT, never from the request body
    - Invalid URLs are rejected with 400
    - `categoryIds` that belong to another user are rejected (400, same message as for nonexistent ids), via ONE shared helper
      (`assertCategoriesOwned(userId, ids)`) that task 4.2 reuses. The implicit many-to-many table can't enforce this itself.
  - **Depends on:** 3.4, 2.2

- [x] **4.2 Get one bookmark and update a bookmark**
  - **What:** `GET /api/bookmarks/:id` and `PATCH /api/bookmarks/:id`, both including the bookmark's categories.
  - **Acceptance criteria:**
    - Someone else's bookmark returns 404 for both
    - PATCH can change the title, description and categories
  - **Depends on:** 4.1

- [x] **4.3 Delete a bookmark**
  - **What:** `DELETE /api/bookmarks/:id`.
  - **Acceptance criteria:**
    - 204 on success
    - 404 if the bookmark doesn't exist or isn't yours, and the other user's bookmark is untouched
  - **Depends on:** 4.1

- [x] **4.4 Authorization test suite**
  - **What:** A dedicated test file with two users proving user B can't read, edit or delete user A's bookmarks, and that unauthenticated requests get 401 on every bookmark route.
  - **Acceptance criteria:**
    - Every bookmark route is covered for both cases
    - Tests fail if the `userId` filter is removed from a query (verify by temporarily removing it)
  - **Depends on:** 4.2, 4.3

## Milestone 5: Categories API

- [ ] **5.1 Categories CRUD**
  - **What:** `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id`, all scoped to the logged-in user.
  - **Acceptance criteria:**
    - Duplicate name for the same user returns 409
    - Two different users can use the same category name
    - Deleting a category removes the link but keeps the bookmarks
  - **Depends on:** 3.4, 2.2

- [ ] **5.2 Category authorization tests**
  - **What:** Same idea as 4.4, for categories.
  - **Acceptance criteria:**
    - User B gets 404 on user A's category for read, edit and delete
  - **Depends on:** 5.1

## Milestone 6: Search, filtering and pagination

- [ ] **6.1 List bookmarks with pagination**
  - **What:** `GET /api/bookmarks?page=&pageSize=` returning `{ data, page, pageSize, total, totalPages }`, newest first.
  - **Acceptance criteria:**
    - Defaults to page 1, pageSize 20; pageSize above 100 is rejected or capped (decide and document)
    - A page beyond the last returns an empty `data` array, not an error
    - Only the logged-in user's bookmarks are counted and returned
  - **Depends on:** 4.1, 2.3

- [ ] **6.2 Keyword search**
  - **What:** Add `q`, matching title, url and description (case-insensitive).
  - **Acceptance criteria:**
    - Matches in any of the three fields are returned
    - Empty `q` returns everything
    - `total` reflects the filtered count
  - **Depends on:** 6.1

- [ ] **6.3 Category filter and sorting**
  - **What:** Add `categoryId` and `sort` (`newest`, `oldest`, `title`).
  - **Acceptance criteria:**
    - Filtering by someone else's category returns an empty list (or 404; decide and document)
    - `q`, `categoryId`, `sort` and pagination all work together
    - Invalid `sort` values return 400
  - **Depends on:** 6.2, 5.1

## Milestone 7: Frontend

- [ ] **7.1 API client and auth state**
  - **What:** A typed `client/src/api/` module wrapping `fetch` (with cookies), plus an auth context holding the current user.
  - **Acceptance criteria:**
    - All fetch calls live in `api/`
    - Reloading the page keeps you logged in (via `/me`)
  - **Depends on:** 3.4, 1.2

- [ ] **7.2 Register and login pages**
  - **What:** Forms with client-side checks and server error messages. Redirect after success.
  - **Acceptance criteria:**
    - Wrong password shows an error message
    - Logged-in users are redirected away from the login page
  - **Depends on:** 7.1

- [ ] **7.3 Protected routes and logout**
  - **What:** Redirect unauthenticated users to login; add a logout button.
  - **Acceptance criteria:**
    - Visiting the bookmarks page logged out redirects to login
    - Logout clears the session and redirects
  - **Depends on:** 7.2

- [ ] **7.4 Bookmark list with pagination**
  - **What:** Show the user's bookmarks with page controls, loading and empty states.
  - **Acceptance criteria:**
    - Previous/Next buttons work and disable at the ends
    - An empty-state message appears for a new user
  - **Depends on:** 6.1, 7.3

- [ ] **7.5 Add, edit and delete bookmarks**
  - **What:** A form to add/edit and a delete button with confirmation.
  - **Acceptance criteria:**
    - The list refreshes after each change
    - Server validation errors are shown next to the form
  - **Depends on:** 4.2, 4.3, 7.4

- [ ] **7.6 Search box, category filter and sort**
  - **What:** Controls above the list. Search is debounced; filter state is kept in the URL query string.
  - **Acceptance criteria:**
    - Changing search or filter resets to page 1
    - Reloading the page keeps the filters
  - **Depends on:** 6.3, 7.4

- [ ] **7.7 Category management UI**
  - **What:** Create, rename and delete categories; assign categories on the bookmark form.
  - **Acceptance criteria:**
    - Duplicate-name errors are shown clearly
    - New categories appear in the filter dropdown without a reload
  - **Depends on:** 5.1, 7.5

## Milestone 8: Hardening and polish

- [ ] **8.1 Security pass**
  - **What:** Add `helmet`, rate limiting on login/register, and confirm cookie flags (`secure` in production, `sameSite`). Think about CSRF given cookie auth.
  - **Acceptance criteria:**
    - Repeated failed logins get a 429
    - Written notes on the CSRF approach in `docs/`
  - **Depends on:** 3.3

- [ ] **8.2 Review with a second AI**
  - **What:** Use Prompt 4 from `PROMPTS.md` with the other tool (Gemini) on the whole project.
  - **Acceptance criteria:**
    - Findings listed and each one fixed or consciously skipped
  - **Depends on:** all above

- [ ] **8.3 README and final check**
  - **What:** Write a README with setup steps, then follow it from a fresh clone.
  - **Acceptance criteria:**
    - A fresh clone runs following only the README
    - `npm test` passes on both sides
  - **Depends on:** all above

---

## Open questions and assumptions

1. **Stack:** I assumed the stack in `AGENTS.md` (Express, Prisma/SQLite, React). Change that file first if you want something else.
2. **Search:** keyword search uses simple `contains` matching. SQLite full-text search is a possible later upgrade.
3. **Auth extras:** no email verification, password reset, or "remember me". Out of scope for now.
4. **Tags vs categories:** I treated them as the same thing (many-to-many). Say so if you want a single category per bookmark instead; that simplifies the database.
5. **pageSize above 100:** reject vs. cap is left for you to decide in task 6.1.
6. **Not included:** importing browser bookmarks, fetching page titles automatically, deployment.

## Why this order

- **Setup first** so every later task has somewhere to run and be tested.
- **Database before auth** because a user must exist before anyone can log in.
- **Auth before bookmarks** because every bookmark query depends on knowing who the user is.
- **Authorization tests (4.4, 5.2) right after CRUD**, while the code is small, so that mistakes are caught early.
- **Search and pagination after basic CRUD**, since they are changes to the list query, not new features.
- **Frontend last**, built against an API that already works and is tested. You can also try the API by hand (curl) before any UI exists.
