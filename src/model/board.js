// The board (Kanban): which lanes there are, which cards sit in each and in what order, and what a
// drag writes. Pure, like the rest of model/: tested in tests/board.test.mjs.
//
// Lanes come from one column:
//   Choice     its choices in the order the column lists them, then any other value found in the
//              rows (a value not in the list gets its own lane rather than vanishing)
//   Reference  the rows of the referenced table, in that table's order
//   Text       the distinct values, alphabetically
// plus a lane for cards with no value, shown when it has cards.
//
// Order within a lane comes from an optional number column (the "order" role). A drag writes the
// moved card only: its new rank is the midpoint of its neighbours. Only when there is no room left
// (an Int column with neighbours 1 apart, or cards without a rank yet) is the lane numbered afresh,
// still in one action. Without an order column, cards keep the order Grist sends them in, which is
// the widget section's own sort.

import { encodeInput } from './edits.js';
import { refId, listOf, plain, num, dayOf } from './values.js';

export const LANE_KINDS = ['Choice', 'Ref', 'Text'];
/** Columns a card can show (attachments and lists of numbers would only show ids). */
export const FIELD_KINDS = ['Text', 'Choice', 'ChoiceList', 'Ref', 'RefList', 'Date', 'DateTime', 'Numeric', 'Int', 'Bool', 'Any'];
const NONE = '';

// A status that means finished, in English, German and French: such a card is never late and does not
// count against a lane's limit, even in a table without a Done column.
const DONE_WORDS = /^(done|complete|completed|closed|finished|shipped|resolved|erledigt|fertig|abgeschlossen|geschlossen|termine|terminee|fait|clos|cloture)$/;
export const isDoneStatus = (s) => DONE_WORDS.test(String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase());

const isHex = (s) => typeof s === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
const choiceFill = (col, value) => {
  const f = col?.choiceOptions?.[value]?.fillColor;
  return isHex(f) && !/^#f{3}(?:f{3})?$/i.test(f) ? f : null;
};

/** The lane a cell belongs to: 'v:<text>' for Choice and Text, 'r:<id>' for a Reference, '' for none. */
export function laneKeyOf(cell, col) {
  if (col.kind === 'Ref') { const id = refId(cell); return id ? 'r:' + id : NONE; }
  const v = plain(cell);
  return v == null || v === '' ? NONE : 'v:' + String(v);
}

/**
 * Lanes and cards.
 * @param tasks   from buildTasks (tasks and unscheduled together): id, title, colour, people, done, progress,
 *                start, end, fromDue, endFrom
 * @param rows    the same rows, encoded
 * @param ctx     {laneCol, orderCol, labels, fields: [col], hideEmpty, wip: {laneKey: n}, today, cellText(row, col),
 *                 timeOf(taskId) -> {logged, planned} | null (time tracking, M10)}
 * @returns {{lanes: Array, byId: Map}}  lane: {key, label, value, colour, cards, open, limit, over, none}
 */
export function buildBoard(tasks, rows, ctx) {
  const { laneCol, orderCol = null, labels = {}, fields = [], hideEmpty = false, wip = {}, today = null, cellText = null, timeOf = null } = ctx;
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const lanes = new Map();
  const add = (key, label, value, colour = null) => {
    if (!lanes.has(key)) lanes.set(key, { key, label, value, colour, cards: [], none: key === NONE });
    return lanes.get(key);
  };

  add(NONE, null, laneCol.kind === 'Ref' ? 0 : '');
  if (laneCol.kind === 'Choice') for (const c of laneCol.choices) add('v:' + c, c, c, choiceFill(laneCol, c));
  if (laneCol.kind === 'Ref') for (const [id, label] of labels[laneCol.id] || new Map()) add('r:' + id, label, id);

  const byId = new Map();
  for (const task of tasks) {
    const row = rowOf.get(task.id);
    if (!row) continue;
    const key = laneKeyOf(row[laneCol.id], laneCol);
    let lane = lanes.get(key);
    if (!lane) {
      // A value the lane list does not know: a choice removed from the column, a deleted Reference.
      const id = laneCol.kind === 'Ref' ? refId(row[laneCol.id]) : null;
      const raw = laneCol.kind === 'Ref' ? `${laneCol.refTable}[${id}]` : String(plain(row[laneCol.id]));
      lane = add(key, raw, laneCol.kind === 'Ref' ? id : raw);
    }
    const done = !!task.done || (task.progress != null && task.progress >= 1) || isDoneStatus(task.status);
    const card = {
      id: task.id, index: task.index, lane: key, title: task.title, colour: task.colour, people: task.people,
      done, progress: task.progress,
      order: orderCol ? num(row[orderCol.id]) : null,
      ...when({ ...task, done }, today),
      fields: fields.map((c) => ({ id: c.id, label: c.label, text: cellText ? cellText(row, c) : String(plain(row[c.id]) ?? '') }))
        .filter((f) => f.text != null && f.text !== ''),
      time: timeOf ? timeOf(task.id) : null,
    };
    card.hash = [card.title, card.lane, card.order, card.colour, card.people.join('|'), card.done, card.progress,
      card.due, card.span, card.late, card.time ? `${Math.round(card.time.logged * 100)}/${card.time.planned ?? ''}` : '', ...card.fields.map((f) => f.text)].join('\u0001');
    lane.cards.push(card);
    byId.set(card.id, card);
  }

  // Alphabetical lanes for Text, with the choice list or the referenced table deciding otherwise.
  let list = [...lanes.values()];
  if (laneCol.kind === 'Text') list = [list[0], ...list.slice(1).sort((a, b) => String(a.label).localeCompare(String(b.label)))];
  for (const lane of list) {
    lane.cards.sort(byRank);
    lane.open = lane.cards.filter((c) => !c.done).length;
    lane.limit = Number.isInteger(wip[lane.key]) && wip[lane.key] > 0 ? wip[lane.key] : null;
    lane.over = lane.limit != null && lane.open > lane.limit ? lane.open - lane.limit : 0;
  }
  list = list.filter((l) => (l.none || hideEmpty ? l.cards.length > 0 : true));
  return { lanes: list, byId };
}

/** Ranked cards first (lowest rank on top), then the rest in the order the rows came. */
export function byRank(a, b) {
  if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order;
  if ((a.order == null) !== (b.order == null)) return a.order == null ? 1 : -1;
  return a.index - b.index;
}

/**
 * What a card says about its dates: a due date, or a span.
 * late: days past a deadline (a due or end date) of a card that is not done; 0 = on time; null = no deadline.
 */
function when(task, today) {
  if (task.start == null) return { due: null, span: null, late: null };
  const deadline = task.fromDue || task.endFrom === 'due' || task.endFrom === 'end';
  const late = deadline && today != null && !task.done ? Math.max(0, today - task.end) : null;
  if (task.fromDue) return { due: task.end, span: null, late };
  return { due: null, span: [task.start, task.end], late };
}

// ---- ranks -------------------------------------------------------------------------------------------

/**
 * The rank for a card dropped between `above` and `below` (numbers, or undefined at a lane's edge).
 * Null when there is no room and the lane has to be numbered again.
 * @param kind 'Int' | 'Numeric'
 * @param own  the card's current rank (kept when the lane is otherwise empty)
 */
export function rankBetween(above, below, kind = 'Numeric', own = null) {
  const has = (x) => typeof x === 'number' && isFinite(x);
  if (above === null || below === null) return null;   // a neighbour without a rank
  if (!has(above) && !has(below)) return has(own) ? own : 1;
  if (!has(above)) return kind === 'Int' ? Math.ceil(below) - 1 : below - 1;
  if (!has(below)) return kind === 'Int' ? Math.floor(above) + 1 : above + 1;
  if (kind === 'Int') {
    const mid = Math.floor((above + below) / 2);
    return mid > above && mid < below ? mid : null;
  }
  const mid = (above + below) / 2;
  // Doubles run out of room after some fifty halvings of the same gap.
  return mid > above && mid < below && below - above > 1e-9 * Math.max(1, Math.abs(above)) ? mid : null;
}

/**
 * The writes for a card that lands at `index` in the lane with key `toKey`.
 * @param board    from buildBoard
 * @param move     {id, toKey, index}  index counts the cards of the target lane without the moved one
 * @param ctx      {laneCol, orderCol, rows}
 * @returns {{items: Array<{id, plan: {fields, patch}}>, sameLane: boolean, ranked: boolean} | {error: string}}
 */
export function planCardMove(board, move, ctx) {
  const { laneCol, orderCol = null, rows } = ctx;
  const card = board.byId.get(move.id);
  const lane = board.lanes.find((l) => l.key === move.toKey);
  if (!card || !lane) return { error: 'gone' };
  const sameLane = card.lane === lane.key;
  if (!sameLane && laneCol.isFormula) return { error: 'laneFormula' };
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const others = lane.cards.filter((c) => c.id !== card.id);
  const index = Math.max(0, Math.min(others.length, move.index));
  const items = [];
  const fields = {}, patch = {};

  if (!sameLane) {
    const [v, cell] = encodeInput(laneCol, lane.value, rowOf.get(card.id)?.[laneCol.id]);
    fields[laneCol.id] = v;
    patch[laneCol.id] = cell;
  }
  const canRank = orderCol && !orderCol.isFormula;
  if (!canRank) {
    if (sameLane) return { error: orderCol ? 'orderFormula' : 'noOrder' };
    return { items: [{ id: card.id, plan: { fields, patch } }], sameLane, ranked: false };
  }

  const at = (i) => (i < 0 || i >= others.length ? undefined : others[i].order);
  const rank = rankBetween(at(index - 1), at(index), orderCol.kind === 'Int' ? 'Int' : 'Numeric', card.order);
  if (rank != null) {
    if (rank !== card.order) { fields[orderCol.id] = rank; patch[orderCol.id] = rank; }
    if (Object.keys(fields).length) items.push({ id: card.id, plan: { fields, patch } });
    return { items, sameLane, ranked: true };
  }
  // No room: number the lane 1, 2, 3 ... in its new order, writing only the ranks that change.
  const next = [...others.slice(0, index), card, ...others.slice(index)];
  next.forEach((c, i) => {
    const f = c.id === card.id ? { ...fields } : {}, p = c.id === card.id ? { ...patch } : {};
    if (c.order !== i + 1) { f[orderCol.id] = i + 1; p[orderCol.id] = i + 1; }
    if (Object.keys(f).length) items.push({ id: c.id, plan: { fields: f, patch: p } });
  });
  return { items, sameLane, ranked: true };
}

/** The fields of a card added at the bottom of a lane: its name, the lane's value, the next rank, the link value. */
export function newCardFields(lane, title, ctx) {
  const { laneCol, orderCol = null, titleCol, link = null } = ctx;
  const out = { fields: {}, patch: {} };
  const put = (col, input) => { const [v, cell] = encodeInput(col, input, null); out.fields[col.id] = v; out.patch[col.id] = cell; };
  if (titleCol && !titleCol.isFormula && titleCol.kind !== 'Ref') put(titleCol, title);
  if (!lane.none && !laneCol.isFormula) put(laneCol, lane.value);
  if (orderCol && !orderCol.isFormula) {
    const ranks = lane.cards.map((c) => c.order).filter((x) => typeof x === 'number');
    put(orderCol, ranks.length ? Math.floor(Math.max(...ranks)) + 1 : 1);
  }
  if (link && !link.col.isFormula && link.col.id !== laneCol.id) { out.fields[link.col.id] = link.value; out.patch[link.col.id] = link.cell; }
  return out;
}

// ---- small things a card shows ------------------------------------------------------------------------

/** 'Ann Lee' -> 'AL', 'Chloé' -> 'C', 'dieter.m@x.de' -> 'D'. */
export function initials(name) {
  const words = String(name || '').replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return '?';
  const first = (w) => Array.from(w)[0].toUpperCase();
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
}

/**
 * A cell as text for a card field. Dates go through `fmtDay` (a day number -> text).
 * labels: per Reference column id, rowId -> display text.
 */
export function cellText(row, col, labels = {}, fmtDay = String) {
  const v = row[col.id];
  if (v == null || v === '') return null;
  const label = (id) => labels[col.id]?.get(id) ?? `${col.refTable}[${id}]`;
  switch (col.kind) {
    case 'Date': case 'DateTime': { const d = dayOf(v, col.type); return d == null ? null : fmtDay(d); }
    case 'Ref': { const id = refId(v); return id ? label(id) : null; }
    case 'RefList': return listOf(v).map(label).join(', ') || null;
    case 'ChoiceList': return listOf(v).join(', ') || null;
    case 'Bool': return plain(v) === true ? '✓' : null;
    case 'Numeric': case 'Int': { const n = num(v); return n == null ? null : n.toLocaleString(); }
    case 'Attachments': return null;   // not offered as a card field (FIELD_KINDS)
    default: { const p = plain(v); return p == null || p === '' ? null : String(p); }
  }
}
