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
- **Complete tasks** — click a task or its checkbox to check it off (click again to undo).
- **Edit tasks** — hit ✎ on any row, then Enter to save or Escape to cancel.
- **Delete tasks** — hit the ✕ on any row.
- **Reorder** — drag rows by the ⠿ handle, or focus a row and press Alt+ArrowUp/Down. Order persists.
- **Dark mode** — 🌙/☀️ toggle in the header; saved, defaults to your OS setting.
- **Filter** — All / Active / Completed buttons plus clickable `#tag` chips with a clear bar.

## Project history

- **v1** — add, complete, delete, browser persistence.
- **Counter** — tasks-left line computed from the task list.
- **Due dates + color + motion** — calendar picker, color-coded urgency, row animations.
- **Edit + filter** — inline rename (Enter saves, Escape cancels), All / Active / Completed filter.
- **Reorder + dark + tags** — drag/keyboard reorder, persisted dark mode, `#tag` chips with tag filter.
## Tech notes

One file (`index.html`) with plain HTML, CSS, and JavaScript. State lives in a single `tasks` array, the screen re-renders from it on every change, and `localStorage` keeps everything between visits.
