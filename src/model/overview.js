// The overview (M19): the plan in numbers. A row of counts (how many tasks, how many open, late, due soon, done) and a
// breakdown by any Choice, Reference or yes/no column: for each value how many tasks are done, still open, or late.
// The tasks that count are the ones that do the work: a parent (its children carry it) is left out, as in the agenda,
// and "late" is the agenda's: not finished, and its end has passed. Pure: tests/overview.test.mjs.

import { valuesOf, choicesOf, NONE, FIND_KINDS } from './find.js';

/** How many tasks the lists of what needs attention show. */
export const LATE_SHOWN = 6;
export const MILESTONES_SHOWN = 5;
/** "Due soon" is the end falling inside this many days from today (today included). */
export const SOON_DAYS = 7;

/**
 * The columns a breakdown can be made by: Choice, Reference and yes/no, but not the name and not a link to this table; and a
 * Text column that is the person, the status or the project (a table that keeps its people as names has no Reference to use).
 */
export function breakdownColumns(columns, roles, tableId) {
  const text = new Set(['assignee', 'status', 'project'].map((r) => roles[r]).filter(Boolean));
  return columns.filter((c) => c.id !== roles.title && c.refTable !== tableId && (FIND_KINDS.includes(c.kind) || (c.kind === 'Text' && text.has(c.id))));
}

/**
 * Which columns the two breakdowns use: what the person chose when it still exists, else the status, then the person,
 * then the project. The second is never the same column as the first.
 * @param chosen  [colId | null | undefined, colId | null | undefined]; null means "none" (the second only), undefined "not chosen"
 */
export function pickBreakdowns(columns, roles, tableId, chosen = []) {
  const ok = breakdownColumns(columns, roles, tableId);
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
 * @param tasks        dated tasks from buildTasks
 * @param unscheduled  tasks without dates
 * @param ctx {today, doable (a row can be finished: nothing is late otherwise), rowOf(id) -> row, labels, by: [col | null, col | null],
 *             valueText(col, token) -> text (the caller's words: "(none)", Yes and No, names)}
 * @returns {{total, open, done, late, soon, undated, share, doable,
 *            breakdowns: Array<{col, multi, groups: Array<{token, label, done, open, late, total}>}>,
 *            lateList: Array<{task, days}>, milestones: Array<{task, day, inDays}>}}
 */
export function buildOverview(tasks, unscheduled, { today, doable = true, rowOf, labels = {}, by = [null, null], valueText = null }) {
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

  const breakdowns = [];
  for (const col of by) {
    if (!col) continue;
    const rows = leaves.map((x) => rowOf(x.id)).filter(Boolean);
    const order = choicesOf(rows, col, labels);
    const text = (token, fallback) => (valueText ? valueText(col, token) : fallback);
    const groups = new Map(order.map((c) => [c.value, { token: c.value, label: text(c.value, c.label), done: 0, open: 0, late: 0, total: 0 }]));
    for (const x of leaves) {
      const row = rowOf(x.id);
      if (!row) continue;
      const tokens = valuesOf(row, col);
      for (const token of tokens.length ? tokens : [NONE]) {
        const g = groups.get(token);
        if (!g) continue;
        g.total++;
        if (x.finished) g.done++; else if (isLate(x)) g.late++; else g.open++;
      }
    }
    breakdowns.push({ col, multi: col.kind === 'RefList' || col.kind === 'ChoiceList', groups: [...groups.values()].filter((g) => g.total > 0) });
  }

  const lateList = leaves.filter(isLate).map((x) => ({ task: x, days: today - x.end }))
    .sort((a, b) => b.days - a.days || a.task.index - b.task.index).slice(0, LATE_SHOWN);
  const milestones = leaves.filter((x) => x.kind === 'milestone' && !x.finished && dated(x) && x.end >= today)
    .map((x) => ({ task: x, day: x.end, inDays: x.end - today }))
    .sort((a, b) => a.day - b.day || a.task.index - b.task.index).slice(0, MILESTONES_SHOWN);

  return { total, open: total - done, done, late, soon, undated, share: total ? done / total : null, doable, breakdowns, lateList, milestones };
}
