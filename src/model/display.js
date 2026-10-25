// How a view looks for this person (M15): row height, the order of the rows, what colours the bars, where a bar's
// name goes, week numbers, weekends and the today line, and the columns beside the names in the Gantt chart's list.
// All of it is this browser's choice, per table, and a saved view carries it; none of it is written to the document.
// Pure: tests/display.test.mjs.

import { refId, listOf, plain, num, dayOf } from './values.js';

/** Row and bar heights in px: a compact plan fits a third more rows on the same screen. */
export const DENSITIES = { comfortable: { rowH: 32, barH: 20 }, compact: { rowH: 24, barH: 16 } };
export const LABEL_MODES = ['auto', 'beside', 'off'];
export const MAX_LIST_COLS = 3;

export const DISPLAY_DEFAULTS = Object.freeze({
  density: 'comfortable',   // 'comfortable' | 'compact'
  sort: null,               // null (the table's order) | 'start' | 'end' | 'name' | 'col:<column id>'
  colourBy: null,           // a column id, or null (what Settings says)
  labels: 'auto',           // where a bar's name goes: in it when it fits (else beside), beside always, or nowhere
  weekNumbers: true, weekends: true, today: true,
  cols: [],                 // column ids shown beside the names in the Gantt chart's list
});

const id = (v) => typeof v === 'string' && v.length > 0 && v.length <= 80;

/** A stored display -> a clean one: every key valid or its default. */
export function cleanDisplay(v) {
  const d = { ...DISPLAY_DEFAULTS, cols: [] };
  if (!v || typeof v !== 'object') return d;
  if (v.density in DENSITIES) d.density = v.density;
  if (v.sort === 'start' || v.sort === 'end' || v.sort === 'name' || (typeof v.sort === 'string' && v.sort.startsWith('col:') && id(v.sort.slice(4)))) d.sort = v.sort;
  if (id(v.colourBy)) d.colourBy = v.colourBy;
  if (LABEL_MODES.includes(v.labels)) d.labels = v.labels;
  for (const k of ['weekNumbers', 'weekends', 'today']) if (typeof v[k] === 'boolean') d[k] = v[k];
  if (Array.isArray(v.cols)) d.cols = [...new Set(v.cols.filter(id))].slice(0, MAX_LIST_COLS);
  return d;
}

/** True when nothing differs from how the widget looks by default. */
export const isDefaultDisplay = (d) => JSON.stringify(cleanDisplay(d)) === JSON.stringify(cleanDisplay(null));

export const heights = (d) => DENSITIES[cleanDisplay(d).density];

// ---- sorting the rows ----------------------------------------------------------------------------------------
const byText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
/** The kinds of column a list can be sorted by, or shown beside the names. */
export const LIST_KINDS = ['Choice', 'ChoiceList', 'Ref', 'RefList', 'Bool', 'Int', 'Numeric', 'Date', 'DateTime', 'Text'];

/** A column's value in a row as something sortable: a rank or number, or null when empty. */
function sortValue(row, col, labels) {
  const v = row[col.id];
  switch (col.kind) {
    case 'Int': case 'Numeric': return num(v);
    case 'Date': case 'DateTime': return dayOf(v, col.type);
    case 'Bool': { const p = plain(v); return p === true ? 1 : p === false ? 0 : null; }
    case 'Choice': {
      const p = plain(v);
      if (p == null || p === '') return null;
      const i = (col.choices || []).indexOf(p);
      return i >= 0 ? i : 1e6 + 0;   // a value the choice list no longer has goes after the listed ones
    }
    case 'Ref': { const r = refId(v); return r ? String(labels[col.id]?.get(r) ?? '') : null; }
    case 'RefList': case 'ChoiceList': {
      const items = listOf(v).map((x) => (col.kind === 'RefList' ? labels[col.id]?.get(x) ?? '' : String(x)));
      return items.length ? items.join(', ') : null;
    }
    default: { const p = plain(v); return p == null || p === '' ? null : String(p); }
  }
}

/**
 * A comparator over tasks for the rows' order, or null for the table's own. Empty values go last; ties keep the
 * table's order, so sorting twice never shuffles.
 * @param key  see DISPLAY_DEFAULTS.sort
 * @param ctx  {columns, rowOf(id) -> row, labels}
 */
export function taskSorter(key, { columns, rowOf, labels = {} }) {
  if (!key) return null;
  const tie = (a, b) => (a.index ?? 0) - (b.index ?? 0);
  const numeric = (get) => (a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return tie(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    return x - y || tie(a, b);
  };
  if (key === 'start') return numeric((t) => t.start);
  if (key === 'end') return numeric((t) => t.end);
  if (key === 'name') return (a, b) => byText(a.title || '', b.title || '') || tie(a, b);
  const col = columns.find((c) => c.id === key.slice(4));
  if (!col) return null;
  const val = (t) => { const r = rowOf(t.id); return r ? sortValue(r, col, labels) : null; };
  return (a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return tie(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return x - y || tie(a, b);
    return byText(x, y) || tie(a, b);
  };
}

/** The columns a person may sort by or show in the list: not the name, not the links between tasks. */
export function listColumns(columns, roles, tableId) {
  const skip = new Set([roles.title, roles.parent, roles.dependsOn].filter(Boolean));
  return columns.filter((c) => LIST_KINDS.includes(c.kind) && !skip.has(c.id) && c.refTable !== tableId);
}
