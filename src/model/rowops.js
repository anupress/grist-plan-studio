// Delete and duplicate a task (M20), as the actions Grist is given; delete several at once (M26). Pure: tests/rowops.test.mjs.
//
// Delete: the row goes, and what pointed at it is tidied in the same action, so one Undo brings everything back:
//   - its sub-tasks either move up one level (they get its own parent) or go with it, as the person says;
//   - a task that waited for it (or for a sub-task that goes) no longer lists it under "Depends on".
// Duplicate: a copy of every column that is not a formula, the name marked "(copy)"; with its sub-tasks, a copy of each,
//   placed under the copy of its parent, with links between the copies pointing at the copies and links to anything else
//   kept. The copies get their row numbers here (the highest in the table + 1 ...), so the parents and links can be written in the
//   same action, which is what makes it one step in Undo.

import { dayOf, refId, listOf, plain, num } from './values.js';
import { encodeInput } from './edits.js';
import { isDoneStatus } from './tasks.js';

const colOf = (ctx, role) => (ctx.roles[role] ? ctx.columns.find((c) => c.id === ctx.roles[role]) || null : null);

/** The ids of everything below a task, children first-level then deeper (a cycle in the data is cut short). */
export function descendantsOf(tasks, id) {
  const kids = new Map();
  for (const t of tasks) if (t.parentId != null) { if (!kids.has(t.parentId)) kids.set(t.parentId, []); kids.get(t.parentId).push(t.id); }
  const out = [], seen = new Set([id]);
  const walk = (x) => { for (const k of kids.get(x) || []) if (!seen.has(k)) { seen.add(k); out.push(k); walk(k); } };
  walk(id);
  return out;
}

/**
 * Delete one task, or several at once (M26): the rows go, and what pointed at them is tidied in the same action.
 * @param ctx    {tableId, roles, columns}
 * @param tasks  every task (dated and not) from buildTasks: id, parentId, deps
 * @param opts   {children: 'keep' (their sub-tasks move up to the nearest task that stays) | 'delete' (they go too)}
 * @returns {{updates: Array<{id, fields, patch}>, removed: number[], moved: number, unlinked: number} | {error: 'gone' | 'parentFormula'}}
 */
export function planDeleteMany(ctx, tasks, ids, { children = 'keep' } = {}) {
  const known = new Set(tasks.map((x) => x.id));
  const targets = [...new Set(ids)].filter((id) => known.has(id));
  if (!targets.length) return { error: 'gone' };
  const gone = new Set(targets);
  if (children === 'delete') for (const id of targets) for (const d of descendantsOf(tasks, id)) gone.add(d);
  const byId = new Map(tasks.map((x) => [x.id, x]));
  const updates = [];
  const parentCol = colOf(ctx, 'parent'), depCol = colOf(ctx, 'dependsOn');
  let moved = 0;
  if (children === 'keep') {
    // a sub-task of a task that goes moves up to the nearest task above it that stays, or to the top
    for (const x of tasks) {
      if (gone.has(x.id) || x.parentId == null || !gone.has(x.parentId)) continue;
      if (!parentCol || parentCol.isFormula) return { error: 'parentFormula' };
      let up = x.parentId;
      const seen = new Set();
      while (up != null && gone.has(up) && !seen.has(up)) { seen.add(up); up = byId.get(up)?.parentId ?? null; }
      const [v, cell] = encodeInput(parentCol, up != null && !gone.has(up) ? up : 0);
      updates.push({ id: x.id, fields: { [parentCol.id]: v }, patch: { [parentCol.id]: cell } });
      moved++;
    }
  }
  let unlinked = 0;
  if (depCol && !depCol.isFormula) {
    for (const x of tasks) {
      if (gone.has(x.id) || !x.deps?.some((d) => gone.has(d))) continue;
      const left = x.deps.filter((d) => !gone.has(d));
      const [v, cell] = encodeInput(depCol, depCol.kind === 'Ref' ? left[0] || 0 : left);
      // a task already given a new parent above is one row: merge the two edits
      const at = updates.find((u) => u.id === x.id);
      if (at) { at.fields[depCol.id] = v; at.patch[depCol.id] = cell; } else updates.push({ id: x.id, fields: { [depCol.id]: v }, patch: { [depCol.id]: cell } });
      unlinked++;
    }
  }
  return { updates, removed: [...gone], moved, unlinked };
}

/** Delete one task (see planDeleteMany). */
export const planDelete = (ctx, tasks, id, opts) => planDeleteMany(ctx, tasks, [id], opts);

/** A cell in the form encodeInput takes, or undefined for a column that is not copied. */
function inputOf(col, cell) {
  switch (col.kind) {
    case 'Date': case 'DateTime': return dayOf(cell, col.type);
    case 'Ref': return refId(cell) || 0;
    case 'RefList': case 'ChoiceList': return listOf(cell);
    case 'Bool': return plain(cell) === true;
    case 'Numeric': case 'Int': return num(cell);
    case 'Text': case 'Choice': { const p = plain(cell); return p == null ? '' : String(p); }
    default: return undefined;
  }
}

/**
 * @param ctx    {tableId, roles, columns}
 * @param tasks  every task: id, parentId, deps
 * @param rows   the rows, encoded (what the widget keeps)
 * @param opts   {children: 'all' | 'none', firstId: the row number the first copy gets, copyTitle(title) -> the copy's name,
 *                shift: days every date of the copy moves by (the start, end, due and planned dates; others are copied as they are),
 *                fresh: the copy starts over (not done, no progress, no day it was done, the first status that is not a finished one)}
 * @returns {{action: [string, string, number[], object], ids: number[], rows: object[], map: Map} | {error: 'gone' | 'noName'}}
 *   rows: the copies as the widget keeps rows (for the demo and for a bar at once); map: original id -> copy id
 */
export function planDuplicate(ctx, tasks, rows, id, { children = 'none', firstId, copyTitle = (s) => s, shift = 0, fresh = false } = {}) {
  const source = tasks.find((x) => x.id === id);
  if (!source) return { error: 'gone' };
  const titleCol = colOf(ctx, 'title'), parentCol = colOf(ctx, 'parent'), depCol = colOf(ctx, 'dependsOn');
  const order = [id, ...(children === 'all' ? descendantsOf(tasks, id) : [])];
  const map = new Map(order.map((x, i) => [x, firstId + i]));
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const taskOf = new Map(tasks.map((x) => [x.id, x]));
  const roleId = (role) => ctx.roles[role] || null;
  const shifted = new Set(['start', 'end', 'due', 'baselineStart', 'baselineEnd'].map(roleId).filter(Boolean));
  const statusCol = colOf(ctx, 'status');
  const firstOpen = statusCol?.kind === 'Choice' ? (statusCol.choices || []).find((x) => !isDoneStatus(x)) : undefined;
  const cols = ctx.columns.filter((c) => !c.isFormula && ['Text', 'Choice', 'ChoiceList', 'Bool', 'Numeric', 'Int', 'Date', 'DateTime', 'Ref', 'RefList', 'Attachments'].includes(c.kind));
  const values = Object.fromEntries(cols.map((c) => [c.id, []]));
  const copies = [];
  for (const src of order) {
    const row = rowOf.get(src);
    if (!row) return { error: 'gone' };
    const patch = { id: map.get(src) };
    for (const c of cols) {
      let value, cell;
      if (c.kind === 'Attachments') { const l = listOf(row[c.id]); value = cell = l.length ? ['L', ...l] : null; }
      else {
        let input = inputOf(c, row[c.id]);
        // the links of the copy: to the copies when the other end is copied too, else as they were
        if (parentCol && c.id === parentCol.id && src !== id) { const p = taskOf.get(src)?.parentId; input = map.get(p) ?? p ?? 0; }
        if (depCol && c.id === depCol.id) { const d = (taskOf.get(src)?.deps || []).map((x) => map.get(x) ?? x); input = depCol.kind === 'Ref' ? d[0] || 0 : d; }
        if (titleCol && c.id === titleCol.id && src === id) input = copyTitle(String(plain(row[c.id]) ?? ''));
        if (shift && shifted.has(c.id) && typeof input === 'number') input += shift;
        if (fresh) {
          if (c.id === roleId('done')) input = false;
          else if (c.id === roleId('progress')) input = 0;
          else if (c.id === roleId('doneOn')) input = null;
          else if (c.id === roleId('status') && firstOpen !== undefined) input = firstOpen;
        }
        [value, cell] = encodeInput(c, input, row[c.id]);
      }
      values[c.id].push(value);
      patch[c.id] = cell;
    }
    copies.push(patch);
  }
  const ids = order.map((x) => map.get(x));
  return { action: ['BulkAddRecord', ctx.tableId, ids, values], ids, rows: copies, map };
}

/**
 * Several copies in one action: the original and (when asked) its sub-tasks, once for each shift in `deltas` (days). The
 * copies of one round get the row numbers after those of the round before. One BulkAddRecord, so one step in Undo.
 * @param opts   {children, firstId, deltas: number[], copyTitle, fresh}
 * @returns {{action, ids, rows, rounds: number} | {error}}
 */
export function planSeries(ctx, tasks, rows, id, { children = 'none', firstId, deltas = [0], copyTitle = (s) => s, fresh = false } = {}) {
  const ids = [], copies = [], values = {};
  let next = firstId;
  for (const shift of deltas) {
    const part = planDuplicate(ctx, tasks, rows, id, { children, firstId: next, copyTitle, shift, fresh });
    if (part.error) return part;
    const [, , , vals] = part.action;
    for (const [k, list] of Object.entries(vals)) (values[k] ||= []).push(...list);
    ids.push(...part.ids);
    copies.push(...part.rows);
    next += part.ids.length;
  }
  return { action: ['BulkAddRecord', ctx.tableId, ids, values], ids, rows: copies, rounds: deltas.length };
}

/**
 * Move a task one level in (it becomes a sub-task of the task above it at its own level) or one level out (it takes its
 * parent's place, under the grandparent). Moving in never makes a loop; moving out never does either.
 * @param dir  'in' | 'out'
 * @returns {{fields, patch, parentId} | {error: 'gone' | 'noParentColumn' | 'parentFormula' | 'first' | 'top'}}
 */
export function planReparent(ctx, tasks, id, dir) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return { error: 'gone' };
  const col = colOf(ctx, 'parent');
  if (!col) return { error: 'noParentColumn' };
  if (col.isFormula) return { error: 'parentFormula' };
  let parentId;
  if (dir === 'in') {
    // the task above it among its brothers and sisters, in the order of the rows
    const same = tasks.filter((x) => (x.parentId ?? null) === (task.parentId ?? null)).sort((a, b) => a.index - b.index);
    const at = same.findIndex((x) => x.id === id);
    if (at <= 0) return { error: 'first' };
    parentId = same[at - 1].id;
  } else {
    if (task.parentId == null) return { error: 'top' };
    const up = tasks.find((x) => x.id === task.parentId);
    parentId = up?.parentId ?? 0;
  }
  const [value, cell] = encodeInput(col, parentId);
  return { fields: { [col.id]: value }, patch: { [col.id]: cell }, parentId };
}
