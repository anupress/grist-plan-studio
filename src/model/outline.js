// Add several tasks at once from a typed or pasted outline (M24). Pure: tests/outline.test.mjs.
//
// One task to a line; a line indented more than the one above it is a sub-task of it. Bullets, dashes, numbers and the
// "[ ]" of a checklist at the start of a line are dropped, so a list copied out of an email, a note or a spreadsheet works.
// The rows are made in one BulkAddRecord with their row numbers worked out here, so the parents and the "waits for" links can
// be written in the same action: one step in Undo.

import { encodeInput, datesFields } from './edits.js';
import { makeCalendar } from './calendar.js';

export const MAX_LINES = 500;
const MAX_TITLE = 200;
const BULLET = /^(?:[-*•–—·]|\d+[.)]|\[[ xX]?\])\s+/;

/**
 * @returns {Array<{title: string, depth: number}>}  depth 0 is a top task; a line is never more than one level below the one above
 */
export function parseOutline(text) {
  const raw = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const lead = /^[ \t]*/.exec(line)[0];
    const tabs = (lead.match(/\t/g) || []).length;
    const spaces = lead.length - tabs;
    let body = line.slice(lead.length).trimEnd();
    // a bullet can be nested too: "  - - item" is not a thing, so one bullet is dropped, and again for "- [ ] item"
    for (let i = 0; i < 2 && BULLET.test(body); i++) body = body.replace(BULLET, '');
    body = body.trim();
    if (body) raw.push({ title: body.slice(0, MAX_TITLE), tabs, spaces });
    if (raw.length >= MAX_LINES) break;
  }
  // spaces count in the smallest step used (2 or 4 in practice); a tab is one step
  // (an outline pasted with all its lines indented by the same amount starts at level 0 all the same)
  const minTabs = raw.length ? Math.min(...raw.map((r) => r.tabs)) : 0, minSpaces = raw.length ? Math.min(...raw.map((r) => r.spaces)) : 0;
  const steps = raw.map((r) => r.spaces - minSpaces).filter((n) => n > 0);
  const unit = steps.length ? Math.min(...steps) : 1;
  const out = [];
  for (const r of raw) {
    let depth = r.tabs - minTabs + Math.round((r.spaces - minSpaces) / unit);
    depth = Math.min(depth, out.length ? out[out.length - 1].depth + 1 : 0);
    out.push({ title: r.title, depth });
  }
  return out;
}

/**
 * The rows for an outline.
 * @param ctx    {tableId, roles, columns, calendar?, settings?}
 * @param items  from parseOutline
 * @param opts   {firstId: the row number the first task gets,
 *                underId: the task the top lines become sub-tasks of (0 or none: top tasks),
 *                start: the day the first task starts on (null: no dates), days: how long each takes (working days when the calendar says so),
 *                chain: one after the other, each waiting for the one before (else all start on `start`),
 *                link: {col, value, cell} (a value that keeps the new rows on show when a linked widget filters), assign: {col, value}}
 * @returns {{action: [string, string, number[], object], ids: number[], rows: object[], flattened: boolean, parents: number, dated: number, range: [number, number] | null} | {error: 'noName' | 'empty'}}
 */
export function planOutline(ctx, items, { firstId, underId = 0, start = null, days = 1, chain = false, link = null, assign = null } = {}) {
  if (!items.length) return { error: 'empty' };
  const col = (role) => { const c = ctx.roles[role] ? ctx.columns.find((x) => x.id === ctx.roles[role]) : null; return c && !c.isFormula ? c : null; };
  const titleCol = col('title');
  if (!titleCol || titleCol.kind === 'Ref') return { error: 'noName' };
  const parentCol = col('parent'), depCol = col('dependsOn');
  const cal = ctx.calendar || makeCalendar();
  const n = items.length;

  // who is whose sub-task; without a Parent column that can be written everything stays on one level
  const canNest = !!parentCol;
  const parentIdx = new Array(n).fill(-1), hasKids = new Array(n).fill(false), stack = [];
  for (let i = 0; i < n; i++) {
    const depth = canNest ? Math.min(items[i].depth, stack.length) : 0;
    stack.length = depth;
    parentIdx[i] = depth ? stack[depth - 1] : -1;
    if (parentIdx[i] >= 0) hasKids[parentIdx[i]] = true;
    stack.push(i);
  }
  const flattened = !canNest && items.some((x) => x.depth > 0);
  const idOf = (i) => firstId + i;

  // dates: the tasks with nothing under them, one after the other or all on the same day; a parent spans its tasks
  const span = new Array(n).fill(null);
  const dated = start != null;
  if (dated) {
    let cursor = cal.after(start - 1);
    for (let i = 0; i < n; i++) {
      if (hasKids[i]) continue;
      const s = chain ? cursor : cal.after(start - 1);
      const e = cal.endAfter(s, Math.max(1, Math.round(days) || 1));
      span[i] = [s, e];
      if (chain) cursor = cal.after(e);
    }
    for (let i = n - 1; i >= 0; i--) {
      if (!hasKids[i] || span[i]) continue;
      const kids = [];
      for (let j = i + 1; j < n; j++) if (parentIdx[j] === i && span[j]) kids.push(span[j]);
      if (kids.length) span[i] = [Math.min(...kids.map((k) => k[0])), Math.max(...kids.map((k) => k[1]))];
    }
  }

  const rows = [];
  let previousLeaf = -1;
  for (let i = 0; i < n; i++) {
    const out = { fields: {}, patch: {} };
    const put = (c, input) => { const [v, cell] = encodeInput(c, input, null); out.fields[c.id] = v; out.patch[c.id] = cell; };
    put(titleCol, items[i].title);
    if (parentCol) {
      const up = parentIdx[i] >= 0 ? idOf(parentIdx[i]) : underId || 0;
      if (up) put(parentCol, up);
    }
    if (span[i]) { const d = datesFields({ ...ctx, calendar: cal }, span[i][0], span[i][1]); Object.assign(out.fields, d.fields); Object.assign(out.patch, d.patch); }
    if (chain && depCol && !hasKids[i]) {
      if (previousLeaf >= 0) put(depCol, depCol.kind === 'Ref' ? idOf(previousLeaf) : [idOf(previousLeaf)]);
      previousLeaf = i;
    } else if (!hasKids[i]) previousLeaf = i;
    if (link && !link.col.isFormula) { out.fields[link.col.id] = link.value; out.patch[link.col.id] = link.cell; }
    if (assign && !assign.col.isFormula && (!link || link.col.id !== assign.col.id)) put(assign.col, assign.value);
    rows.push(out);
  }

  // every column used by any row needs a value in each row: the empty one where a row has nothing to say
  const used = [...new Set(rows.flatMap((r) => Object.keys(r.fields)))];
  const values = Object.fromEntries(used.map((id) => [id, []]));
  const patches = rows.map((r, i) => ({ id: idOf(i) }));
  for (let i = 0; i < n; i++) {
    for (const id of used) {
      const c = ctx.columns.find((x) => x.id === id);
      if (id in rows[i].fields) { values[id].push(rows[i].fields[id]); patches[i][id] = rows[i].patch[id]; }
      else { const [v, cell] = encodeInput(c, null, null); values[id].push(v); patches[i][id] = cell; }
    }
  }
  const ids = items.map((_, i) => idOf(i));
  const all = span.filter(Boolean);
  const range = all.length ? [Math.min(...all.map((x) => x[0])), Math.max(...all.map((x) => x[1]))] : null;
  return { action: ['BulkAddRecord', ctx.tableId, ids, values], ids, rows: patches, flattened, parents: hasKids.filter(Boolean).length, dated: all.length, range };
}
