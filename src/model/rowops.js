// Delete and duplicate a task (M20), as the actions Grist is given. Pure: tests/rowops.test.mjs.
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
 * @param ctx    {tableId, roles, columns}
 * @param tasks  every task (dated and not) from buildTasks: id, parentId, deps
 * @param opts   {children: 'keep' (they move up one level) | 'delete' (they go too)}
 * @returns {{updates: Array<{id, fields, patch}>, removed: number[], moved: number, unlinked: number} | {error: 'gone' | 'parentFormula'}}
 */
export function planDelete(ctx, tasks, id, { children = 'keep' } = {}) {
  const target = tasks.find((x) => x.id === id);
  if (!target) return { error: 'gone' };
  const below = descendantsOf(tasks, id);
  const gone = new Set([id, ...(children === 'delete' ? below : [])]);
  const updates = [];
  const parentCol = colOf(ctx, 'parent'), depCol = colOf(ctx, 'dependsOn');
  let moved = 0;
  if (children === 'keep') {
    const kids = tasks.filter((x) => x.parentId === id);
    if (kids.length) {
      if (!parentCol || parentCol.isFormula) return { error: 'parentFormula' };
      const up = target.parentId != null && !gone.has(target.parentId) ? target.parentId : 0;
      for (const k of kids) {
        const [v, cell] = encodeInput(parentCol, up);
        updates.push({ id: k.id, fields: { [parentCol.id]: v }, patch: { [parentCol.id]: cell } });
        moved++;
      }
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
 * @param opts   {children: 'all' | 'none', firstId: the row number the first copy gets, copyTitle(title) -> the copy's name}
 * @returns {{action: [string, string, number[], object], ids: number[], rows: object[], map: Map} | {error: 'gone' | 'noName'}}
 *   rows: the copies as the widget keeps rows (for the demo and for a bar at once); map: original id -> copy id
 */
export function planDuplicate(ctx, tasks, rows, id, { children = 'none', firstId, copyTitle = (s) => s } = {}) {
  const source = tasks.find((x) => x.id === id);
  if (!source) return { error: 'gone' };
  const titleCol = colOf(ctx, 'title'), parentCol = colOf(ctx, 'parent'), depCol = colOf(ctx, 'dependsOn');
  const order = [id, ...(children === 'all' ? descendantsOf(tasks, id) : [])];
  const map = new Map(order.map((x, i) => [x, firstId + i]));
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const taskOf = new Map(tasks.map((x) => [x.id, x]));
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
