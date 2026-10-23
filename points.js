// Points wallet: pure state logic, no DOM. app.js handles rendering.
// ponytail: flat 10/task + daily cap; add streaks only if they change behavior.
(function (root) {
  const KEY = 'todo-points';
  const PER_TASK = 10;
  const DAILY_CAP = 100;
  const ITEMS = [
    { id: 'sunset', name: 'Sunset', cost: 30, color: 'oklch(0.62 0.19 32)' },
    { id: 'forest', name: 'Forest', cost: 30, color: 'oklch(0.55 0.14 155)' },
    { id: 'grape', name: 'Grape', cost: 60, color: 'oklch(0.55 0.19 300)' },
    { id: 'gold', name: 'Gold', cost: 99, color: 'oklch(0.60 0.14 85)' }
  ];

  function dayKey(date) {
    const d = date || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function defaults() {
    return { points: 0, owned: [], equipped: null, awarded: [], day: dayKey(), earnedToday: 0 };
  }

  function intIn(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max ? value : null;
  }

  // Accepts anything (old save, corrupt JSON) and returns a valid wallet.
  function normalize(raw) {
    const w = defaults();
    if (!raw || typeof raw !== 'object') return w;
    const pts = intIn(raw.points, 0, 1000000);
    if (pts !== null) w.points = pts;
    if (Array.isArray(raw.owned)) {
      w.owned = raw.owned.filter(function (id, i, arr) {
        return ITEMS.some(function (it) { return it.id === id; }) && arr.indexOf(id) === i;
      });
    }
    if (typeof raw.equipped === 'string' && w.owned.indexOf(raw.equipped) >= 0) w.equipped = raw.equipped;
    if (Array.isArray(raw.awarded)) {
      w.awarded = raw.awarded.filter(function (id) { return typeof id === 'string'; }).slice(-5000);
    }
    if (typeof raw.day === 'string') {
      w.day = raw.day;
      const today = intIn(raw.earnedToday, 0, DAILY_CAP);
      if (today !== null) w.earnedToday = today;
    }
    return w;
  }

  // Returns points gained. Same task id never awards twice; cap resets per local day.
  function award(w, taskId, now) {
    if (!w || typeof taskId !== 'string' || !taskId) return 0;
    if (w.awarded.indexOf(taskId) >= 0) return 0;
    const day = dayKey(now);
    if (w.day !== day) {
      w.day = day;
      w.earnedToday = 0;
    }
    const left = DAILY_CAP - w.earnedToday;
    if (left <= 0) return 0;
    const gain = Math.min(PER_TASK, left);
    w.points += gain;
    w.earnedToday += gain;
    w.awarded.push(taskId);
    return gain;
  }

  function itemById(id) {
    return ITEMS.find(function (it) { return it.id === id; }) || null;
  }

  function redeem(w, itemId) {
    const item = itemById(itemId);
    if (!item) return { ok: false, reason: 'unknown' };
    if (w.owned.indexOf(itemId) >= 0) return { ok: false, reason: 'owned' };
    if (w.points < item.cost) return { ok: false, reason: 'funds', missing: item.cost - w.points };
    w.points -= item.cost;
    w.owned.push(itemId);
    return { ok: true, item: item };
  }

  function equip(w, itemId) {
    if (!w || w.owned.indexOf(itemId) < 0) return false;
    w.equipped = itemId;
    return true;
  }

  const api = {
    KEY: KEY, PER_TASK: PER_TASK, DAILY_CAP: DAILY_CAP, ITEMS: ITEMS,
    dayKey: dayKey, defaults: defaults, normalize: normalize,
    award: award, redeem: redeem, equip: equip, itemById: itemById
  };
  root.Points = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
