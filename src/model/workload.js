// The workload (M9): how many hours each person is asked for, day by day, against the hours they
// have, and a levelling plan that moves tasks later, inside their slack, until nobody is over.
// Pure: tests/workload.test.mjs.
//
// What a task asks for
//   With an hours column (the Effort role): its hours, spread evenly over the task's working days and
//   split evenly between its people. A column whose name says days (person-days, Personentage, jours)
//   counts whole days of hoursPerDay. A task left empty in that column asks for nothing, and is counted
//   as "without hours" so the view can say so.
//   Without an hours column: each task takes a full normal day of each of its people, every working
//   day it spans. That is the usual planning assumption, and the view says it is one.
//   Done tasks and parent tasks (their children carry the work) ask for nothing. A milestone asks for
//   its hours on its day, and for nothing when there are no hours. A task that falls only on days
//   off (a weekend market) asks for its hours on those days, which have no capacity.
//
// What a person has
//   hoursPerDay on each working day (no weekend, public holiday or day of the holidays table), scaled
//   by the person's capacity column when there is one: hours per week (20 of a 40-hour week is half),
//   or a share (0.5, or 50 %). A day off of their own (a holidays-table row naming them) has nothing.
//
// Over capacity: a person-day with more hours than the person has, by more than a minute or so.
//
// Logged and remaining (from the time entries, model/time.js)
//   measure 'logged': the hours of the time entries, on their day, for the person who logged them. An
//   entry that names nobody counts for the task's people, split evenly.
//   measure 'remaining': each task's hours less the time logged on it, spread over its working days from
//   today on. Time a person logged comes off their own share; time logged by someone else, or by nobody,
//   comes off every share evenly. A task that should have ended and is not done asks for what is left on
//   the first working day from today, and says it is late. Without an hours column there is nothing to
//   take logged time from, so what remains is the plan from today on. Days before today have no capacity.

import { laneKeysOf, lanesOf, NONE } from './lanes.js';
import { num } from './values.js';
import { norm } from './roles.js';

export const WL_UNITS = ['day', 'week', 'month'];
export const WL_MEASURES = ['planned', 'logged', 'remaining'];
export const EPS = 0.02;          // hours; 7.9999 is not an overload
const MAX_DAYS = 1500;            // about four years of days per person
const WEEK_WORKDAYS = 5;

// ---- the columns -----------------------------------------------------------------------------------

/** Hours or person-days: the setting, else what the column's name says. */
export function effortUnitOf(col, setting = 'auto') {
  if (setting === 'hours' || setting === 'days') return setting;
  if (!col) return 'hours';
  const name = ` ${norm(col.id)} ${norm(col.label)} `;
  return /\s(days?|tage|personentage|manntage|jours|jh|pd|md|pt)\s/.test(name) ? 'days' : 'hours';
}

// Words that name a person's capacity, on the people table.
const CAP_WORDS = ['capacity', 'hours per week', 'weekly hours', 'hours week', 'hours a week', 'availability', 'available hours',
  'fte', 'contract hours', 'kapazitat', 'kapazitaet', 'wochenstunden', 'stunden pro woche', 'arbeitszeit', 'vertragsstunden',
  'verfugbarkeit', 'verfuegbarkeit', 'beschaftigungsgrad', 'beschaeftigungsgrad', 'capacite', 'heures par semaine', 'heures semaine',
  'heures hebdo', 'disponibilite', 'etp', 'quotite', 'temps de travail'];
const SHARE = /%|\b(fte|etp|share|anteil|grad|beschaftigungsgrad|beschaeftigungsgrad|quotite|percent|prozent|pourcentage)\b/;

/** The people table's capacity column, guessed from its name: {id, mode: 'hours' | 'share'} or null. */
export function detectCapacity(columns) {
  for (const c of columns) {
    if (c.kind !== 'Numeric' && c.kind !== 'Int') continue;
    const names = [norm(c.id), norm(c.label)];
    if (!names.some((n) => CAP_WORDS.some((w) => ` ${n} `.includes(` ${w} `)))) continue;
    return { id: c.id, mode: capacityMode(c) };
  }
  return null;
}

/** How a capacity column is meant: a share of a full week when its name or its format says so. */
export function capacityMode(col, values = []) {
  const name = `${norm(col.id)} ${norm(col.label)}`;
  if (SHARE.test(name) || col.numMode === 'percent') return 'share';
  // 0.5 and 1 in a column called Capacity are shares, not hours a week
  const v = values.map(num).filter((x) => x != null);
  return v.length && v.every((x) => x <= 1.5) ? 'share' : 'hours';
}

/** A person's hours on a working day, from their capacity cell. An empty cell is a full day. */
export function capacityPerDay(cell, mode, hoursPerDay) {
  const v = num(cell);
  if (v == null || v < 0) return hoursPerDay;
  if (mode === 'share') return hoursPerDay * (v > 1.5 ? v / 100 : v);
  return v / WEEK_WORKDAYS;
}

// ---- the load ---------------------------------------------------------------------------------------

/** The working days of a span; a span with none (a weekend market) works on all its days. */
export function workDaysOf(start, end, isWork) {
  const out = [];
  for (let d = start; d <= end && out.length < MAX_DAYS; d++) if (isWork(d)) out.push(d);
  if (out.length) return out;
  for (let d = start; d <= end && out.length < MAX_DAYS; d++) out.push(d);
  return out;
}

/**
 * What one task asks of each of its people.
 * @returns {{keys: string[], total: number|null, perDay(key, days) -> hours}}  total: hours per person, null without hours
 */
function demandOf(task, row, ctx) {
  const { personCol, effortCol, effortUnit, hoursPerDay, capacity } = ctx;
  const keys = laneKeysOf(row[personCol.id], personCol);
  const people = keys.filter((k) => k !== NONE).length || 1;
  if (effortCol) {
    const e = num(row[effortCol.id]);
    const total = e != null && e > 0 ? (effortUnit === 'days' ? e * hoursPerDay : e) / people : null;
    // an empty cell on a milestone is not missing work: a milestone is a point in time
    return { keys, total, missing: total == null && task.kind !== 'milestone', perDay: (key, days) => (total == null ? 0 : total / Math.max(1, days.length)) };
  }
  // No hours anywhere: a milestone is a point in time, any other task a person's whole normal day.
  const full = (key) => (task.kind === 'milestone' ? 0 : key === NONE ? hoursPerDay : capacity.get(key) ?? hoursPerDay);
  return { keys, total: null, missing: false, perDay: (key) => full(key) };
}

/** A task's working days from today on; null when it should have ended (or has no working day left). */
function daysLeft(task, today, isWork) {
  if (task.start >= today) return workDaysOf(task.start, task.end, isWork);
  if (task.end < today) return null;
  const left = workDaysOf(task.start, task.end, isWork).filter((x) => x >= today);
  return left.length ? left : null;
}
const firstWorkDay = (day, isWork) => { let x = day; for (let i = 0; i < 31 && !isWork(x); i++) x++; return x; };

/** Logged hours by task and person: Map(task -> Map(key | null -> hours)). */
function loggedBy(logs) {
  const out = new Map();
  for (const l of logs) {
    if (!(l.hours > 0)) continue;
    if (!out.has(l.task)) out.set(l.task, new Map());
    const m = out.get(l.task), k = l.key ?? null;
    m.set(k, (m.get(k) || 0) + l.hours);
  }
  return out;
}

/**
 * @param tasks  tasks from buildTasks (undated ones ask nothing, but time logged on them counts)
 * @param rows   the task rows
 * @param ctx {personCol, labels, isWork(day), from, to, hoursPerDay, effortCol, effortUnit,
 *             capacity: Map(key -> hours on a working day), daysOff: Map(key -> Set(day)), keep: Set of keys | null,
 *             measure: 'planned' | 'logged' | 'remaining', logs: [{task, key (a row key, null for nobody), day, hours}], today}
 * @returns {{people, from, to, overs: Array<{key, day}>, missing: number}}
 *   person: {key, label, value, colour, none, perDay (hours on a normal working day; null for "no one"),
 *            items: [{task, hours (a day), days, late?}], load: Float64Array, cap: Float64Array | null}
 *   missing: tasks that ask for nothing because their hours are empty
 */
export function buildWorkload(tasks, rows, ctx) {
  const { personCol, labels = {}, isWork, hoursPerDay = 8, capacity = new Map(), daysOff = new Map(), keep = null, logs = [] } = ctx;
  const measure = WL_MEASURES.includes(ctx.measure) ? ctx.measure : 'planned';
  const from = ctx.from;
  const today = ctx.today ?? from;
  const to = Math.min(ctx.to, from + MAX_DAYS - 1);
  const n = Math.max(0, to - from + 1);
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const parents = new Set(tasks.map((x) => x.parentId).filter((x) => x != null));
  const lanes = lanesOf(personCol, rows, labels);
  if (measure === 'logged') {
    // someone who logged time but has no task of their own still gets a row
    const known = new Set(lanes.map((l) => l.key));
    for (const l of logs) if (l.key && !known.has(l.key)) { known.add(l.key); lanes.push({ key: l.key, label: l.key.slice(2), value: null, colour: null, none: false }); }
  }
  const people = lanes
    .filter((l) => l.none || !keep || keep.has(l.key))
    .map((l) => ({ ...l, perDay: l.none ? null : capacity.get(l.key) ?? hoursPerDay, items: [], load: new Float64Array(n), cap: null }));
  const byKey = new Map(people.map((p) => [p.key, p]));
  const c = { ...ctx, hoursPerDay, capacity };
  let missing = 0;
  if (measure === 'logged') {
    const taskOf = new Map(tasks.map((x) => [x.id, x]));
    for (const l of logs) {
      if (l.day == null || l.day < from || l.day > to || !(l.hours > 0)) continue;
      const task = taskOf.get(l.task) || { id: l.task, title: null, index: Infinity };
      const row = rowOf.get(l.task);
      const keys = l.key ? [l.key] : row ? laneKeysOf(row[personCol.id], personCol) : [NONE];
      for (const key of keys) {
        const p = byKey.get(key);
        if (!p) continue;
        const hours = l.hours / keys.length;
        p.items.push({ task, hours, days: [l.day] });
        p.load[l.day - from] += hours;
      }
    }
  } else {
    const logged = measure === 'remaining' && c.effortCol ? loggedBy(logs) : null;
    for (const task of tasks) {
      if (task.start == null || task.done || parents.has(task.id)) continue;
      const row = rowOf.get(task.id);
      if (!row) continue;
      const d = demandOf(task, row, c);
      if (d.missing) { missing++; continue; }
      let days = workDaysOf(task.start, task.end, isWork), late = false;
      if (measure === 'remaining') {
        days = daysLeft(task, today, isWork);
        if (!days) { days = [firstWorkDay(today, isWork)]; late = true; }
      }
      // what each of its people logged on it, and each one's share of what others (or nobody) logged
      const mine = logged?.get(task.id);
      const real = d.keys.filter((k) => k !== NONE);
      const shared = mine ? [...mine].reduce((s, [k, h]) => s + (k != null && real.includes(k) ? 0 : h), 0) / Math.max(1, real.length) : 0;
      for (const key of d.keys) {
        const p = byKey.get(key);
        if (!p) continue;
        const hours = logged && d.total != null
          ? Math.max(0, d.total - (key !== NONE ? mine?.get(key) || 0 : 0) - shared) / days.length
          : d.perDay(key, days);
        if (hours <= EPS / 10) continue;
        p.items.push(late ? { task, hours, days, late } : { task, hours, days });
        for (const day of days) if (day >= from && day <= to) p.load[day - from] += hours;
      }
    }
  }
  const overs = [];
  for (const p of people) {
    if (p.none) continue;
    p.cap = new Float64Array(n);
    const off = daysOff.get(p.key);
    for (let i = 0; i < n; i++) {
      const day = from + i;
      // what is still to do can only be done from today on
      const gone = measure === 'remaining' && day < today;
      p.cap[i] = !gone && isWork(day) && !(off && off.has(day)) ? p.perDay : 0;
      if (!gone && p.load[i] > p.cap[i] + EPS) overs.push({ key: p.key, day });
    }
  }
  return { people: people.filter((p) => !p.none || p.items.length), from, to, overs, missing };
}

/**
 * A person's hours per period (days, weeks or months, from booking.js calendarPeriods).
 * @returns {Array<{load, cap, over: number (days over capacity), off: boolean (no capacity at all)}>}
 */
export function periodTotals(person, periods, from) {
  return periods.map((p) => {
    let load = 0, cap = 0, over = 0;
    const a = Math.max(0, p.start - from), b = Math.min(person.load.length - 1, p.end - from);
    for (let i = a; i <= b; i++) {
      load += person.load[i];
      if (person.cap) { cap += person.cap[i]; if (person.load[i] > person.cap[i] + EPS) over++; }
    }
    return { load, cap: person.cap ? cap : null, over, off: !!person.cap && cap === 0 };
  });
}

/** Everyone's hours per period, for the column heads: [{load, cap}] (people without a row of their own left out of cap). */
export function teamTotals(people, periods, from) {
  const out = periods.map(() => ({ load: 0, cap: 0 }));
  for (const p of people) {
    const t = periodTotals(p, periods, from);
    t.forEach((x, i) => { out[i].load += x.load; out[i].cap += x.cap || 0; });
  }
  return out;
}

/** The tasks behind one cell: [{task, hours, late?}] (hours in that period, a task once), most hours first. */
export function tasksIn(person, period) {
  const byTask = new Map();
  for (const it of person.items) {
    const days = it.days.filter((d) => d >= period.start && d <= period.end).length;
    if (!days) continue;
    const x = byTask.get(it.task.id);
    if (x) x.hours += days * it.hours;
    else byTask.set(it.task.id, it.late ? { task: it.task, hours: days * it.hours, late: true } : { task: it.task, hours: days * it.hours });
  }
  return [...byTask.values()].sort((a, b) => b.hours - a.hours || a.task.index - b.task.index);
}

// ---- levelling --------------------------------------------------------------------------------------

/**
 * Moves that take people under their capacity.
 *
 * Only tasks that take part in an overload from today on move, and only later: a task starts on the
 * first working day from its own start where all its people have room for it on every one of its
 * days, as long as it still ends before any task that waits for it starts, before its due date
 * (when it has one besides its end), and by the plan's last day. So no other task has to move with it.
 * Never moved: tasks already started, done tasks, milestones, parents, and tasks canMove() refuses
 * (dates from formulas). Tasks with the least slack keep their place; those with more give way.
 *
 * @param ctx  buildWorkload's ctx, plus {links: [{from, to}], today, shiftEnd(task, start) -> end,
 *             canMove(task) -> boolean, dueOf(task) -> day | null}
 * @returns {{moves: Array<{id, start, end, was: {start, end}}>, before: number, after: number, stuck: Array<{id, reason}>}}
 *   before / after: person-days over capacity from today on; stuck reasons: 'slack' (no room before it
 *   must end) | 'tooBig' (more than its people have even on an empty day)
 */
export function levelPlan(tasks, rows, ctx) {
  const { links = [], today, shiftEnd, canMove = () => true, dueOf = () => null, isWork } = ctx;
  const dated = tasks.filter((x) => x.start != null);
  const parents = new Set(tasks.map((x) => x.parentId).filter((x) => x != null));
  const planEnd = dated.reduce((m, x) => Math.max(m, x.end), -Infinity);
  if (!dated.length) return { moves: [], before: 0, after: 0, stuck: [] };
  const from = Math.min(today, ...dated.map((x) => x.start));
  const wl = buildWorkload(tasks, rows, { ...ctx, from, to: planEnd });
  const countOvers = (people) => {
    let n = 0;
    for (const p of people) if (p.cap) for (let i = Math.max(0, today - from); i < p.load.length; i++) if (p.load[i] > p.cap[i] + EPS) n++;
    return n;
  };
  const before = countOvers(wl.people);
  if (!before) return { moves: [], before: 0, after: 0, stuck: [] };

  const people = wl.people.filter((p) => p.cap);
  const byKey = new Map(people.map((p) => [p.key, p]));
  // Each task's share: per person, its hours a day and its days.
  const shares = new Map();
  for (const p of people) for (const it of p.items) {
    if (!shares.has(it.task.id)) shares.set(it.task.id, []);
    shares.get(it.task.id).push({ p, hours: it.hours, days: it.days, total: it.hours * it.days.length });
  }
  const overAt = (p, day) => { const i = day - from; return i >= 0 && i < p.load.length && p.load[i] > p.cap[i] + EPS; };
  const involved = (task) => (shares.get(task.id) || []).some((s) => s.days.some((d) => d >= today && overAt(s.p, d)));

  // Latest end: before the earliest successor starts, by its own due date, by the end of the plan.
  const succ = new Map();
  const byId = new Map(dated.map((x) => [x.id, x]));
  for (const l of links) if (byId.has(l.to)) { if (!succ.has(l.from)) succ.set(l.from, []); succ.get(l.from).push(byId.get(l.to)); }
  const latestEnd = (task) => {
    let e = planEnd;
    for (const s of succ.get(task.id) || []) e = Math.min(e, ctx.beforeDay ? ctx.beforeDay(s.start) : s.start - 1);
    const due = dueOf(task);
    if (due != null && due >= task.end) e = Math.min(e, due);
    return e;
  };
  const movable = dated.filter((x) => !x.done && x.kind !== 'milestone' && !parents.has(x.id) && x.start >= today
    && shares.has(x.id) && involved(x) && canMove(x));

  // Take the movable tasks off; everything else stays where it is.
  const committed = new Map(people.map((p) => [p.key, Float64Array.from(p.load)]));
  for (const x of movable) for (const s of shares.get(x.id)) for (const d of s.days) committed.get(s.p.key)[d - from] -= s.hours;

  const slack = new Map(movable.map((x) => [x.id, latestEnd(x) - x.end]));
  movable.sort((a, b) => slack.get(a.id) - slack.get(b.id) || a.start - b.start || a.index - b.index);
  const moves = [], stuck = [];
  // the hours a task asks of one person a day, if it ran on these days instead
  const hoursFor = (s, days) => (ctx.effortCol ? s.total / Math.max(1, days.length) : s.hours);
  const fits = (task, start, end) => {
    const days = workDaysOf(start, end, isWork);
    for (const s of shares.get(task.id)) {
      const load = committed.get(s.p.key), h = hoursFor(s, days);
      for (const d of days) {
        const i = d - from;
        if (i >= load.length) return null;
        if (load[i] + h > s.p.cap[i] + EPS) return null;
      }
    }
    return days;
  };
  const place = (task, days) => {
    for (const s of shares.get(task.id)) { const load = committed.get(s.p.key), h = hoursFor(s, days); for (const d of days) load[d - from] += h; }
  };
  for (const task of movable) {
    const last = latestEnd(task);
    let placed = null;
    for (let start = task.start, guard = 0; guard < MAX_DAYS; guard++) {
      const end = start === task.start ? task.end : shiftEnd(task, start);
      if (end > last) break;
      const days = fits(task, start, end);
      if (days) { placed = { start, end, days }; break; }
      do start++; while (!isWork(start) && start - task.start < MAX_DAYS);
    }
    if (placed) {
      place(task, placed.days);
      if (placed.start !== task.start) moves.push({ id: task.id, start: placed.start, end: placed.end, was: { start: task.start, end: task.end } });
    } else {
      // too much for its people even with nothing else on, or no room before it must end
      const alone = shares.get(task.id).some((s) => s.hours > s.p.perDay + EPS);
      stuck.push({ id: task.id, reason: alone ? 'tooBig' : 'slack' });
      place(task, workDaysOf(task.start, task.end, isWork));
    }
  }
  let after = 0;
  for (const p of people) {
    const load = committed.get(p.key);
    for (let i = Math.max(0, today - from); i < load.length; i++) if (load[i] > p.cap[i] + EPS) after++;
  }
  return { moves, before, after, stuck };
}
