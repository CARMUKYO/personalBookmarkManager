# Design plan

The goal: **clean and intuitive first, with a distinct identity only where it costs nothing in clarity.**
A static mock of every screen is in [`mock.html`](mock.html) (open it in a browser; the bar at the top switches screens, theme and width).

## Brief

- **Product:** a personal bookmark manager. One person, their own links.
- **Primary jobs:** save a link quickly, find it again later (search, category, sort), clean up old ones.
- **Feel:** calm, legible, quick to scan. Nothing to learn.

## Identity: a highlighter on paper

Saving a bookmark is marking something worth coming back to, so the accent is **marigold highlighter yellow**.
Boldness is spent in **one place: the monogram tiles** (below). Everything else stays quiet.

### Colour (light / dark)

| Role | Light | Dark | Notes |
|---|---|---|---|
| Paper (page) | `#F3F5F8` | `#12161E` | cool grey, deliberately not cream |
| Surface (panels, fields) | `#FFFFFF` | `#1A202B` | |
| Ink (text) | `#1B2433` | `#E8ECF2` | a navy ink, not black |
| Muted text | `#566174` | `#A3ADBD` | hostnames, notes, hints |
| Line | `#DFE3EA` | `#2B3342` | 1px dividers instead of shadows |
| Marigold (accent) | `#F5C33B` | `#F5C33B` | primary button, selected chip, link underline on hover |
| Highlight | `#FBE7A1` | `#5A4710` | search matches (`<mark>`) |
| Danger | `#B42318` | `#FDA29B` | delete and errors |

Contrast, measured (WCAG 2.2 AA needs 4.5:1 for text, 3:1 for UI): ink on paper 14.3, muted on surface 6.3, ink on marigold 9.5,
danger text 6.6, field border 3.1. Dark mode: ink 15.3, muted 8.0, marigold focus ring 11.0, field border 4.4. Monogram tile letters: ink on the light tiles is 8.1 to 10.0, light text on the dark tiles is 5.2 to 7.9.
One known exception: marigold against the pale page is 1.5:1 as a shape. The button is identified by its label (9.5:1) and its focus ring, which is allowed.

### Monogram tiles (the memorable part)

Each bookmark gets a square tile with the first letter of its site, in one of six clear mid-tone hues (sky, mint, rose, lilac, coral, teal) chosen from an FNV-1a hash of the hostname.
The same site always gets the same tile, so rows become recognisable at a glance, like favicons, with **no external requests** (real favicons would leak which sites you save).
A hostname-less or unknown value falls back to a slate tile.

### Type

- **Display:** Bricolage Grotesque (variable, SIL OFL 1.1). Used for the wordmark, page headings and bookmark titles.
- **Body:** Atkinson Hyperlegible Next (variable, SIL OFL 1.1), designed by the Braille Institute for legibility. It fits an accessibility-first brief.
- Both are self-hosted woff2 files (41 KB + 34 KB), with `system-ui` fallbacks. No font CDN, no new npm package.
- Scale: 14 / 16 / 18 / 22 / 28 / 32 px. Body text is 16px. Descriptions stay under 65 characters wide.

### Layout

- One centred column, 800px wide, with a top bar (wordmark left, email and Log out right).
- Under the heading: **Add bookmark** on the right, then one toolbar row: search, category dropdown, sort dropdown (as `tasks.md` 7.6 specifies).
- The list is **one white panel with hairline dividers**, not a stack of cards. Row: tile, title (link), hostname, two-line note, category chips, then quiet Edit and Delete buttons.
- Pagination under the panel: "Showing 1 to 8 of 57" on the left, Previous and Next on the right.
- Layout responds to its container's width (container queries), so it works on a phone, and the mock can preview 390px.

### Shape and motion

Radii by role: tiles 10px, controls 8px, dialogs 16px, chips fully round. No shadows except the dialog.
Motion only answers an action (a dialog opening). Nothing animates on load. `prefers-reduced-motion` is respected.

### Components and copy

- **Native `<dialog>`** for Add/Edit and Delete confirmation: built-in focus trapping and Escape. No library.
- Labels are always visible above fields. Errors are text next to the field (with an icon), never colour alone.
- Buttons say what they do: "Save bookmark", "Delete bookmark", never "Submit" or "OK". The delete dialog names the bookmark and says the categories stay.
- **Empty state** (following NN/g's guidance: say what's happening, explain what the area is for, give a direct way to fill it): "No bookmarks yet", one line on what they're for, and an "Add your first bookmark" button.
- **No results:** says what was searched and offers "Clear search".
- Links to other sites open in a new tab with `rel="noopener noreferrer"`, and say so to screen readers.
- Keyboard: a 3px ink focus ring (marigold in dark mode) with offset, on everything interactive. Targets are 40px or more.

## Review against the brief (what I changed after the first draft)

| First idea | Problem | Change |
|---|---|---|
| Index-card / library-catalogue metaphor with folder tabs | Kitsch, and ruled paper plus serif drifts into the "broadsheet" look | Dropped. A plain list reads faster. |
| Blue accent, white cards, Inter | The default for any bookmark app. A generic prompt gives exactly this. | Marigold highlighter, one panel, Bricolage plus Atkinson. |
| Cream paper, serif headings, terracotta accent | Another common generated default | Cool grey paper, grotesque type, yellow accent. |
| Small ALL-CAPS labels above sections, `host · date` strings, `→` on buttons | Template chrome that adds noise | Removed. Hostname and counts sit in their own elements. |
| Highlighting one word of the headline in yellow | A typographic tell | Not used. The accent appears on actions and matches only. |
| Category colours on chips and tiles | Too loud, and needs a colour setting we don't have | Chips stay neutral. Tile colour comes from the site. |
| First tiles used pale pastels | Looked timid for the one memorable element, and three early rows hashed to the same blue | Clearer mid-tone fills, and a better-spread hash |
| Page heading "Bookmarks" under a wordmark "Bookmarks" | Said the same thing twice | Heading is "Your bookmarks" |

## Decisions after the design review (2026-10-12)

The mock predates these; where they differ, this section wins.

- **Category management (7.7):** a "Manage categories" dialog, opened from a link next to the category dropdown.
  It lists categories with Rename and Delete, and has a "New category" field. With no categories, the bookmark form says
  "No categories yet" and links to the dialog instead of showing an empty row.
- **Routing:** `react-router` (approved). Filters live in the URL query string.
- **Extra states:** list failed to load ("Couldn't load your bookmarks" + "Try again"); session expired (any 401 sends you
  to sign in with "Your session ended, please sign in again"); email already registered (409, with a link to sign in);
  edit mode says "Edit bookmark" / "Save changes"; "Loading bookmarks…" while the list loads.
- **Saved date:** each row shows "Saved 3 Oct" in its own element next to the hostname, since the list can be sorted by date.
- **Tile letter and hue come from the main domain**, not the full hostname: `developer.mozilla.org` → M, `news.ycombinator.com` → Y,
  `bbc.co.uk` → B. So every page of one site shares a tile.
- **Category chips are links** that filter the list by that category.
- **Empty state hides the toolbar** while the user has no bookmarks and no filters are set.
- **Focus after delete** moves to the next row (or the list heading), and a status message announces "Bookmark deleted".
- Not adopted for now: compact phone rows, hiding the email on phones, "Page 1 of 3", pre-filling the title from the address.

## Out of scope for now

Favicons from the web, user-chosen category colours, drag and drop, list/grid view toggle, keyboard shortcuts. Each would be its own task.

## For the real app (tasks 7.2 onward)

- Tokens become CSS custom properties in `client/src/index.css`, with the dark values under `prefers-color-scheme`. Plain CSS, no Tailwind or UI kit.
- Copy the two woff2 files to `client/public/fonts/` and declare `@font-face` with `font-display: swap`.
- Audited with the Vercel Web Interface Guidelines; every finding on the mock is fixed. Also carry over: preload the two fonts, use `100dvh` and not `100vh`, show "Loading bookmarks…" while a list loads, warn before closing a dirty Add/Edit dialog, no explicit `autoFocus`, and use router `<Link>`s (not `href="#"`) for navigation.
- Copy deliberately uses sentence case, not the guidelines' Title Case.
- A small `tileFor(url)` helper returns the letter and hue. It is unit-tested.
- Search highlighting (`<mark>`) is a nice-to-have for 7.6, not required by the task.
