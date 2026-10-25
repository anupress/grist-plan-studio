// The overview (M19): the plan in numbers. A row of counts (how many tasks, how many open, late, due soon, done) and a
// breakdown by any Choice, Reference or yes/no column: for each value how many tasks are done, still open, or late.
// The tasks that count are the ones that do the work: a parent (its children carry it) is left out, as in the agenda,
// and "late" is the agenda's: not finished, and its end has passed. Pure: tests/overview.test.mjs.

import { valuesOf, choicesOf, NONE, FIND_KINDS } from './find.js';
import { num } from './values.js';

/** How many tasks the lists of what needs attention show. */
export const LATE_SHOWN = 6;
export const MILESTONES_SHOWN = 5;
/** "Due soon" is the end falling inside this many days from today (today included). */
export const SOON_DAYS = 7;

/**
 * The columns a breakdown can be made by: Choice, Reference and yes/no, but not the name and not a link to this table; and a
 * Text column that is the person, the status or the project (a table that keeps its people as names has no Reference to use).
 * The week or the month a task ends are breakdowns too (M27): they are `pseudo` columns the caller makes ({id: '@week', label, pseudo: true}).
 */
export function breakdownColumns(columns, roles, tableId) {
  const text = new Set(['assignee', 'status', 'project'].map((r) => roles[r]).filter(Boolean));
  return columns.filter((c) => c.id !== roles.title && c.refTable !== tableId && (FIND_KINDS.includes(c.kind) || (c.kind === 'Text' && text.has(c.id))));
}

/**
 * Which columns the two breakdowns use: what the person chose when it still exists, else the status, then the person,
 * then the project. The second is never the same column as the first.
 * @param chosen  [colId | null | undefined, colId | null | undefined]; null means "none" (the second only), undefined "not chosen"
 * @param pseudo  the columns that are not columns of the table (the week a task ends), after the real ones
 */
export function pickBreakdowns(columns, roles, tableId, chosen = [], pseudo = []) {
  const ok = [...breakdownColumns(columns, roles, tableId), ...pseudo];
  const byId = (id) => (id ? ok.find((c) => c.id === id) || null : null);
  const fallback = ['status', 'assignee', 'project'].map((r) => byId(roles[r])).filter(Boolean);
  const first = chosen[0] === undefined || !byId(chosen[0]) ? fallback[0] || ok[0] || null : byId(chosen[0]);
  let second;
  if (chosen[1] === null) second = null;
  else if (chosen[1] !== undefined && byId(chosen[1])) second = byId(chosen[1]);
  else second = fallback.find((c) => c !== first) || ok.find((c) => c !== first) || null;
  if (second && second === first) second = null;
  return [first, second];
}

/**
 * The columns whose numbers can be added up across tasks: a number that is not a progress, an order, a duration or a lag.
 */
export function measureColumns(columns, roles, tableId) {
  const not = new Set(['progress', 'order', 'duration', 'lag'].map((r) => roles[r]).filter(Boolean));
  return columns.filter((c) => (c.kind === 'Numeric' || c.kind === 'Int') && !not.has(c.id) && !c.refTable && c.id !== roles.title);
}

/** The days of a task's end, as the token of its week or month: null for a task with no end. */
const bucketToken = (ctx, col, x) => (x.end == null ? null : ctx.bucketOf(col, x));

/**
 * @param tasks        dated tasks from buildTasks
 * @param unscheduled  tasks without dates
 * @param ctx {today, doable (a row can be finished: nothing is late otherwise), rowOf(id) -> row, labels, by: [col | null, col | null],
 *             valueText(col, token) -> text (the caller's words: "(none)", Yes and No, names, a week),
 *             measure: a number column to add up instead of counting (each group then has `w`, the same four numbers in that unit),
 *             bucketOf(pseudoCol, task) -> token (the start day of the week or month the task ends in)}
 * @returns {{total, open, done, late, soon, undated, share, doable, measure: {col, total, done, open, late} | null,
 *            breakdowns: Array<{col, multi, groups: Array<{token, label, done, open, late, total, w?}>}>,
 *            lateList: Array<{task, days}>, milestones: Array<{task, day, inDays}>}}
 */
export function buildOverview(tasks, unscheduled, { today, doable = true, rowOf, labels = {}, by = [null, null], valueText = null, measure = null, bucketOf = null }) {
  const all = [...tasks, ...unscheduled];
  const parents = new Set(all.map((x) => x.parentId).filter((x) => x != null));
  const leaves = all.filter((x) => !parents.has(x.id));
  const dated = (x) => x.start != null && x.end != null;
  const isLate = (x) => doable && !x.finished && dated(x) && x.end < today;
  const total = leaves.length;
  const done = leaves.filter((x) => x.finished).length;
  const late = leaves.filter(isLate).length;
  const soon = leaves.filter((x) => !x.finished && dated(x) && x.end >= today && x.end < today + SOON_DAYS).length;
  const undated = leaves.filter((x) => !x.finished && !dated(x)).length;
  const weight = (x) => { if (!measure) return 1; const v = num(rowOf(x.id)?.[measure.id]); return Number.isFinite(v) ? v : 0; };
  const state = (x) => (x.finished ? 'done' : isLate(x) ? 'late' : 'open');

  const breakdowns = [];
  for (const col of by) {
    if (!col) continue;
    const text = (token, fallback) => (valueText ? valueText(col, token) : fallback);
    let groups;
    if (col.pseudo) {
      // the week or the month a task ends in, oldest first, tasks with no end last
      const tokens = new Map();
      for (const x of leaves) { const k = bucketToken({ bucketOf }, col, x) ?? NONE; if (!tokens.has(k)) tokens.set(k, true); }
      const keys = [...tokens.keys()].sort((a, b) => (a === NONE) - (b === NONE) || (a === NONE ? 0 : a - b));
      groups = new Map(keys.map((k) => [k, { token: k, label: text(k, String(k)), done: 0, open: 0, late: 0, total: 0 }]));
    } else {
      const order = choicesOf(leaves.map((x) => rowOf(x.id)).filter(Boolean), col, labels);
      groups = new Map(order.map((c) => [c.value, { token: c.value, label: text(c.value, c.label), done: 0, open: 0, late: 0, total: 0 }]));
    }
    if (measure) for (const g of groups.values()) g.w = { done: 0, open: 0, late: 0, total: 0 };
    for (const x of leaves) {
      const row = rowOf(x.id);
      if (!row) continue;
      const tokens = col.pseudo ? [bucketToken({ bucketOf }, col, x) ?? NONE] : valuesOf(row, col);
      for (const token of tokens.length ? tokens : [NONE]) {
        const g = groups.get(token);
        if (!g) continue;
        const s = state(x);
        g.total++; g[s]++;
        if (measure) { const w = weight(x); g.w.total += w; g.w[s] += w; }
      }
    }
    breakdowns.push({ col, multi: col.kind === 'RefList' || col.kind === 'ChoiceList', groups: [...groups.values()].filter((g) => g.total > 0) });
  }
  let sums = null;
  if (measure) {
    sums = { col: measure, total: 0, done: 0, open: 0, late: 0 };
    for (const x of leaves) { const w = weight(x), s = state(x); sums.total += w; sums[s] += w; }
  }

  const lateList = leaves.filter(isLate).map((x) => ({ task: x, days: today - x.end }))
    .sort((a, b) => b.days - a.days || a.task.index - b.task.index).slice(0, LATE_SHOWN);
  const milestones = leaves.filter((x) => x.kind === 'milestone' && !x.finished && dated(x) && x.end >= today)
    .map((x) => ({ task: x, day: x.end, inDays: x.end - today }))
    .sort((a, b) => a.day - b.day || a.task.index - b.task.index).slice(0, MILESTONES_SHOWN);

  return { total, open: total - done, done, late, soon, undated, share: total ? done / total : null, doable, measure: sums, breakdowns, lateList, milestones };
}
