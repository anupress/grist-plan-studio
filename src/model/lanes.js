// Lanes: one per value of a column. The timeline draws a band per lane and the booking grid a row per
// lane (a resource). Pure: tested in tests/timeline.test.mjs and tests/booking.test.mjs.
//
// The lanes of a column, in the order a person expects:
//   Choice, ChoiceList   its choices as the column lists them
//   Ref, RefList         every row of the referenced table, in that table's order, booked or not
//   Text                 its values, alphabetically
// then any value the rows have that the list does not know (a removed choice, a deleted row), and a
// lane for rows with no value. A list column (RefList, ChoiceList) puts a row in every lane it names.

import { refId, listOf, plain } from './values.js';
import { encodeInput } from './edits.js';

export const NONE = '';
export const LANE_KINDS = ['Ref', 'RefList', 'Choice', 'ChoiceList', 'Text'];
const isRefKind = (col) => col.kind === 'Ref' || col.kind === 'RefList';

const isHex = (s) => typeof s === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
const choiceFill = (col, value) => {
  const f = col?.choiceOptions?.[value]?.fillColor;
  return isHex(f) && !/^#f{3}(?:f{3})?$/i.test(f) ? f : null;
};

/** The lanes a cell puts its row in: 'r:<id>' for References, 'v:<text>' otherwise, [''] for none. */
export function laneKeysOf(cell, col) {
  switch (col.kind) {
    case 'Ref': { const id = refId(cell); return [id ? 'r:' + id : NONE]; }
    case 'RefList': { const ids = listOf(cell).filter((x) => typeof x === 'number' && x > 0); return ids.length ? ids.map((id) => 'r:' + id) : [NONE]; }
    case 'ChoiceList': { const v = listOf(cell).filter((x) => x != null && x !== ''); return v.length ? v.map((x) => 'v:' + x) : [NONE]; }
    default: { const v = plain(cell); return v == null || v === '' ? [NONE] : ['v:' + String(v)]; }
  }
}

/**
 * Every lane of a column, the empty one first.
 * @returns {Array<{key, label, value, colour, none}>}  value: what writing this lane puts in the cell
 */
export function lanesOf(col, rows = [], labels = {}) {
  const lanes = new Map();
  const isRef = isRefKind(col);
  const add = (key, label, value, colour = null) => {
    if (!lanes.has(key)) lanes.set(key, { key, label, value, colour, none: key === NONE });
  };
  add(NONE, null, isRef ? 0 : '');
  if (col.kind === 'Choice' || col.kind === 'ChoiceList') for (const c of col.choices || []) add('v:' + c, c, c, choiceFill(col, c));
  if (isRef) for (const [id, label] of labels[col.id] || new Map()) add('r:' + id, label, id);
  for (const r of rows) {
    for (const k of laneKeysOf(r[col.id], col)) {
      if (lanes.has(k)) continue;
      const raw = k.slice(2);
      if (isRef) add(k, `${col.refTable}[${raw}]`, Number(raw)); else add(k, raw, raw, choiceFill(col, raw));
    }
  }
  const list = [...lanes.values()];
  return col.kind === 'Text' ? [list[0], ...list.slice(1).sort((a, b) => String(a.label).localeCompare(String(b.label)))] : list;
}

/**
 * The cells that move a row from lane `from` to lane `to` (lanes from lanesOf). A list column swaps
 * the one value and keeps the others: a task of Ann and Ben dragged from Ann to Chloé is Ben's and Chloé's.
 * @returns {{fields, patch} | {error: 'formula'}}
 */
export function planLaneChange(row, col, from, to) {
  if (col.isFormula) return { error: 'formula' };
  const cell = row[col.id];
  let input = to.value;
  if (col.kind === 'RefList' || col.kind === 'ChoiceList') {
    const now = listOf(cell).filter((x) => x != null && x !== '' && x !== 0);
    const rest = from.none ? now : now.filter((x) => String(x) !== String(from.value));
    input = to.none || rest.some((x) => String(x) === String(to.value)) ? rest : [...rest, to.value];
  }
  const [v, c] = encodeInput(col, input, cell);
  return { fields: { [col.id]: v }, patch: { [col.id]: c } };
}

/**
 * Which of these intervals overlap another one. [a, b] inclusive (days, or period numbers).
 * @param items  [{id, a, b}]
 * @returns {Set} the ids that overlap at least one other
 */
export function overlapping(items) {
  const sorted = [...items].sort((x, y) => x.a - y.a || x.b - y.b);
  const out = new Set();
  const active = [];
  for (const it of sorted) {
    for (let i = active.length - 1; i >= 0; i--) if (active[i].b < it.a) active.splice(i, 1);
    if (active.length) { out.add(it.id); for (const x of active) out.add(x.id); }
    active.push(it);
  }
  return out;
}

/**
 * Stack intervals into tracks so that none in a track overlap: each goes into the first track that is
 * free by its start. Sets `item.track`; returns the number of tracks (at least 1).
 * @param items  [{a, b}] sorted or not; sorted here by start
 */
export function stack(items) {
  const ends = [];
  for (const it of [...items].sort((x, y) => x.a - y.a || x.b - y.b)) {
    let i = ends.findIndex((e) => e < it.a);
    if (i < 0) { i = ends.length; ends.push(it.b); } else ends[i] = it.b;
    it.track = i;
  }
  return Math.max(1, ends.length);
}
