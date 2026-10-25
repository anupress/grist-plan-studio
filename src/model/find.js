// Quick filters (M14): a search by name and chosen values of a few columns. They decide which rows a view draws
// and nothing else: no row is changed, and the document never learns of them.
//
//   find = { q: 'design', sel: { Status: ['Stuck', 'Working'], Owner: ['3'] }, cols: ['Priority'] }
//
//   q     words that must each start a word of the task's name (or its parents' names), or sit inside one from
//         three letters; accents and capitals do not matter
//   sel   per column, the values to keep (any of them). A Choice keeps its text, a Reference the row id, a yes/no
//         column '1' or '0'; '' stands for "no value". A column with nothing chosen does not filter.
//   cols  columns shown as filters beside the three the roles give (assignee, status, project)
//
// In a view that draws the tree (the Gantt chart, the timeline) or counts a parent as the sum of its tasks (the
// workload, the agenda), a parent is decided by its children: it stays when any task under it stays, so the tree never
// breaks and a rollup is never left standing on nothing or counted on its own. In a view where every row is its own
// card or bar (the board, the calendar) a row is decided by itself and nothing is added above it. Either way a search
// also matches the names above a task, so "design" finds the tasks under a group called Design. Pure: tests/find.test.mjs.

import { refId, listOf, plain } from './values.js';

/** The kinds of column worth a filter: few values, picked rather than typed. */
export const FIND_KINDS = ['Choice', 'ChoiceList', 'Ref', 'RefList', 'Bool'];
/** The value that stands for "no value" in `sel`. */
export const NONE = '';

const MAX_COLS = 8, MAX_VALUES = 60, MAX_LEN = 80, MAX_Q = 80;

export const emptyFind = () => ({ q: '', sel: {}, cols: [] });

/** A stored find -> a clean one (unknown shapes dropped, sizes capped). */
export function cleanFind(v) {
  const out = emptyFind();
  if (!v || typeof v !== 'object') return out;
  if (typeof v.q === 'string') out.q = v.q.replace(/\s+/g, ' ').trimStart().slice(0, MAX_Q);
  if (v.sel && typeof v.sel === 'object' && !Array.isArray(v.sel)) {
    for (const [id, list] of Object.entries(v.sel)) {
      if (Object.keys(out.sel).length >= MAX_COLS || !id || id.length > MAX_LEN || !Array.isArray(list)) continue;
      const values = [...new Set(list.filter((x) => typeof x === 'string' && x.length <= MAX_LEN))].slice(0, MAX_VALUES);
      if (values.length) out.sel[id] = values;
    }
  }
  if (Array.isArray(v.cols)) out.cols = [...new Set(v.cols.filter((x) => typeof x === 'string' && x && x.length <= MAX_LEN))].slice(0, MAX_COLS);
  return out;
}

// ---- words ------------------------------------------------------------------------------------------------
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** The words of a search. */
export const wordsOf = (q) => fold(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** True when every word starts a word of the text, or (from three letters) sits inside one. */
export function hits(words, text) {
  if (!words.length) return true;
  const hay = fold(text);
  const parts = hay.split(/[^\p{L}\p{N}]+/u);
  return words.every((w) => parts.some((p) => p.startsWith(w)) || (w.length >= 3 && hay.includes(w)));
}

// ---- values of a cell -----------------------------------------------------------------------------------
const label = (col, labels, id) => labels[col.id]?.get(id) ?? `${col.refTable}[${id}]`;

/** A cell's values as tokens (see the header); [] when it has none. */
export function valuesOf(row, col) {
  const v = row[col.id];
  switch (col.kind) {
    case 'Ref': { const id = refId(v); return id ? [String(id)] : []; }
    case 'RefList': return listOf(v).filter((x) => typeof x === 'number' && x > 0).map(String);
    case 'ChoiceList': return listOf(v).map(String).filter(Boolean);
    case 'Bool': { const p = plain(v); return p === true ? ['1'] : p === false ? ['0'] : []; }
    default: { const p = plain(v); return p == null || p === '' ? [] : [String(p)]; }
  }
}

/** What a value token says, for display (a Bool's words are the caller's to translate). */
export function valueLabel(col, token, labels = {}) {
  if (col.kind === 'Ref' || col.kind === 'RefList') return label(col, labels, Number(token));
  return token;
}

/**
 * The choices a column offers: every value in the rows with how many rows hold it, in the column's own
 * order (a Choice list's order, a Reference's names alphabetically), and the empty value last.

 * The values come from `rows`; the counts from `countRows` (a subset: what the other filters leave), so a value the
 * filters leave none of is still listed, with 0.
 * @returns {Array<{value: string, label: string, count: number}>}
 */
export function choicesOf(rows, col, labels = {}, countRows = rows) {
  const has = new Set();
  let anyNone = false;
  for (const row of rows) {
    const vs = valuesOf(row, col);
    if (!vs.length) anyNone = true;
    for (const v of vs) has.add(v);
  }
  const count = new Map();
  let none = 0;
  for (const row of countRows) {
    const vs = valuesOf(row, col);
    if (!vs.length) none++;
    for (const v of vs) count.set(v, (count.get(v) || 0) + 1);
  }
  let list = [...has].map((value) => ({ value, label: valueLabel(col, value, labels), count: count.get(value) || 0 }));
  if (col.kind === 'Bool') list.sort((a, b) => Number(b.value) - Number(a.value));
  else if (col.kind === 'Ref' || col.kind === 'RefList') list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  else {
    const rank = new Map((col.choices || []).map((c, i) => [c, i]));
    list.sort((a, b) => (rank.get(a.value) ?? 1e9) - (rank.get(b.value) ?? 1e9) || String(a.label).localeCompare(String(b.label)));
  }
  if (anyNone) list.push({ value: NONE, label: '', count: none });
  return list;
}

// ---- applying a find -------------------------------------------------------------------------------------
/** True when the find leaves anything out. */
export const isActive = (find) => {
  const f = cleanFind(find);
  return wordsOf(f.q).length > 0 || Object.values(f.sel).some((a) => a.length > 0);
};

/**
 * @param rows  the table's rows, encoded
 * @param find  see the header
 * @param ctx   {columns, roles, labels}
 * @returns {{active: boolean, keep: Set<number>|null, shown: number, total: number}}  keep is null when nothing is filtered
 */
function prepare(rows, find, { columns, roles, labels = {} }, tree = true) {
  const f = cleanFind(find);
  const ws = wordsOf(f.q);
  const col = (id) => columns.find((c) => c.id === id) || null;
  // a chosen column that is gone from the table filters nothing
  const conds = Object.entries(f.sel).map(([id, list]) => [col(id), new Set(list)]).filter(([c, s]) => c && s.size);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const parentCol = col(roles.parent);
  const parentOf = new Map();
  const hasKids = new Set();
  if (parentCol && parentCol.kind === 'Ref') {
    for (const r of rows) {
      const p = refId(r[parentCol.id]);
      if (p && p !== r.id && byId.has(p)) { parentOf.set(r.id, p); if (tree) hasKids.add(p); }
    }
  }
  const titleCol = col(roles.title);
  const titleOf = (row) => {
    if (!titleCol) return '';
    if (titleCol.kind === 'Ref') { const id = refId(row[titleCol.id]); return id ? String(label(titleCol, labels, id)) : ''; }
    const p = plain(row[titleCol.id]);
    return p == null ? '' : String(p);
  };
  const above = (id) => {
    const names = [];
    let p = parentOf.get(id);
    for (let i = 0; p != null && i < 50; i++) { names.push(titleOf(byId.get(p))); p = parentOf.get(p); }
    return names;
  };

  /** Does this row pass every condition (but the one on `skip`, a column id)? A parent is never asked. */
  const test = (row, skip = null) => {
    for (const [c, wanted] of conds) {
      if (c.id === skip) continue;
      const vs = valuesOf(row, c);
      if (!(vs.length ? vs.some((v) => wanted.has(v)) : wanted.has(NONE))) return false;
    }
    return !ws.length || hits(ws, [titleOf(row), ...above(row.id)].join(' '));
  };
  return { ws, conds, hasKids, parentOf, test };
}

export function applyFind(rows, find, ctx, tree = true) {
  const total = rows.length;
  const p = prepare(rows, find, ctx, tree);
  if (!p.ws.length && !p.conds.length) return { active: false, keep: null, shown: total, total };
  const keep = new Set();
  for (const row of rows) {
    if (p.hasKids.has(row.id) || !p.test(row)) continue;   // a parent is decided by what is under it
    if (!tree) { keep.add(row.id); continue; }
    for (let id = row.id, i = 0; id != null && !keep.has(id) && i < 100; id = p.parentOf.get(id), i++) keep.add(id);
  }
  return { active: true, keep, shown: keep.size, total };
}

/**
 * The tasks (not the parents above them) that pass every filter but the one on column `colId`: what ticking a value
 * of that column would leave. With a null find, every task.
 */
export function facetRows(rows, find, colId, ctx, tree = true) {
  const p = prepare(rows, find, ctx, tree);
  return rows.filter((r) => !p.hasKids.has(r.id) && p.test(r, colId));
}

/** The rows a find keeps, in their order. `extra` rows (just added, say) always stay. */
export function rowsKept(rows, result, extra = null) {
  if (!result.keep) return rows;
  return rows.filter((r) => result.keep.has(r.id) || extra?.has(r.id));
}
