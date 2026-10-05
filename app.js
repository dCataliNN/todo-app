    // --- Task model ---
    // { id, text, description, done, createdAt, updatedAt, completedAt,
    //   due (YYYY-MM-DD|""), dueTime (HH:mm|""), prio (0-3), projectId,
    //   tags[], recurrence, order }
    // Priority meaning (unchanged): 0=None, 1=P3 Low, 2=P2 Medium, 3=P1 High.
    let tasks = [];
    let projects = []; // { id, name, color, icon, order, createdAt, updatedAt }
    let filter = 'all'; // all | active | completed
    let view = 'inbox'; // inbox | today | upcoming | all | project:<id>
    let search = ''; // free-text query (lowercased)
    let activeTag = ''; // '' = no tag filter
    let dragId = null; // task id of dragged row
    let openTaskId = null; // task id shown in drawer
    let drawerReturnFocus = null; // element to refocus on drawer close
    const PROJECT_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
    const PROJECT_ICONS = ['📋', '💼', '🎓', '🏠', '💻', '📚', '✈️', '❤️'];
    // --- Grab the elements we need ---
    const input = document.getElementById('task-input');
    const dueInput = document.getElementById('due-input');
    const searchInput = document.getElementById('search-input');
    const addBtn = document.getElementById('add-btn');
    const list = document.getElementById('task-list');
    const counter = document.getElementById('counter');
    const themeBtn = document.getElementById('theme-btn');
    const tagBar = document.getElementById('tag-bar');
    const tagClear = document.getElementById('tag-clear');
    // PWA: register service worker when served over http(s), skip on file://.
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline optional */ });
    }
    // --- Load saved data when the page opens ---
    loadTasks();
    loadProjects();
    sanitizeTaskProjects();
    render();
    requestPersist();
    updateBadge();
    function newId() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    function nowIso() { return new Date().toISOString(); }

    function getTaskById(id) {
      for (const t of tasks) if (t.id === id) return t;
      return null;
    }

    function getTaskIndexById(id) {
      for (let i = 0; i < tasks.length; i++) if (tasks[i].id === id) return i;
      return -1;
    }

    function updateTask(id, patch) {
      const t = getTaskById(id);
      if (!t) return null;
      Object.assign(t, patch, { updatedAt: nowIso() });
      saveTasks();
      return t;
    }

    function deleteTask(id) {
      const i = getTaskIndexById(id);
      if (i < 0) return null;
      const removed = tasks.splice(i, 1)[0];
      saveTasks();
      if (openTaskId === id) closeDrawer();
      return removed;
    }

    // --- Projects: { id, name, color, icon, order, createdAt, updatedAt } ---
    function getProjectById(id) {
      for (const p of projects) if (p.id === id) return p;
      return null;
    }

    function getProjectIndexById(id) {
      for (let i = 0; i < projects.length; i++) if (projects[i].id === id) return i;
      return -1;
    }

    function saveProjects() {
      try {
        localStorage.setItem('todo-projects', JSON.stringify(projects));
      } catch (e) { /* keep going */ }
    }

    function createProject(data) {
      const stamped = nowIso();
      const p = {
        id: newId(),
        name: (data.name || 'Untitled').slice(0, 60),
        color: PROJECT_COLORS.indexOf(data.color) >= 0 ? data.color : PROJECT_COLORS[3],
        icon: PROJECT_ICONS.indexOf(data.icon) >= 0 ? data.icon : PROJECT_ICONS[0],
        order: projects.length,
        createdAt: stamped,
        updatedAt: stamped
      };
      projects.push(p);
      saveProjects();
      return p;
    }

    function updateProject(id, patch) {
      const p = getProjectById(id);
      if (!p) return null;
      if (patch.name !== undefined) p.name = String(patch.name).slice(0, 60) || p.name;
      if (patch.color !== undefined && PROJECT_COLORS.indexOf(patch.color) >= 0) p.color = patch.color;
      if (patch.icon !== undefined && PROJECT_ICONS.indexOf(patch.icon) >= 0) p.icon = patch.icon;
      if (patch.order !== undefined) p.order = patch.order;
      p.updatedAt = nowIso();
      saveProjects();
      return p;
    }

    // Delete: tasks move to Inbox (projectId null). Never deletes tasks.
    function deleteProject(id) {
      const i = getProjectIndexById(id);
      if (i < 0) return false;
      projects.splice(i, 1);
      tasks.forEach(function (t, n) {
        if (t.projectId === id) { t.projectId = null; t.order = n; }
      });
      saveProjects();
      saveTasks();
      if (view === 'project:' + id) setView('inbox');
      return true;
    }

    function moveProject(id, targetId) {
      const from = getProjectIndexById(id);
      const to = getProjectIndexById(targetId);
      if (from < 0 || to < 0 || from === to) return;
      const moved = projects.splice(from, 1)[0];
      projects.splice(to, 0, moved);
      projects.forEach(function (p, n) { p.order = n; });
      saveProjects();
    }

    function getProjectTaskCount(id) {
      return tasks.filter(function (t) { return !t.done && t.projectId === id; }).length;
    }

    function validProject(p) {
      return p && typeof p.id === 'string' && typeof p.name === 'string';
    }

    function migrateProject(raw, index) {
      const stamped = raw.createdAt || nowIso();
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
        name: String(raw.name || 'Untitled').slice(0, 60),
        color: PROJECT_COLORS.indexOf(raw.color) >= 0 ? raw.color : PROJECT_COLORS[3],
        icon: PROJECT_ICONS.indexOf(raw.icon) >= 0 ? raw.icon : PROJECT_ICONS[0],
        order: typeof raw.order === 'number' ? raw.order : index,
        createdAt: stamped,
        updatedAt: raw.updatedAt || stamped
      };
    }

    function loadProjects() {
      const saved = localStorage.getItem('todo-projects');
      if (!saved) { projects = []; return; }
      try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(validProject)) throw new Error('bad shape');
        projects = parsed.map(migrateProject).sort(function (a, b) { return a.order - b.order; });
        try { localStorage.setItem('todo-projects', JSON.stringify(projects)); } catch (q) {}
      } catch (e) {
        try { localStorage.setItem('todo-projects-corrupt', saved); } catch (q) {}
        projects = []; // tasks untouched
      }
    }

    // Orphan safety: projectId pointing nowhere becomes Inbox (null).
    function sanitizeTaskProjects() {
      let dirty = false;
      tasks.forEach(function (t) {
        if (t.projectId && !getProjectById(t.projectId)) { t.projectId = null; dirty = true; }
      });
      if (dirty) saveTasks();
    }
    function activeProjectId() {
      return view.indexOf('project:') === 0 ? view.slice(8) : null;
    }

    function setView(v) {
      view = v;
      activeTag = '';
      document.querySelectorAll('.sidebar [data-view]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.view === v);
        if (b.dataset.view === v) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      document.querySelectorAll('#side-projects .project-row').forEach(function (b) {
        const on = 'project:' + b.dataset.project === v;
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      renderView();
    }
    function requestPersist() {
      try {
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(function (ok) {
            if (!ok) note('Storage may be cleared by the browser — use Export for backup.');
          });
        }
      } catch (e) { /* best-effort only */ }
    }

    // Transient note in counter line (restored on next render).
    function note(text) { counter.textContent = text; }

    // Render with View Transitions when available, plain otherwise.
    // afterRender runs after the DOM is rebuilt (inside the VT callback).
    function renderView(afterRender) {
      const update = function () {
        render();
        if (afterRender) afterRender();
      };
      if (document.startViewTransition &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.startViewTransition(update);
      } else {
        update();
      }
    }

    function focusRow(id) {
      const row = list.querySelector('li[data-id="' + id + '"]');
      const btn = row && row.querySelector('.edit-btn');
      if (btn) btn.focus();
    }

     // --- Theme: stored choice wins, else OS preference ---
     initTheme();
    themeBtn.addEventListener('click', function () {
      const dark = !document.body.classList.contains('dark');
      applyTheme(dark, true);
    });

    function initTheme() {
      const saved = localStorage.getItem('todo-theme');
      const dark = saved ? saved === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(dark, false);
    }

    function applyTheme(dark, save) {
      document.body.classList.toggle('dark', dark);
      themeBtn.textContent = dark ? '☀️' : '🌙';
      if (save) localStorage.setItem('todo-theme', dark ? 'dark' : 'light');
    }

    // --- Tags: #word in text becomes a clickable chip ---
    function taskTags(text) {
      const tags = text.match(/#[\p{L}\p{N}_-]+/gu);
      return tags ? tags.map(function (t) { return t.toLowerCase(); }) : [];
    }

    function renderTextWithTags(span, text) {
      span.textContent = '';
      const parts = text.split(/(#[\p{L}\p{N}_-]+)/gu);
      parts.forEach(function (part) {
        if (/^#[\p{L}\p{N}_-]+$/u.test(part)) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'tag-chip';
          chip.textContent = part.toLowerCase();
          chip.dataset.tag = part.toLowerCase();
          span.append(chip);
        } else if (part) {
          span.append(document.createTextNode(part));
        }
      });
    }

    tagClear.addEventListener('click', function () {
      activeTag = '';
      renderView();
    });

    // --- Toolbar: clipboard, share, export/import, reminders, help ---
    const copyBtn = document.getElementById('copy-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const shareBtn = document.getElementById('share-btn');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const notifyBtn = document.getElementById('notify-btn');
    const helpBtn = document.getElementById('help-btn');
    const helpPopover = document.getElementById('help-popover');

    function tasksAsText() {
      return tasks.map(function (t) {
        return (t.done ? '[x] ' : '[ ] ') + t.text + (t.due ? ' (' + t.due + ')' : '');
      }).join('\n');
    }

    // Copy visible list as text; fallback prompt when clipboard blocked.
    copyBtn.addEventListener('click', function () {
      const text = tasksAsText();
      if (!text) { note('Nothing to copy yet.'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { note('Copied ' + tasks.length + ' tasks.'); },
          function () { window.prompt('Copy tasks:', text); });
      } else {
        window.prompt('Copy tasks:', text);
      }
    });

    // Paste: one task per line ("[x] text (YYYY-MM-DD)" understood).
    pasteBtn.addEventListener('click', function () {
      if (!(navigator.clipboard && navigator.clipboard.readText)) {
        note('Clipboard read unavailable — type tasks or use Import.');
        return;
      }
      navigator.clipboard.readText().then(function (text) {
        importLines(text.split(/\r?\n/));
      }, function () {
        note('Clipboard blocked — allow access or use Import.');
      });
    });

    function importLines(lines) {
      const pid = activeProjectId(); // paste targets current project view
      let added = 0;
      lines.forEach(function (line) {
        const text = line.trim().replace(/^\[[ xX]\]\s*/, '');
        if (!text) return;
        const m = text.match(/\(?(\d{4}-\d{2}-\d{2})\)?\s*$/);
        let due = '';
        let body = text;
        if (m && isValidDue(m[1])) { due = m[1]; body = text.slice(0, m.index).trim(); }
        if (!body) return;
        const done = /^\[x\]/i.test(line.trim());
        const stamped = nowIso();
        tasks.push({
          id: newId(), text: body, description: '',
          done: done, createdAt: stamped, updatedAt: stamped,
          completedAt: done ? stamped : null,
          due: due, dueTime: '', prio: 0, projectId: pid,
          tags: taskTags(body), recurrence: null, order: tasks.length
        });
        added++;
      });
      if (added) { saveTasks(); renderView(); note('Added ' + added + ' tasks.'); }
      else note('No tasks found in pasted text.');
      updateBadge();
    }

    // Share via OS sheet; hide button where unsupported.
    if (!navigator.share) shareBtn.hidden = true;
    shareBtn.addEventListener('click', function () {
      const text = tasksAsText();
      if (!text) { note('Nothing to share yet.'); return; }
      navigator.share({ title: 'My To-Do List', text: text }).catch(function () { /* dismissed */ });
    });

    // Export versioned { version, tasks, projects }; import accepts v2 or legacy arrays.
    exportBtn.addEventListener('click', function () {
      const payload = { version: 2, tasks: tasks, projects: projects };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'todo-tasks.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    importBtn.addEventListener('click', function () { importFile.click(); });
    importFile.addEventListener('change', function () {
      const f = importFile.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(reader.result);
          // v2 object form.
          if (parsed && parsed.version === 2 && Array.isArray(parsed.tasks)) {
            if (!parsed.tasks.every(validTask)) throw new Error('bad shape');
            tasks = parsed.tasks.map(migrateTask);
            if (Array.isArray(parsed.projects)) {
              if (!parsed.projects.every(validProject)) throw new Error('bad projects');
              projects = parsed.projects.map(migrateProject);
              saveProjects();
            }
            sanitizeTaskProjects();
            saveTasks(); renderView(); note('Imported ' + tasks.length + ' tasks.');
          } else {
            // Legacy Phase 1 task-array backup.
            if (!Array.isArray(parsed) || !parsed.every(validTask)) throw new Error('bad shape');
            tasks = parsed.map(migrateTask);
            sanitizeTaskProjects();
            saveTasks(); renderView(); note('Imported ' + tasks.length + ' tasks.');
          }
        } catch (e) {
          note('Import failed — not a todo-tasks JSON file.');
        }
        importFile.value = '';
        updateBadge();
      };
      reader.readAsText(f);
    });

    // Reminders: foreground-only Notification on load when enabled.
    if (!('Notification' in window)) notifyBtn.hidden = true;
    else if (Notification.permission === 'granted' && localStorage.getItem('todo-remind') === 'on') {
      notifyBtn.setAttribute('aria-pressed', 'true');
      notifyBtn.textContent = 'Remind on';
      fireReminder();
    }
    notifyBtn.addEventListener('click', function () {
      if (Notification.permission === 'granted') {
        toggleRemind(localStorage.getItem('todo-remind') !== 'on');
      } else if (Notification.permission === 'denied') {
        note('Notifications blocked — enable in browser settings.');
      } else {
        Notification.requestPermission().then(function (p) {
          if (p === 'granted') { toggleRemind(true); fireReminder(); }
          else note('Reminders need notification permission.');
        });
      }
    });

    function toggleRemind(on) {
      localStorage.setItem('todo-remind', on ? 'on' : 'off');
      notifyBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      notifyBtn.textContent = on ? 'Remind on' : 'Remind';
      if (on) note('Reminders on — overdue/today ping on open.');
    }

    function dueSoonTasks() {
      return tasks.filter(function (t) {
        return !t.done && (dueStatus(t) === 'overdue' || dueStatus(t) === 'today');
      });
    }

    function fireReminder() {
      try {
        const due = dueSoonTasks();
        if (due.length) new Notification(due.length + ' tasks due', { body: due.slice(0, 3).map(function (t) { return t.text; }).join('\n') });
      } catch (e) { /* notifications best-effort */ }
    }

    // Help popover + global shortcuts (/ focus, ? help, j/k row nav).
    helpBtn.addEventListener('click', function () { helpPopover.togglePopover(); });
    document.addEventListener('keydown', function (event) {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) ||
        document.activeElement.isContentEditable;
      if (event.key === '/' && !typing) { event.preventDefault(); input.focus(); }
      else if (event.key === '?' && !typing) { helpPopover.togglePopover(); }
      else if ((event.key === 'j' || event.key === 'k') && !typing && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const rows = Array.prototype.slice.call(list.querySelectorAll('li[data-id]'));
        if (!rows.length) return;
        const item = document.activeElement.closest ? document.activeElement.closest('li[data-id]') : null;
        let at = rows.indexOf(item);
        at = event.key === 'j' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
        const btn = rows[at].querySelector('.edit-btn');
        if (btn) { event.preventDefault(); btn.focus(); }
      }
    });
    // --- Add a task (shared by the button and the Enter key) ---
    // Natural input: "report p1 friday +College #work" sets project too.
    function addTask() {
      const raw = input.value.trim(); // trim() ignores "   "-only input
      if (raw === '') return;         // do nothing on empty input

      const parsed = parseNatural(raw, dueInput.value);
      const stamped = nowIso();
      const pid = activeProjectId();
      tasks.push({
        id: newId(), text: parsed.text, description: '',
        done: false, createdAt: stamped, updatedAt: stamped, completedAt: null,
        due: parsed.due, dueTime: '', prio: parsed.prio,
        projectId: parsed.projectId !== undefined ? parsed.projectId : pid,
        tags: taskTags(parsed.text), recurrence: null, order: tasks.length
      });
      input.value = '';  // clear the box for the next task
      dueInput.value = ''; // clear the date too
      input.focus();     // keep the cursor ready for fast typing
      saveTasks();
      renderView();
    }

    // Tiny NLP: p1/p2/p3 priority + today/tomorrow/weekday/date words + +Project.
    function parseNatural(raw, pickedDue) {
      let text = raw;
      let prio = 0;
      const pm = text.match(/(?:^|\s)p([123])(?=\s|$)/i);
      if (pm) { prio = Number(pm[1]); text = text.replace(pm[0], ' '); }
      // +Project (case-insensitive, exact name match only — never auto-create).
      let projectId;
      const jm = text.match(/(?:^|\s)\+([\p{L}\p{N}_-]+)/u);
      if (jm) {
        const found = projects.filter(function (p) { return p.name.toLowerCase() === jm[1].toLowerCase(); })[0];
        if (found) { projectId = found.id; text = text.replace(jm[0], ' '); }
        // Unknown +Name stays as normal text (no silent creation from typos).
      }
      let due = pickedDue || '';
      if (!pickedDue) {
        const hit = parseDueWord(text.toLowerCase());
        if (hit) { due = hit.due; text = text.slice(0, hit.index) + ' ' + text.slice(hit.index + hit.length); }
      }
      text = text.replace(/\s+/g, ' ').trim();
      return { text: text, due: due, prio: prio, projectId: projectId };
    }

    function parseDueWord(lower) {
      const today = new Date();
      const iso = function (d) { return dayString(d); };
      const words = {
        today: 0, tonight: 0, tomorrow: 1, tmw: 1, tmorrow: 1,
        monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
        friday: 5, saturday: 6, sunday: 0,
        mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4,
        fri: 5, sat: 6, sun: 0
      };
      const names = Object.keys(words).sort(function (a, b) { return b.length - a.length; });
      for (const w of names) {
        const m = lower.match(new RegExp('(?:^|\\s)(' + w + ')(?=\\s|$)'));
        if (!m) continue;
        const d = new Date(today);
        if (w === 'today' || w === 'tonight' || w === 'tomorrow' || w === 'tmw' || w === 'tmorrow') {
          d.setDate(d.getDate() + (words[w] === 1 ? 1 : 0));
        } else {
          let delta = (words[w] - d.getDay() + 7) % 7;
          if (delta === 0) delta = 7; // next week, not today
          d.setDate(d.getDate() + delta);
        }
        return { due: iso(d), index: m.index + (m[0].startsWith(' ') ? 1 : 0), length: m[1].length };
      }
      // Explicit 2026-10-05 or 05/10 stays valid via isValidDue later.
      const dm = lower.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/);
      if (dm) return { due: dm[1], index: dm.index + (dm[0].startsWith(' ') ? 1 : 0), length: dm[1].length };
      return null;
    }

    // Sidebar views + projects + tag cloud + live search.
    document.querySelector('.sidebar').addEventListener('click', function (event) {
      if (event.target.closest('#project-add')) { openProjectModal(null); return; }
      const menuBtn = event.target.closest('.pmenu');
      if (menuBtn) {
        event.stopPropagation();
        openProjectModal(menuBtn.closest('.project-row').dataset.project, true);
        return;
      }
      const projBtn = event.target.closest('[data-project]');
      if (projBtn && !event.target.closest('.pmenu')) {
        setView('project:' + projBtn.dataset.project);
        return;
      }
      const viewBtn = event.target.closest('[data-view]');
      if (viewBtn) {
        setView(viewBtn.dataset.view);
        return;
      }
      const tagBtn = event.target.closest('[data-sidetag]');
      if (tagBtn) {
        activeTag = activeTag === tagBtn.dataset.sidetag ? '' : tagBtn.dataset.sidetag;
        renderView();
      }
      if (event.target.closest('#tags-head')) {
        const collapsed = document.getElementById('side-tags').hidden = !document.getElementById('side-tags').hidden;
        try { localStorage.setItem('todo-tags-collapsed', collapsed ? '1' : ''); } catch (e) {}
        document.querySelector('#tags-head .collapse-arrow').textContent = collapsed ? '▸' : '▾';
      }
    });

    searchInput.addEventListener('input', function () {
      search = searchInput.value.trim().toLowerCase();
      renderView();
    });

    addBtn.addEventListener('click', addTask);

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') addTask();
    });

    // --- Filter buttons ---
    document.querySelector('.filters').addEventListener('click', function (event) {
      const btn = event.target.closest('button');
      if (!btn) return;
      filter = btn.dataset.filter;
      document.querySelectorAll('.filters button').forEach(function (b) {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      renderView();
    });

    // --- Edit: ✎ swaps text for input; Enter/blur saves, Escape cancels ---
    function startEdit(item, id) {
      const task = getTaskById(id);
      if (!task) return;
      const span = item.querySelector('.task-text');
      const edit = document.createElement('input');
      edit.className = 'edit-input';
      edit.value = task.text;
      edit.setAttribute('aria-label', 'Edit task');
      span.replaceWith(edit);
      edit.focus();
      edit.setSelectionRange(edit.value.length, edit.value.length);
      let saved = false;
      const commit = function (save) {
        if (saved) return;
        saved = true;
        if (save) {
          const text = edit.value.trim();
          if (text !== '') updateTask(id, { text: text, tags: taskTags(text) });
          else saveTasks();
        }
        renderView();
        if (!save) input.focus();
      };
      edit.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') commit(true);
        else if (e.key === 'Escape') commit(false);
        e.stopPropagation(); // don't toggle complete while editing
      });
      edit.addEventListener('blur', function () { commit(true); });
      edit.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    function rowId(el) {
      const item = el && el.closest ? el.closest('li.task-row') : null;
      return item && item.dataset.id ? item.dataset.id : null;
    }

    // --- Toggle complete when the task text is clicked ---
    // --- Delete when the ✕ button is clicked ---
    // --- Otherwise open the details drawer ---
    // One listener on the <ul> handles every item (even future ones).
    list.addEventListener('click', function (event) {
      if (event.target.classList.contains('edit-input')) return;
      const chip = event.target.closest('.tag-chip');
      if (chip) {
        activeTag = activeTag === chip.dataset.tag ? '' : chip.dataset.tag;
        renderView();
        return;
      }
      const prioBtn = event.target.closest('.prio');
      if (prioBtn) {
        const pid = rowId(prioBtn);
        const pt = pid && getTaskById(pid);
        if (!pt) return;
        updateTask(pid, { prio: ((pt.prio || 0) + 1) % 4 }); // 0→1→2→3→0
        renderView();
        return;
      }
      const id = rowId(event.target);
      if (!id) return;
      const task = getTaskById(id);
      if (!task) return;
      const item = event.target.closest('li');

      if (event.target.classList.contains('delete-btn')) {
        deleteTask(id);
      } else if (event.target.closest('.move-btn')) {
        openRowMenu(event.target.closest('.move-btn'), id);
        return;
      } else if (event.target.closest('.edit-btn')) {
        startEdit(item, id);
        return; // no re-render; startEdit handles it
      } else if (event.target.type === 'checkbox') {
        const done = !task.done;
        updateTask(id, { done: done, completedAt: done ? nowIso() : null });
      } else if (event.target.closest('.due-badge')) {
        openDrawer(id, event.target);
        return; // drawer handles its own render
      } else if (event.target.closest('.task-text') && !event.target.closest('.tag-chip')) {
        openDrawer(id, item);
        return; // drawer handles its own render
      } else {
        openDrawer(id, event.target.closest('button') || item);
        return; // drawer handles its own render
      }
      saveTasks();
      renderView();
    });

    // --- Drag reorder: HTML5 DnD + keyboard (Alt+Arrow) ---
    list.addEventListener('dragstart', function (event) {
      const item = event.target.closest('li.task-row');
      if (!item || !item.dataset.id) return;
      dragId = item.dataset.id;
      event.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragover', function (event) {
      const item = event.target.closest('li.task-row');
      if (!item || !dragId) return;
      event.preventDefault(); // allow drop
      document.querySelectorAll('#task-list li.drag-over').forEach(function (el) {
        el.classList.remove('drag-over');
      });
      item.classList.add('drag-over');
    });

    list.addEventListener('drop', function (event) {
      const item = event.target.closest('li.task-row');
      if (!item || !dragId) return;
      event.preventDefault();
      moveTask(dragId, item.dataset.id);
      dragId = null;
    });

    list.addEventListener('dragend', function () {
      dragId = null;
      document.querySelectorAll('#task-list li.drag-over').forEach(function (el) {
        el.classList.remove('drag-over');
      });
    });

    // Keyboard reorder: Alt+Arrow moves focused row; focus restored post-render.
    list.addEventListener('keydown', function (event) {
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const id = rowId(event.target);
        if (!id) return;
        event.preventDefault();
        const from = getTaskIndexById(id);
        if (from < 0) return;
        const to = Math.max(0, Math.min(tasks.length - 1, from + (event.key === 'ArrowUp' ? -1 : 1)));
        if (to === from) return;
        moveTask(id, to, function () { focusRow(tasks[to].id); });
        return;
      }
      if (event.key === ' ' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const tag = event.target.tagName;
        if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag) || event.target.isContentEditable) return;
        const id = rowId(event.target);
        if (!id) return;
        const task = getTaskById(id);
        if (!task) return;
        event.preventDefault();
        const done = !task.done;
        updateTask(id, { done: done, completedAt: done ? nowIso() : null });
        saveTasks();
        renderView(function () { focusRow(id); });
        return;
      }
      if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const tag = event.target.tagName;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || event.target.isContentEditable) return;
        const id = rowId(event.target);
        if (id) { event.preventDefault(); openDrawer(id, event.target); }
      }
    });

    // Touch reorder: long-press handle (~400ms) then drag vertically.
    let touchDrag = null;
    let touchTimer = 0;
    let touchY = 0;
    list.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse') return;
      const handle = event.target.closest('.drag-handle');
      if (!handle) return;
      const id = rowId(handle);
      if (!id) return;
      touchY = event.clientY;
      clearTimeout(touchTimer);
      touchTimer = setTimeout(function () {
        touchDrag = id;
        const item = handle.closest('li');
        if (item) item.classList.add('drag-over');
        if (navigator.vibrate) { try { navigator.vibrate(20); } catch (e) {} }
      }, 400);
    });
    list.addEventListener('pointermove', function (event) {
      if (!touchDrag || event.pointerType === 'mouse') return;
      event.preventDefault();
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const over = el && el.closest ? el.closest('li[data-id]') : null;
      document.querySelectorAll('#task-list li.drag-over').forEach(function (row) {
        row.classList.remove('drag-over');
      });
      if (over) over.classList.add('drag-over');
      touchY = event.clientY;
    });
    function endTouchDrag(commit) {
      clearTimeout(touchTimer);
      if (!touchDrag) return;
      const el = document.elementFromPoint(window.innerWidth / 2, Math.max(0, touchY));
      const over = el && el.closest ? el.closest('li[data-id]') : null;
      const from = touchDrag;
      touchDrag = null;
      document.querySelectorAll('#task-list li.drag-over').forEach(function (row) {
        row.classList.remove('drag-over');
      });
      if (commit && over) moveTask(from, over.dataset.id);
    }
    list.addEventListener('pointerup', function () { endTouchDrag(true); });
    list.addEventListener('pointercancel', function () { endTouchDrag(false); });

    // App badge: open-task count when installed (Chromium-only, best-effort).
    function updateBadge() {
      try {
        if (!('setAppBadge' in navigator)) return;
        const open = tasks.filter(function (t) { return !t.done; }).length;
        if (open > 0) navigator.setAppBadge(open);
        else if ('clearAppBadge' in navigator) navigator.clearAppBadge();
      } catch (e) { /* badges best-effort */ }
    }

    function moveTask(from, to, after) {
      // ID form: moveTask(dragId, targetId[, after]) — after receives moved id.
      // Index form (legacy internal): moveTask(fromIndex, toIndex[, after]).
      if (typeof from === 'string') {
        const fi = getTaskIndexById(from);
        const ti = getTaskIndexById(to);
        if (fi < 0 || ti < 0 || fi === ti) return;
        const moved = tasks.splice(fi, 1)[0];
        tasks.splice(ti, 0, moved);
        moved.order = ti;
        saveTasks();
        renderView(function () { if (after) after(moved.id); });
        updateBadge();
        return;
      }
      if (typeof to === 'function') { after = to; to = from; }
      if (!Number.isInteger(from) || !Number.isInteger(to)) return;
      if (from < 0 || from >= tasks.length) return;
      to = Math.max(0, Math.min(tasks.length - 1, to));
      if (from === to) return;
      const moved = tasks.splice(from, 1)[0];
      tasks.splice(to, 0, moved);
      saveTasks();
      renderView(function () { if (after) after(moved.id); });
      updateBadge();
    }
    function dayString(date) {
      return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
    }

    // Returns one of: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later' | 'none'
    function isValidDue(due) {
      if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
      const y = Number(due.slice(0, 4));
      const m = Number(due.slice(5, 7));
      const d = Number(due.slice(8, 10));
      if (m < 1 || m > 12 || d < 1 || d > 31) return false;
      const dt = new Date(y, m - 1, d);
      return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    }

    function dueStatus(task) {
      if (!isValidDue(task.due)) return 'none';
      const today = dayString(new Date());
      if (task.due < today) return 'overdue';
      if (task.due === today) return 'today';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (task.due === dayString(tomorrow)) return 'tomorrow';
      const soon = new Date();
      soon.setDate(soon.getDate() + 3); // "soon" = next 3 days
      if (task.due <= dayString(soon)) return 'soon';
      return 'later';
    }

    function dueLabel(task) {
      if (!isValidDue(task.due)) return '';
      const status = dueStatus(task);
      // Show friendly words for near dates, short date otherwise.
      // "2026-09-30" -> "30 Sep" (slice avoids timezone-shifted Date parsing)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const short = task.due.slice(8, 10).replace(/^0/, '') + ' ' +
                    months[Number(task.due.slice(5, 7)) - 1];
      if (status === 'overdue') return 'Overdue · ' + short;
      if (status === 'today') return 'Today';
      if (status === 'tomorrow') return 'Tomorrow';
      if (status === 'soon') {
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dt = new Date(Number(task.due.slice(0, 4)),
          Number(task.due.slice(5, 7)) - 1, Number(task.due.slice(8, 10)));
        return weekdays[dt.getDay()] + ' · ' + short;
      }
      return short;
    }

    // --- Draw the list from the tasks array ---
    function render() {
      list.innerHTML = ''; // wipe and rebuild (simple + fine at this size)

      // --- Counter: computed from state each time, never stored ---
      const left = tasks.filter(function (task) { return !task.done; }).length;
      counter.textContent = tasks.length === 0
        ? ''
        : left === 0
          ? 'All done! 🎉'
          : left + (left === 1 ? ' task' : ' tasks') + ' left';

      const todayStr = dayString(new Date());
      const pid = activeProjectId();
      const visible = tasks
        .filter(function (task) {
          if (filter === 'active' && task.done) return false;
          if (filter === 'completed' && !task.done) return false;
          if (pid && task.projectId !== pid) return false;
          if (view === 'inbox' && task.projectId) return false;
          if (view === 'today' && !(task.due && task.due <= todayStr)) return false;
          if (view === 'upcoming' && !(task.due && task.due > todayStr)) return false;
          if (activeTag && taskTags(task.text).indexOf(activeTag) < 0) return false;
          if (search && task.text.toLowerCase().indexOf(search) < 0) return false;
          return true;
        });
      tagBar.classList.toggle('visible', activeTag !== '');
      if (activeTag) tagClear.textContent = activeTag + ' ✕';

      // Sidebar counts + projects + tag cloud.
      const open = tasks.filter(function (t) { return !t.done; });
      document.getElementById('count-inbox').textContent =
        open.filter(function (t) { return !t.projectId; }).length || '';
      document.getElementById('count-all').textContent = open.length || '';
      document.getElementById('count-today').textContent =
        open.filter(function (t) { return t.due && t.due <= todayStr; }).length || '';
      document.getElementById('count-upcoming').textContent =
        open.filter(function (t) { return t.due && t.due > todayStr; }).length || '';
      renderProjects();
      const tagCounts = {};
      tasks.forEach(function (t) {
        taskTags(t.text).forEach(function (tag) { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
      });
      const sideTags = document.getElementById('side-tags');
      sideTags.innerHTML = '';
      Object.keys(tagCounts).sort().forEach(function (tag) {
        const b = document.createElement('button');
        b.dataset.sidetag = tag;
        b.textContent = tag + ' (' + tagCounts[tag] + ')';
        if (tag === activeTag) b.classList.add('active');
        sideTags.append(b);
      });
      try {
        if (localStorage.getItem('todo-tags-collapsed')) {
          sideTags.hidden = true;
          document.querySelector('#tags-head .collapse-arrow').textContent = '▸';
        }
      } catch (e) {}

      // Grouped headers in All/Inbox view: Overdue/Today/Upcoming/No date.
      const grouped = (view === 'all' || view === 'inbox' || pid) && !search && !activeTag;
      const groups = grouped
        ? [['Overdue', function (t) { return dueStatus(t) === 'overdue'; }],
           ['Today', function (t) { return dueStatus(t) === 'today' || dueStatus(t) === 'tomorrow'; }],
           ['Upcoming', function (t) { return dueStatus(t) === 'soon' || dueStatus(t) === 'later'; }],
           ['No date', function (t) { return dueStatus(t) === 'none'; }]]
        : [[projectTitle(), function () { return true; }]];

      if (!visible.length) {
        list.innerHTML = '<li class="empty-message">' + emptyMessage() + '</li>';
        syncDrawer();
        return;
      }

      groups.forEach(function (group) {
        const rows = visible.filter(function (task) { return group[1](task); });
        if (!rows.length) return;
        const head = document.createElement('li');
        head.className = 'group-head';
        head.textContent = group[0] + ' (' + rows.length + ')';
        head.setAttribute('aria-hidden', 'true');
        list.append(head);
        rows.forEach(function (task) {
          list.append(buildRow(task));
        });
      });

      syncDrawer();
    }

    function projectTitle() {
      const pid = activeProjectId();
      if (pid) {
        const p = getProjectById(pid);
        return p ? p.icon + ' ' + p.name : 'Tasks';
      }
      if (view === 'inbox') return 'Inbox';
      if (view === 'today') return 'Due now';
      if (view === 'upcoming') return 'Upcoming';
      return 'Tasks';
    }

    function emptyMessage() {
      if (view === 'inbox') return 'Your inbox is empty. Add a task above!';
      const pid = activeProjectId();
      if (pid) {
        const p = getProjectById(pid);
        return 'No tasks in ' + (p ? p.name : 'this project') + ' yet. Add one above!';
      }
      if (!projects.length && !tasks.length) return 'No tasks yet — try “Buy milk #home” with a due date!';
      return 'Nothing here — try another filter.';
    }

    function renderProjects() {
      const wrap = document.getElementById('side-projects');
      wrap.innerHTML = '';
      if (!projects.length) {
        wrap.innerHTML = '<p class="project-empty">No projects yet.</p>';
        return;
      }
      projects.forEach(function (p) {
        const b = document.createElement('div');
        b.className = 'project-row' + (view === 'project:' + p.id ? ' active' : '');
        b.dataset.project = p.id;
        b.setAttribute('role', 'button');
        b.setAttribute('tabindex', '0');
        if (view === 'project:' + p.id) b.setAttribute('aria-current', 'page');
        b.draggable = true;
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.setProperty('--dot', p.color);
        dot.textContent = p.icon;
        dot.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'pname';
        name.textContent = p.name;
        name.title = p.name;
        const count = document.createElement('span');
        count.className = 'count';
        const n = getProjectTaskCount(p.id);
        if (n) count.textContent = n;
        const menu = document.createElement('button');
        menu.className = 'pmenu';
        menu.textContent = '⋯';
        menu.setAttribute('aria-label', 'Project options for ' + p.name);
        b.append(dot, name, count, menu);
        wrap.append(b);
      });
    }

    function buildRow(task) {
        const item = document.createElement('li');
        item.classList.add('task-row');
        if (task.done) item.classList.add('completed');
        item.classList.add('due-' + dueStatus(task)); // color stripe
        item.dataset.id = task.id; // stable identity for clicks
        item.draggable = true;

        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.textContent = '⠿';
        handle.setAttribute('aria-hidden', 'true');

        const prio = document.createElement('button');
        prio.type = 'button';
        prio.className = 'prio';
        prio.dataset.prio = task.prio || 0;
        prio.title = 'Priority' + (task.prio ? ' P' + task.prio : ' (click to set)');
        prio.setAttribute('aria-label', 'Cycle priority for ' + task.text);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.done;
        checkbox.setAttribute('aria-label', 'Mark ' + task.text + (task.done ? ' active' : ' done'));

        const body = document.createElement('div');
        body.className = 'task-body';

        const span = document.createElement('span');
        span.className = 'task-text';
        renderTextWithTags(span, task.text); // #tags become clickable chips
        body.append(span);

        const meta = buildMeta(task);
        if (meta) body.append(meta);

        item.append(handle, prio, checkbox, body);

        const actions = document.createElement('div');
        actions.className = 'row-actions';

        const moveBtn = document.createElement('button');
        moveBtn.className = 'edit-btn move-btn';
        moveBtn.textContent = '→';
        moveBtn.title = 'Move to project';
        moveBtn.setAttribute('aria-label', 'Move ' + task.text + ' to project');

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✎';
        editBtn.setAttribute('aria-label', 'Edit ' + task.text);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '✕';
        delBtn.setAttribute('aria-label', 'Delete ' + task.text);

        actions.append(moveBtn, editBtn, delBtn);
        item.append(actions);
        return item;
    }

    // Quiet metadata line: only chips that exist (date/time/project/tags/recurrence/progress).
    function buildMeta(task) {
        const parts = [];
        if (isValidDue(task.due)) {
          parts.push({ kind: 'badge', text: dueLabel(task) + (task.dueTime ? ' ' + task.dueTime : ''),
            title: task.due + (task.dueTime ? ' ' + task.dueTime : '') });
        }
        if (task.projectId) {
          const p = getProjectById(task.projectId);
          if (p) parts.push({ kind: 'project', text: p.icon + ' ' + p.name, color: p.color });
        }
        (task.tags || taskTags(task.text)).forEach(function (tag) {
          parts.push({ kind: 'tag', text: tag, tag: tag });
        });
        if (task.recurrence) parts.push({ kind: 'recur', text: '↻ ' + task.recurrence });
        const subs = subtaskProgress(task);
        if (subs) parts.push({ kind: 'subs', text: subs });
        if (!parts.length) return null;
        const meta = document.createElement('div');
        meta.className = 'task-meta';
        parts.forEach(function (part) {
          let el;
          if (part.kind === 'tag') {
            el = document.createElement('button');
            el.type = 'button';
            el.className = 'tag-chip meta-chip';
            el.textContent = part.text;
            el.dataset.tag = part.tag;
          } else {
            el = document.createElement('span');
            el.className = 'due-badge meta-chip meta-' + part.kind;
            el.textContent = part.text;
            if (part.title) el.title = part.title;
            if (part.color) el.style.setProperty('--meta-dot', part.color);
          }
          meta.append(el);
        });
        return meta;
    }

    // Placeholder until subtasks land: reads task.subtasks if present.
    function subtaskProgress(task) {
      if (!Array.isArray(task.subtasks) || !task.subtasks.length) return '';
      const done = task.subtasks.filter(function (s) { return s.done; }).length;
      return done + '/' + task.subtasks.length;
    }

    // --- Task details drawer (autosave, debounced for text) ---
    const drawer = document.getElementById('drawer');
    const scrim = document.getElementById('scrim');
    const drawerClose = document.getElementById('drawer-close');
    const dTitle = document.getElementById('drawer-title-input');
    const dDesc = document.getElementById('drawer-desc');
    const dDue = document.getElementById('drawer-due');
    const dTime = document.getElementById('drawer-time');
    const dPrio = document.getElementById('drawer-prio');
    const dDone = document.getElementById('drawer-done');
    const dTags = document.getElementById('drawer-tags');
    const dProject = document.getElementById('drawer-project');
    let descTimer = 0;

    dTitle.addEventListener('change', function () {
      if (!openTaskId) return;
      const text = dTitle.value.trim();
      if (!text) { syncDrawer(); return; } // keep old title on empty
      updateTask(openTaskId, { text: text, tags: taskTags(text) });
      renderView();
    });
    dTitle.addEventListener('keydown', function (e) { e.stopPropagation(); });
    dDesc.addEventListener('input', function () {
      if (!openTaskId) return;
      clearTimeout(descTimer);
      const value = dDesc.value;
      descTimer = setTimeout(function () {
        updateTask(openTaskId, { description: value });
      }, 400);
    });
    dDesc.addEventListener('keydown', function (e) { e.stopPropagation(); });
    dDue.addEventListener('change', function () {
      if (!openTaskId) return;
      updateTask(openTaskId, { due: isValidDue(dDue.value) || dDue.value === '' ? dDue.value : getTaskById(openTaskId).due });
      renderView();
    });
    dDue.addEventListener('keydown', function (e) { e.stopPropagation(); });
    dTime.addEventListener('change', function () {
      if (!openTaskId) return;
      updateTask(openTaskId, { dueTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(dTime.value) || dTime.value === '' ? dTime.value : '' });
      renderView();
    });
    dTime.addEventListener('keydown', function (e) { e.stopPropagation(); });
    dPrio.addEventListener('change', function () {
      if (!openTaskId) return;
      updateTask(openTaskId, { prio: Number(dPrio.value) || 0 });
      renderView();
    });
    dDone.addEventListener('change', function () {
      if (!openTaskId) return;
      const done = dDone.checked;
      updateTask(openTaskId, { done: done, completedAt: done ? nowIso() : null });
      renderView();
    });
    dTags.addEventListener('change', function () {
      if (!openTaskId) return;
      const tags = (dTags.value.match(/#[\p{L}\p{N}_-]+/gu) || []).map(function (t) { return t.toLowerCase(); });
      const task = getTaskById(openTaskId);
      if (!task) return;
      // Merge drawer tags into title text (keep #tag syntax as source of truth).
      let text = task.text;
      tags.forEach(function (tag) {
        if (taskTags(text).indexOf(tag) < 0) text += ' ' + tag;
      });
      updateTask(openTaskId, { text: text, tags: taskTags(text) });
      renderView();
    });
    dTags.addEventListener('keydown', function (e) { e.stopPropagation(); });
    dProject.addEventListener('change', function () {
      if (!openTaskId) return;
      updateTask(openTaskId, { projectId: dProject.value || null });
      renderView(); // drawer stays open on moved task; list updates underneath
    });
    dProject.addEventListener('keydown', function (e) { e.stopPropagation(); });
    drawerClose.addEventListener('click', closeDrawer);
    scrim.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && openTaskId) {
        if (event.target.classList && event.target.classList.contains('edit-input')) return;
        closeDrawer();
      }
    });

    function openDrawer(id, returnFocus) {
      const task = getTaskById(id);
      if (!task) return;
      openTaskId = id;
      drawerReturnFocus = returnFocus && returnFocus.focus ? returnFocus : document.activeElement;
      syncDrawer();
      drawer.hidden = false;
      scrim.hidden = false;
      document.body.style.overflow = 'hidden';
      dTitle.focus();
      dTitle.setSelectionRange(dTitle.value.length, dTitle.value.length);
    }

    function closeDrawer() {
      openTaskId = null;
      clearTimeout(descTimer);
      drawer.hidden = true;
      scrim.hidden = true;
      document.body.style.overflow = '';
      if (drawerReturnFocus && drawerReturnFocus.focus) {
        try { drawerReturnFocus.focus(); } catch (e) {}
      }
      drawerReturnFocus = null;
    }

    // Refresh drawer fields from current task (or close if deleted).
    function syncDrawer() {
      if (!openTaskId) return;
      const task = getTaskById(openTaskId);
      if (!task) { closeDrawer(); renderView(); return; }
      if (document.activeElement !== dTitle) dTitle.value = task.text;
      if (document.activeElement !== dDesc) dDesc.value = task.description || '';
      if (document.activeElement !== dDue) dDue.value = task.due || '';
      if (document.activeElement !== dTime) dTime.value = task.dueTime || '';
      if (document.activeElement !== dPrio) dPrio.value = String(task.prio || 0);
      if (document.activeElement !== dDone) dDone.checked = !!task.done;
      if (document.activeElement !== dTags) dTags.value = (task.tags || taskTags(task.text)).join(' ');
      if (document.activeElement !== dProject) {
        dProject.innerHTML = '';
        const inbox = document.createElement('option');
        inbox.value = '';
        inbox.textContent = '📥 Inbox';
        dProject.append(inbox);
        projects.forEach(function (p) {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.icon + ' ' + p.name;
          dProject.append(o);
        });
        dProject.value = task.projectId || '';
        if (task.projectId && !getProjectById(task.projectId)) dProject.value = '';
      }
    }

    // --- Project modal (create / rename / color / icon / delete) ---
    const projectScrim = document.getElementById('project-scrim');
    const projectModal = document.getElementById('project-modal');
    const projectModalTitle = document.getElementById('project-modal-title');
    const projectName = document.getElementById('project-name');
    const projectColors = document.getElementById('project-colors');
    const projectIcons = document.getElementById('project-icons');
    const projectSave = document.getElementById('project-save');
    const projectCancel = document.getElementById('project-cancel');
    const projectDelete = document.getElementById('project-delete');
    const projectDeleteNote = document.getElementById('project-delete-note');
    const projectDeleteActions = document.getElementById('project-delete-actions');
    const projectDeleteInbox = document.getElementById('project-delete-inbox');
    const projectDeleteCancel = document.getElementById('project-delete-cancel');
    let editingProjectId = null;
    let pickedColor = PROJECT_COLORS[3];
    let pickedIcon = PROJECT_ICONS[0];

    function paintSwatches() {
      projectColors.innerHTML = '';
      PROJECT_COLORS.forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.background = c;
        b.setAttribute('aria-label', 'Color ' + c);
        b.setAttribute('aria-pressed', c === pickedColor ? 'true' : 'false');
        b.addEventListener('click', function () { pickedColor = c; paintSwatches(); });
        projectColors.append(b);
      });
      projectIcons.innerHTML = '';
      PROJECT_ICONS.forEach(function (icon) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = icon;
        b.setAttribute('aria-label', 'Icon ' + icon);
        b.setAttribute('aria-pressed', icon === pickedIcon ? 'true' : 'false');
        b.addEventListener('click', function () { pickedIcon = icon; paintSwatches(); });
        projectIcons.append(b);
      });
    }

    function openProjectModal(id, manage) {
      editingProjectId = id;
      const p = id && getProjectById(id);
      projectModalTitle.textContent = p ? 'Edit project' : 'New project';
      projectName.value = p ? p.name : '';
      pickedColor = p ? p.color : PROJECT_COLORS[3];
      pickedIcon = p ? p.icon : PROJECT_ICONS[0];
      paintSwatches();
      const hasTasks = p && tasks.some(function (t) { return t.projectId === p.id; });
      projectDelete.hidden = !p;
      projectDeleteNote.hidden = true;
      projectDeleteActions.hidden = true;
      projectModal.hidden = false;
      projectScrim.hidden = false;
      projectName.focus();
      if (manage) projectName.select();
    }

    function closeProjectModal() {
      projectModal.hidden = true;
      projectScrim.hidden = true;
      editingProjectId = null;
    }

    projectSave.addEventListener('click', function () {
      const name = projectName.value.trim();
      if (!name) { projectName.focus(); return; }
      if (editingProjectId) {
        updateProject(editingProjectId, { name: name, color: pickedColor, icon: pickedIcon });
      } else {
        const p = createProject({ name: name, color: pickedColor, icon: pickedIcon });
        setView('project:' + p.id);
      }
      closeProjectModal();
      renderView();
    });
    projectName.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') projectSave.click();
      else if (e.key === 'Escape') closeProjectModal();
    });
    projectCancel.addEventListener('click', closeProjectModal);
    projectScrim.addEventListener('click', closeProjectModal);
    projectDelete.addEventListener('click', function () {
      const p = editingProjectId && getProjectById(editingProjectId);
      if (!p) return;
      const n = getProjectTaskCount(p.id);
      projectDeleteNote.hidden = false;
      projectDeleteNote.textContent = n
        ? n + ' open tasks will move to Inbox. Delete “' + p.name + '”?'
        : 'Delete “' + p.name + '”? Tasks already in Inbox are unaffected.';
      projectDeleteActions.hidden = false;
    });
    projectDeleteCancel.addEventListener('click', function () {
      projectDeleteNote.hidden = true;
      projectDeleteActions.hidden = true;
    });
    projectDeleteInbox.addEventListener('click', function () {
      if (editingProjectId) deleteProject(editingProjectId);
      closeProjectModal();
      renderView();
    });
    // Sidebar project DnD reorder (drag handle = whole row; tasks unaffected).
    document.getElementById('side-projects').addEventListener('dragstart', function (event) {
      const row = event.target.closest('.project-row');
      if (!row) return;
      event.dataTransfer.setData('text/project-id', row.dataset.project);
      event.dataTransfer.effectAllowed = 'move';
    });
    document.getElementById('side-projects').addEventListener('dragover', function (event) {
      const row = event.target.closest('.project-row');
      if (!row) return;
      event.preventDefault();
    });
    document.getElementById('side-projects').addEventListener('drop', function (event) {
      const row = event.target.closest('.project-row');
      const id = event.dataTransfer.getData('text/project-id');
      if (!row || !id) return;
      event.preventDefault();
      moveProject(id, row.dataset.project);
      renderView();
    });

    // Row quick-move menu (⋯ on hover): Inbox + projects.
    let rowMenuEl = null;
    function openRowMenu(anchor, id) {
      closeRowMenu();
      rowMenuEl = document.createElement('div');
      rowMenuEl.className = 'rowmenu';
      const add = function (label, pid) {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', function () {
          updateTask(id, { projectId: pid });
          closeRowMenu();
          renderView();
        });
        rowMenuEl.append(b);
      };
      add('📥 Inbox', null);
      projects.forEach(function (p) { add(p.icon + ' ' + p.name, p.id); });
      document.body.append(rowMenuEl);
      const r = anchor.getBoundingClientRect();
      rowMenuEl.style.left = Math.min(window.innerWidth - 210, r.left) + 'px';
      rowMenuEl.style.top = (r.bottom + 6) + 'px';
      setTimeout(function () {
        document.addEventListener('click', closeRowMenu, { once: true });
      }, 0);
    }
    function closeRowMenu() {
      if (rowMenuEl) { rowMenuEl.remove(); rowMenuEl = null; }
    }
    // localStorage only stores strings, so we convert with JSON.
    function saveTasks() {
      try {
        localStorage.setItem('todo-tasks', JSON.stringify(tasks));
      } catch (e) {
        counter.textContent = 'Could not save — storage full or blocked. Changes kept for this session.';
      }
      updateBadge();
    }

    function validTask(task) {
      if (!task || typeof task.text !== 'string' || typeof task.done !== 'boolean') return false;
      if ('due' in task && typeof task.due !== 'string') return false;
      if ('prio' in task && [0, 1, 2, 3].indexOf(task.prio) < 0) return false;
      if ('id' in task && typeof task.id !== 'string') return false;
      if ('dueTime' in task && typeof task.dueTime !== 'string') return false;
      if ('description' in task && typeof task.description !== 'string') return false;
      return true;
    }

    function migrateTask(raw, index) {
      const stamped = raw.createdAt || nowIso();
      const text = typeof raw.text === 'string' ? raw.text : '';
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
        text: text,
        description: typeof raw.description === 'string' ? raw.description : '',
        done: !!raw.done,
        createdAt: stamped,
        updatedAt: raw.updatedAt || stamped,
        completedAt: raw.completedAt || (raw.done ? stamped : null),
        due: typeof raw.due === 'string' ? raw.due : '',
        dueTime: typeof raw.dueTime === 'string' ? raw.dueTime : '',
        prio: [0, 1, 2, 3].indexOf(raw.prio) >= 0 ? raw.prio : 0,
        projectId: typeof raw.projectId === 'string' ? raw.projectId : null,
        tags: Array.isArray(raw.tags) ? raw.tags : taskTags(text),
        recurrence: raw.recurrence || null,
        order: typeof raw.order === 'number' ? raw.order : index
      };
    }

    function loadTasks() {
      const saved = localStorage.getItem('todo-tasks');
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(validTask)) throw new Error('bad shape');
        tasks = parsed.map(migrateTask); // IDs, order, new fields; order preserved
        try { localStorage.setItem('todo-tasks', JSON.stringify(tasks)); } catch (q) { /* keep going */ }
      } catch (e) {
        try { localStorage.setItem('todo-tasks-corrupt', saved); } catch (q) { /* keep going */ }
        tasks = []; // corrupted data? start fresh rather than crash
      }
    }
