# My To-Do List

A tiny to-do app in a single HTML file. No frameworks, no installs, no build step — just open it and it works.

This is my first project, built while learning HTML, CSS, and JavaScript. It started as a plain task list and grew a counter, due dates, and a bit of color along the way.

## How to run it

1. Download (or clone) this repo.
2. Double-click `index.html`.
3. That's it — it opens in your browser.

Your tasks are saved in the browser automatically, so they'll still be there after you refresh or close the tab.

## What it does

- **Add tasks** — type something and press Enter or click Add. A due date is optional.
- **Complete tasks** — click a task or its checkbox to check it off (click again to undo).
- **Edit tasks** — hit ✎ on any row, then Enter to save or Escape to cancel.
- **Delete tasks** — hit the ✕ on any row.
- **Due dates** — each dated task gets a colored stripe and a little badge so urgency is visible at a glance: red for overdue, amber for today, blue for the next few days, green for later.
- **Counter** — a line under the list tells you how many tasks are left (or celebrates when you're done 🎉).
- **Works on phone and desktop** — narrow single column that fits small screens.

## Project history

- **v1** — add, complete, delete, browser persistence.
- **Counter** — tasks-left line computed from the task list.
- **Due dates + color + motion** — calendar picker, color-coded urgency, row animations.
- **Edit + filter** — inline rename (Enter saves, Escape cancels), All / Active / Completed filter.

## Tech notes

One file (`index.html`) with plain HTML, CSS, and JavaScript. State lives in a single `tasks` array, the screen re-renders from it on every change, and `localStorage` keeps everything between visits.
