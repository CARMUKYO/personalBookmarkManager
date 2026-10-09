# Prompts for this project

Copy-paste these into Claude Code or Gemini CLI, in order.

---

## Prompt 1 — Break the whole project into tasks

> Read AGENTS.md first.
>
> Here is the feature requirement for this project:
>
> "Build an application where users can save, categorize, search and delete bookmarks.
> It must cover: authentication, authorization, search/filtering, pagination,
> database relationships, API design, and frontend/backend integration."
>
> Don't write any code yet. Break this requirement into development tasks and save them to
> `docs/tasks.md`.
>
> Rules for the breakdown:
> 1. Group tasks into milestones, in the order they should be built
>    (e.g. Setup → Database → Auth → Bookmarks API → Search & Pagination → Frontend → Polish).
> 2. Each task should be small enough to finish in about 30–90 minutes.
> 3. Write each task as a checkbox: `- [ ] Short title`, followed by:
>    - **What:** one or two sentences
>    - **Acceptance criteria:** 2–4 bullet points I can check to know it's done
>    - **Depends on:** earlier task(s), if any
> 4. Include testing tasks, especially tests proving one user cannot access another user's bookmarks.
> 5. At the end, list any open questions or assumptions you made.
>
> After writing the file, explain in a few sentences *why* you ordered the milestones this way.

---

## Prompt 2 — Break ONE feature into tasks (repeat for each feature)

This is the core skill to practice. Swap in a different feature each time.

> Read AGENTS.md. Here is a feature requirement:
>
> "Users can search their bookmarks by keyword and filter by category. Results are paginated."
>
> Before coding, break this feature into development tasks across the layers:
> database, backend API, validation, frontend, and tests.
> For each task give: what to do, which files change, and acceptance criteria.
> Also list edge cases (empty search, page out of range, category that belongs to another user, etc.).
> Wait for my approval before implementing anything.

Other features to try with the same prompt:
- "Users can sign up, log in, and log out."
- "Users can create, rename, and delete categories. Deleting a category doesn't delete its bookmarks."
- "Users can edit a bookmark and change its categories."

---

## Prompt 3 — Implement the next task

> Read AGENTS.md and docs/tasks.md. Pick the next unchecked task.
> Show me your plan (files to change and why) and wait for my OK.
> After implementing: run the tests, tick the task in docs/tasks.md,
> and explain one concept I should learn from this task.

---

## Prompt 4 — Review (good to use the *other* AI for this)

> Read AGENTS.md. Review the code changed for the last task.
> Check especially: does every bookmark/category query filter by the logged-in user's id?
> Are inputs validated? Are there missing tests? List problems, most serious first. Don't fix them yet.

Tip: implement with one tool (e.g. Claude) and review with the other (e.g. Gemini).
A second opinion catches mistakes the first one missed.
