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
import { isDoneStatus } from './tasks.js';
import { lanesOf } from './lanes.js';

export const LANE_KINDS = ['Choice', 'Ref', 'Text'];
/** Columns a card can show (attachments and lists of numbers would only show ids). */
export const FIELD_KINDS = ['Text', 'Choice', 'ChoiceList', 'Ref', 'RefList', 'Date', 'DateTime', 'Numeric', 'Int', 'Bool', 'Any'];
const NONE = '';

// A status that means finished (tasks.js): such a card is never late and does not count against a
// lane's limit, even in a table without a Done column.
export { isDoneStatus };

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
 *                 everyone (every task, when the quick filters keep only some: a lane's open count and its total then look at all of them),
 *                 sorter (a comparator over tasks, M15: the cards of a lane go in that order, not the order column's; the board then says `sorted`),
 *                 swimCol (M23: rows of lanes, one band for each value of this Choice, Reference or Text column),
 *                 kids (a Map task id -> {done, total}: the card of a task that has sub-tasks says how many are done),
 *                 timeOf(taskId) -> {logged, planned} | null (time tracking, M10)}
 * @returns {{lanes: Array, byId: Map}}  lane: {key, label, value, colour, cards, open, total, hidden, limit, over, none}
 */
export function buildBoard(tasks, rows, ctx) {
  const { laneCol, orderCol = null, labels = {}, fields = [], hideEmpty = false, wip = {}, today = null, cellText = null, timeOf = null, everyone = null, sorter = null, swimCol = null, kids = null } = ctx;
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
      swim: swimCol ? laneKeyOf(row[swimCol.id], swimCol) : null,
      blocked: !!task.blocked,
      checks: task.checks || null,
      overDeadline: task.overDeadline || 0,
      sub: kids?.get(task.id) || null,
    };
    card.hash = [card.title, card.lane, card.order, card.colour, card.people.join('|'), card.done, card.progress,
      card.due, card.span, card.late, card.time ? `${Math.round(card.time.logged * 100)}/${card.time.planned ?? ''}` : '', card.swim, card.blocked, card.overDeadline, card.checks ? `${card.checks.done}/${card.checks.total}` : '', card.sub ? `${card.sub.done}/${card.sub.total}` : '', ...card.fields.map((f) => f.text)].join('\u0001');
    lane.cards.push(card);
    byId.set(card.id, card);
  }

  // With filters on, the cards are the ones they keep, but a lane's limit and its count are about every card in it.
  const totalOf = new Map(), openOf = new Map();
  if (everyone) {
    for (const task of everyone) {
      const row = rowOf.get(task.id);
      if (!row) continue;
      const key = laneKeyOf(row[laneCol.id], laneCol);
      totalOf.set(key, (totalOf.get(key) || 0) + 1);
      if (!(!!task.done || (task.progress != null && task.progress >= 1) || isDoneStatus(task.status))) openOf.set(key, (openOf.get(key) || 0) + 1);
    }
  }

  // Alphabetical lanes for Text, with the choice list or the referenced table deciding otherwise.
  let list = [...lanes.values()];
  if (laneCol.kind === 'Text') list = [list[0], ...list.slice(1).sort((a, b) => String(a.label).localeCompare(String(b.label)))];
  const rank = sorter ? new Map([...tasks].sort(sorter).map((x, i) => [x.id, i])) : null;
  for (const lane of list) {
    lane.cards.sort(rank ? (a, b) => rank.get(a.id) - rank.get(b.id) : byRank);
    lane.open = everyone ? openOf.get(lane.key) || 0 : lane.cards.filter((c) => !c.done).length;
    lane.total = everyone ? Math.max(totalOf.get(lane.key) || 0, lane.cards.length) : lane.cards.length;
    lane.hidden = lane.total - lane.cards.length;
    lane.limit = Number.isInteger(wip[lane.key]) && wip[lane.key] > 0 ? wip[lane.key] : null;
    lane.over = lane.limit != null && lane.open > lane.limit ? lane.open - lane.limit : 0;
  }
  list = list.filter((l) => (l.none ? l.cards.length > 0 : hideEmpty ? l.total > 0 : true));
  // Bands of lanes: the same cards, grouped by the swim column's value (the empty value last). A value the column offers (a person,
  // a choice) keeps its band without cards, as a place to drop one, unless empty lanes are hidden; the empty value only has one with cards.
  let swims;
  if (swimCol) {
    const defs = lanesOf(swimCol, rows, labels);
    const ordered = [...defs.filter((d) => !d.none), ...defs.filter((d) => d.none)];
    swims = ordered.map((d) => ({ key: d.key, label: d.label, value: d.value, none: d.none, lanes: list.map((l) => ({ key: l.key, cards: l.cards.filter((c) => c.swim === d.key) })) }))
      .filter((s) => s.lanes.some((l) => l.cards.length) || (!hideEmpty && !s.none && swimCol.kind !== 'Text'));
  } else swims = [{ key: '', label: null, value: '', none: true, lanes: list.map((l) => ({ key: l.key, cards: l.cards })) }];
  return { lanes: list, byId, sorted: !!rank, swims, swimmed: !!swimCol };
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
 * @param move     {id, toKey, swimKey?, index}  index counts the cards of the target lane (of the target band, with swimlanes) without the moved one
 * @param ctx      {laneCol, orderCol, rows, swimCol?}
 * @returns {{items: Array<{id, plan: {fields, patch}}>, sameLane: boolean, ranked: boolean} | {error: string}}
 */
export function planCardMove(board, move, ctx) {
  const { laneCol, orderCol = null, rows, swimCol = null } = ctx;
  const card = board.byId.get(move.id);
  const lane = board.lanes.find((l) => l.key === move.toKey);
  if (!card || !lane) return { error: 'gone' };
  const toSwim = swimCol ? (move.swimKey ?? card.swim) : null;
  const swimChanged = !!swimCol && toSwim !== card.swim;
  const sameLane = card.lane === lane.key && !swimChanged;
  if (card.lane !== lane.key && laneCol.isFormula) return { error: 'laneFormula' };
  if (swimChanged && swimCol.isFormula) return { error: 'swimFormula' };
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  // with bands, the neighbours are the cards of the same band: the rank goes between them
  const others = lane.cards.filter((c) => c.id !== card.id && (!swimCol || c.swim === toSwim));
  const index = Math.max(0, Math.min(others.length, move.index));
  const items = [];
  const fields = {}, patch = {};

  if (card.lane !== lane.key) {
    const [v, cell] = encodeInput(laneCol, lane.value, rowOf.get(card.id)?.[laneCol.id]);
    fields[laneCol.id] = v;
    patch[laneCol.id] = cell;
  }
  if (swimChanged) {
    const band = board.swims.find((s) => s.key === toSwim);
    if (!band) return { error: 'gone' };
    const [v, cell] = encodeInput(swimCol, band.value, rowOf.get(card.id)?.[swimCol.id]);
    fields[swimCol.id] = v;
    patch[swimCol.id] = cell;
  }
  // Sorted by the person (Display), the cards are not in their own order: a drop can change the lane, never the place in it.
  const canRank = orderCol && !orderCol.isFormula && !board.sorted;
  if (!canRank) {
    if (sameLane) return { error: board.sorted ? 'sorted' : orderCol ? 'orderFormula' : 'noOrder' };
    return { items: [{ id: card.id, plan: { fields, patch } }], sameLane, swimChanged, ranked: false };
  }

  const at = (i) => (i < 0 || i >= others.length ? undefined : others[i].order);
  const rank = rankBetween(at(index - 1), at(index), orderCol.kind === 'Int' ? 'Int' : 'Numeric', card.order);
  if (rank != null) {
    if (rank !== card.order) { fields[orderCol.id] = rank; patch[orderCol.id] = rank; }
    if (Object.keys(fields).length) items.push({ id: card.id, plan: { fields, patch } });
    return { items, sameLane, swimChanged, ranked: true };
  }
  // No room: number the lane 1, 2, 3 ... in its new order, writing only the ranks that change.
  const next = [...others.slice(0, index), card, ...others.slice(index)];
  next.forEach((c, i) => {
    const f = c.id === card.id ? { ...fields } : {}, p = c.id === card.id ? { ...patch } : {};
    if (c.order !== i + 1) { f[orderCol.id] = i + 1; p[orderCol.id] = i + 1; }
    if (Object.keys(f).length) items.push({ id: c.id, plan: { fields: f, patch: p } });
  });
  return { items, sameLane, swimChanged, ranked: true };
}

/**
 * Ranks for `k` cards that land together between `above` and `below` (numbers, or undefined at a lane's edge), in that order.
 * Null when there is no room and the lane has to be numbered again.
 */
export function ranksBetween(above, below, k, kind = 'Numeric') {
  const has = (x) => typeof x === 'number' && isFinite(x);
  if (above === null || below === null) return null;
  const upTo = (n) => Array.from({ length: k }, (_, i) => n(i + 1));
  if (!has(above) && !has(below)) return upTo((i) => i);
  if (!has(above)) return upTo((i) => (kind === 'Int' ? Math.ceil(below) : below) - (k - i + 1));
  if (!has(below)) return upTo((i) => (kind === 'Int' ? Math.floor(above) : above) + i);
  if (kind === 'Int') return below - above > k ? upTo((i) => above + i) : null;
  const step = (below - above) / (k + 1);
  return step > 1e-9 * Math.max(1, Math.abs(above)) ? upTo((i) => above + step * i) : null;
}

/**
 * The writes for several cards dropped together at `index` in the lane with key `toKey`: each takes the lane's value (and the band's),
 * and they land one after the other, in the order they are drawn.
 * @param move  {id (the card that was dragged), ids (all the cards that go), toKey, swimKey?, index}  index counts the cards of the
 *              target lane (of the band) without the dragged one, as the drop reports it
 * @returns {{items, sameLane, ranked, count}| {error}}
 */
export function planCardsMove(board, move, ctx) {
  const { laneCol, orderCol = null, rows, swimCol = null } = ctx;
  const lane = board.lanes.find((l) => l.key === move.toKey);
  const wanted = new Set(move.ids || [move.id]);
  // the cards that go, in the order the board draws them (lane by lane)
  const cards = board.lanes.flatMap((l) => l.cards).filter((c) => wanted.has(c.id));
  if (!lane || !cards.length) return { error: 'gone' };
  if (cards.length === 1) return planCardMove(board, { id: cards[0].id, toKey: move.toKey, swimKey: move.swimKey, index: move.index }, ctx);
  const toSwim = swimCol ? (move.swimKey ?? cards.find((c) => c.id === move.id)?.swim ?? cards[0].swim) : null;
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const band = swimCol ? board.swims.find((s) => s.key === toSwim) : null;
  if (swimCol && !band) return { error: 'gone' };
  const fieldsOf = (card) => {
    const fields = {}, patch = {};
    if (card.lane !== lane.key) {
      if (laneCol.isFormula) return { error: 'laneFormula' };
      const [v, cell] = encodeInput(laneCol, lane.value, rowOf.get(card.id)?.[laneCol.id]);
      fields[laneCol.id] = v; patch[laneCol.id] = cell;
    }
    if (swimCol && card.swim !== toSwim) {
      if (swimCol.isFormula) return { error: 'swimFormula' };
      const [v, cell] = encodeInput(swimCol, band.value, rowOf.get(card.id)?.[swimCol.id]);
      fields[swimCol.id] = v; patch[swimCol.id] = cell;
    }
    return { fields, patch };
  };
  const moves = [];
  for (const card of cards) {
    const f = fieldsOf(card);
    if (f.error) return f;
    moves.push({ card, ...f });
  }
  const sameLane = moves.every((m) => !Object.keys(m.fields).length);
  const canRank = orderCol && !orderCol.isFormula && !board.sorted;
  if (!canRank) {
    if (sameLane) return { error: board.sorted ? 'sorted' : orderCol ? 'orderFormula' : 'noOrder' };
    return { items: moves.filter((m) => Object.keys(m.fields).length).map((m) => ({ id: m.card.id, plan: { fields: m.fields, patch: m.patch } })), sameLane, ranked: false, count: cards.length };
  }
  // where they land among the cards that stay: the drop's index counts the cards of the lane without the dragged one
  const inBand = (c) => !swimCol || c.swim === toSwim;
  const others = lane.cards.filter((c) => !wanted.has(c.id) && inBand(c));
  const before = lane.cards.filter((c) => c.id !== move.id && inBand(c)).slice(0, Math.max(0, move.index));
  const at0 = Math.min(others.length, before.filter((c) => !wanted.has(c.id)).length);
  const at = (i) => (i < 0 || i >= others.length ? undefined : others[i].order);
  const kind = orderCol.kind === 'Int' ? 'Int' : 'Numeric';
  const ranks = ranksBetween(at(at0 - 1), at(at0), moves.length, kind);
  const items = [];
  const put = (m, rank) => {
    const fields = { ...m.fields }, patch = { ...m.patch };
    if (rank !== m.card.order) { fields[orderCol.id] = rank; patch[orderCol.id] = rank; }
    if (Object.keys(fields).length) items.push({ id: m.card.id, plan: { fields, patch } });
  };
  if (ranks) { moves.forEach((m, i) => put(m, ranks[i])); return { items, sameLane, ranked: true, count: cards.length }; }
  // no room: number the lane 1, 2, 3 ... in its new order, writing only the ranks that change
  const next = [...others.slice(0, at0).map((c) => ({ card: c, fields: {}, patch: {} })), ...moves, ...others.slice(at0).map((c) => ({ card: c, fields: {}, patch: {} }))];
  next.forEach((m, i) => put(m, i + 1));
  return { items, sameLane, ranked: true, count: cards.length };
}

/** The fields of a card added at the bottom of a lane: its name, the lane's value, the next rank, the link value. */
export function newCardFields(lane, title, ctx) {
  const { laneCol, orderCol = null, titleCol, link = null, swim = null } = ctx;
  const out = { fields: {}, patch: {} };
  const put = (col, input) => { const [v, cell] = encodeInput(col, input, null); out.fields[col.id] = v; out.patch[col.id] = cell; };
  if (titleCol && !titleCol.isFormula && titleCol.kind !== 'Ref') put(titleCol, title);
  if (!lane.none && !laneCol.isFormula) put(laneCol, lane.value);
  // a card added inside a band belongs to it
  if (swim && !swim.none && !swim.col.isFormula) put(swim.col, swim.value);
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
