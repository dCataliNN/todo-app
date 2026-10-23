# My To-Do List

A tiny to-do app in a single HTML file. No frameworks, no installs, no build step — just open it and it works.

This is my first project, built while learning HTML, CSS, and JavaScript. It started as a plain task list and grew a counter, due dates, and a bit of color along the way.

## How to run it

1. Download (or clone) this repo.
2. Double-click `index.html`.
3. That's it — it opens in your browser.

Your tasks are saved in the browser automatically, so they'll still be there after you refresh or close the tab.

## What it does

- **Add tasks** — type something and press Enter or click Add. A due date is optional. `#tags` in text become clickable filters.
- **Quick add parsing** — dates (`tomorrow`, `friday`, `next week`, `in 3 days`, `2026-10-05`), `18:00`, `p1`–`p4`, `+Project` and `every day / every 2 weeks`. Parsed values appear as chips above the list: click a chip to edit it, ✕ to keep that word as plain text. Impossible dates and times are flagged and left as text.
- **Complete tasks** — click a task or its checkbox to check it off (click again to undo).
- **Edit tasks** — hit ✎ on any row, then Enter to save or Escape to cancel.
- **Delete tasks** — hit the ✕ on any row.
- **Reorder** — drag rows by the ⠿ handle, or focus a row and press Alt+ArrowUp/Down. Order persists.
- **Dark mode** — 🌙/☀️ toggle in the header; saved, defaults to your OS setting.
- **Theme presets** — 🎨 opens six tweakcn token sets (Cloud, Claude, Modern minimal, Catppuccin, Cyberpunk, Mono), each with a light and dark variant. Saved locally.
- **Command palette** — `Ctrl`/`Cmd`+`K` or the ⌘K button: fuzzy-search views, projects, themes and actions, or type text to add a task straight from the palette (same date/priority/project parsing as quick add).
- **Points shop** — the balance chip in the header. Completing a task earns +10 points (100/day cap; un-completing never refunds, and each task pays once). Spend points on accent color themes in the shop modal; buying auto-equips.
- **Filter** — All / Active / Completed buttons plus clickable `#tag` chips with a clear bar.

## Project history

- **v1** — add, complete, delete, browser persistence.
- **Counter** — tasks-left line computed from the task list.
- **Due dates + color + motion** — calendar picker, color-coded urgency, row animations.
- **Edit + filter** — inline rename (Enter saves, Escape cancels), All / Active / Completed filter.
- **Reorder + dark + tags** — drag/keyboard reorder, persisted dark mode, `#tag` chips with tag filter.
- **Phases 1–5** — stable IDs, task drawer, projects, priority labels, recurring tasks with one successor per completion.
- **Phase 6** — quick-add parser split from task creation, editable/removable preview chips, `next week`, `in N days`, `HH:mm`, rejected dates/times.
- **Phase 7** — tweakcn theme presets (light + dark), Ctrl/Cmd+K command palette, chip and palette motion gated by `prefers-reduced-motion`.

## Tech notes

Plain HTML, CSS and JavaScript split into `index.html`, `styles.css`, `app.js` and a `sw.js` service worker. No build step, no dependencies. State lives in a single `tasks` array, the screen re-renders from it on every change, and `localStorage` keeps everything between visits. `tests/nlp.html` renders the parser self-check (open it over http, not `file://`).

Wallet rules are pure in `points.js`; `node --test tests/*.mjs` verifies the earn/spend invariants.

docs: trigger auto-deploy check
