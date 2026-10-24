// What an edit writes: which cells, in which shape. Pure, so every case is tested in Node
// (tests/edits.test.mjs) before a drag ever touches someone's table.
//
// Rules:
//   - Formula columns are never written. A gesture that would need one is not offered.
//   - One gesture = one UpdateRecord = one undo step in Grist.
//   - A Date cell is stored as UTC midnight of its day. A DateTime cell keeps its time of day in its
//     own zone, so moving a 09:00 meeting by a week leaves it at 09:00, across a DST change too.
//   - An end date is written as the last day, or as the day after when the widget is set so.
//
// Every function returns {fields, patch}: `fields` go to Grist, `patch` is the same change in the
// encoded shape the widget keeps its rows in, so the bar can stay where it was dropped until Grist
// sends the rows back (about 300 ms, M0).

import { dayToEpochSeconds } from '../core/grist/dates.js';
import { dayOf, refId, listOf } from './values.js';
import { makeCalendar } from './calendar.js';

const PLAIN = makeCalendar();
const calOf = (ctx) => ctx.calendar || PLAIN;

const DAY = 86400;
const ymd = (day) => { const d = new Date(day * 864e5); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
const zoneOf = (col) => (/^DateTime:(.+)$/.exec(col.type) || [])[1] || 'UTC';

/** The column a role uses, or null. */
const colFor = (ctx, role) => (ctx.roles[role] ? ctx.columns.find((c) => c.id === ctx.roles[role]) || null : null);
/** ...and only if Plan Studio may write it. */
const writableCol = (ctx, role) => { const c = colFor(ctx, role); return c && !c.isFormula ? c : null; };

/** A day -> [value for Grist, encoded cell]. A DateTime keeps the time of day of the cell it replaces. */
export function encodeDay(day, col, oldCell) {
  if (col.kind !== 'DateTime') return [day * DAY, ['d', day * DAY]];
  const zone = zoneOf(col);
  const midnight = dayToEpochSeconds(...ymd(day), zone);
  let secs = midnight;
  if (Array.isArray(oldCell) && oldCell[0] === 'D' && typeof oldCell[1] === 'number') {
    const oldDay = dayOf(oldCell);
    secs = midnight + (oldCell[1] - dayToEpochSeconds(...ymd(oldDay), zone));
  }
  return [secs, ['D', secs, zone]];
}

/**
 * What can be done to a task's dates, given which columns are formulas. The view offers only these.
 * @returns {{move: boolean, start: boolean, end: boolean, draw: boolean}}
 */
export function capabilities(task, ctx) {
  const none = { move: false, start: false, end: false, draw: false };
  if (!ctx.editable) return none;
  const w = (r) => !!writableCol(ctx, r);
  if (task.start == null) return { ...none, draw: w('start') || w('due') || w('end') };
  if (task.fromDue) {
    const at = task.endFrom === 'end' ? w('end') : w('due');
    return { move: at, start: w('start'), end: at && task.kind !== 'milestone', draw: false };
  }
  if (task.kind === 'milestone') return { ...none, move: w('start') };
  const endBy = {
    end: w('end') || w('duration'),
    due: w('due'),
    duration: w('duration'),
    start: w('end') || w('due') || w('duration'),
  }[task.endFrom] || false;
  // Moving the start keeps the end: impossible when the end is a formula (it would follow the start)
  // or when it is a duration we cannot rewrite.
  const startKeepsEnd = task.endFrom === 'end' ? w('end') : task.endFrom === 'duration' ? w('duration') : task.endFrom !== 'start';
  return { move: w('start'), start: w('start') && startKeepsEnd, end: endBy, draw: false };
}

function put(out, col, value, cell) { out.fields[col.id] = value; out.patch[col.id] = cell === undefined ? value : cell; }
function putDay(out, col, day, oldCell) { const [v, cell] = encodeDay(day, col, oldCell); put(out, col, v, cell); }
const storedEnd = (ctx, inclusiveEnd) => inclusiveEnd + (ctx.settings?.endInclusive === false ? 1 : 0);

/** Write an inclusive end through whichever column the task takes its end from. */
function writeEnd(out, task, row, ctx, start, end) {
  const via = task.endFrom === 'start' || task.endFrom == null ? null : task.endFrom;
  const order = via === 'end' ? ['end', 'duration'] : via === 'due' ? ['due'] : via === 'duration' ? ['duration'] : ['end', 'due', 'duration'];
  for (const role of order) {
    const col = writableCol(ctx, role);
    if (!col) continue;
    if (role === 'end') putDay(out, col, storedEnd(ctx, end), row[col.id]);
    else if (role === 'due') putDay(out, col, end, row[col.id]);
    else put(out, col, calOf(ctx).length(start, end));
    return true;
  }
  return false;
}

/**
 * The cells a date change writes.
 * @param mode 'move' | 'start' | 'end' | 'draw'
 * @param start,end  the new first and last day (inclusive)
 * @returns {{fields: object, patch: object} | {error: string}}
 */
export function planDates(task, row, ctx, mode, start, end) {
  if (end < start) return { error: 'endBeforeStart' };
  const caps = capabilities(task, ctx);
  if (!caps[mode]) return { error: 'notAllowed' };
  const out = { fields: {}, patch: {} };
  const startCol = writableCol(ctx, 'start');

  if (mode === 'draw') {
    if (startCol) {
      putDay(out, startCol, start, row[startCol.id]);
      if (end > start) writeEnd(out, { endFrom: null }, row, ctx, start, end);
    } else {
      const col = writableCol(ctx, 'due') || writableCol(ctx, 'end');
      putDay(out, col, col === writableCol(ctx, 'end') ? storedEnd(ctx, end) : end, row[col.id]);
    }
    return out;
  }

  if (task.fromDue) {
    const atCol = task.endFrom === 'end' ? writableCol(ctx, 'end') : writableCol(ctx, 'due');
    if (mode === 'start') { putDay(out, startCol, start, row[startCol.id]); return out; }
    const raw = dayOf(row[atCol.id], atCol.type);
    const target = mode === 'move' ? raw + (end - task.end) : (atCol === writableCol(ctx, 'end') ? storedEnd(ctx, end) : end);
    putDay(out, atCol, target, row[atCol.id]);
    return out;
  }

  if (mode === 'move') {
    putDay(out, startCol, start, row[startCol.id]);
    // The end moves to the end asked for when it is a cell of its own; a duration or a formula follows by
    // itself. A drag asks for the same shift as the start; a push or a levelling in working days asks
    // for the end that keeps the task's working days, which can be a different shift across a weekend.
    const endDelta = end - task.end;
    for (const role of ['end', 'due']) {
      const col = writableCol(ctx, role);
      if (!col || (task.endFrom !== role && !(task.kind === 'milestone' && role === 'end'))) continue;
      const raw = dayOf(row[col.id], col.type);
      if (raw != null) putDay(out, col, raw + endDelta, row[col.id]);
    }
    return out;
  }
  if (mode === 'start') {
    putDay(out, startCol, start, row[startCol.id]);
    if (task.endFrom === 'duration') put(out, writableCol(ctx, 'duration'), calOf(ctx).length(start, task.end));
    return out;
  }
  // mode === 'end'
  if (!writeEnd(out, task, row, ctx, task.start, end)) return { error: 'notAllowed' };
  return out;
}

// ---- other cells (quick edit) ----------------------------------------------------------------------

/**
 * A value typed in the quick-edit form -> [value for Grist, encoded cell].
 * Inputs: Text/Choice/Any a string, Numeric/Int a number or '', Bool a boolean, Date/DateTime a day
 * number or null, Ref a row id or 0, RefList/ChoiceList an array.
 */
export function encodeInput(col, input, oldCell) {
  switch (col.kind) {
    case 'Date': case 'DateTime':
      return input == null ? [null, null] : encodeDay(input, col, oldCell);
    case 'Numeric': case 'Int': {
      if (input === '' || input == null || !isFinite(Number(input))) return [null, null];
      const n = col.kind === 'Int' ? Math.round(Number(input)) : Number(input);
      return [n, n];
    }
    case 'Bool': return [!!input, !!input];
    case 'Ref': { const id = Number(input) || 0; return [id, id ? ['R', col.refTable, id] : null]; }
    case 'RefList': { const ids = (input || []).map(Number).filter(Boolean); return ids.length ? [['L', ...ids], ['L', ...ids]] : [null, null]; }
    case 'ChoiceList': { const v = (input || []).filter((x) => x !== ''); return v.length ? [['L', ...v], ['L', ...v]] : [null, null]; }
    default: return [input == null ? '' : String(input), input == null ? '' : String(input)];
  }
}

// ---- new tasks ----------------------------------------------------------------------------------------

/**
 * The value a new task needs so that it stays visible when this widget is filtered by a linked
 * widget (Select by). Grist does not fill it for records a widget creates (M0, question 4), so it
 * is read off the rows on show: the one value they all share. Null when there are no rows or they
 * do not agree.
 */
export function linkValue(rows, col) {
  if (!col || !rows.length) return null;
  if (col.kind === 'Ref') {
    const ids = new Set(rows.map((r) => refId(r[col.id])));
    const [id] = ids;
    return ids.size === 1 && id ? { col, value: id, cell: ['R', col.refTable, id] } : null;
  }
  if (col.kind === 'RefList' || col.kind === 'ChoiceList') {
    let common = null;
    for (const r of rows) {
      const items = new Set(listOf(r[col.id]));
      common = common ? new Set([...common].filter((x) => items.has(x))) : items;
    }
    if (!common || common.size !== 1) return null;
    const [v] = common;
    return { col, value: ['L', v], cell: ['L', v] };
  }
  const vals = new Set(rows.map((r) => r[col.id]));
  const [v] = vals;
  return vals.size === 1 && v != null && v !== '' && !Array.isArray(v) ? { col, value: v, cell: v } : null;
}

/** The fields of a new task dated `day`: its name, the first date column that can be written, the link value. */
export function newTaskFields(ctx, { day, title, link = null }) {
  const out = { fields: {}, patch: {} };
  const titleCol = writableCol(ctx, 'title');
  if (titleCol && titleCol.kind !== 'Ref') put(out, titleCol, title);
  const dateCol = writableCol(ctx, 'start') || writableCol(ctx, 'due') || writableCol(ctx, 'end');
  if (dateCol) putDay(out, dateCol, dateCol === colFor(ctx, 'end') ? storedEnd(ctx, day) : day, null);
  if (link && !link.col.isFormula) put(out, link.col, link.value, link.cell);
  return out;
}

/**
 * The date cells of a new row running from `start` to `end` (inclusive), as the booking grid writes a
 * booking: the start and the end (or a duration, or a due date), or only the due date when there is
 * no start column.
 */
export function datesFields(ctx, start, end) {
  const out = { fields: {}, patch: {} };
  const startCol = writableCol(ctx, 'start');
  if (startCol) {
    putDay(out, startCol, start, null);
    const endCol = writableCol(ctx, 'end'), durCol = writableCol(ctx, 'duration'), dueCol = writableCol(ctx, 'due');
    if (endCol) putDay(out, endCol, storedEnd(ctx, end), null);
    else if (durCol) put(out, durCol, calOf(ctx).length(start, end));
    else if (dueCol) putDay(out, dueCol, end, null);
    return out;
  }
  const col = writableCol(ctx, 'due') || writableCol(ctx, 'end');
  if (col) putDay(out, col, col === colFor(ctx, 'end') ? storedEnd(ctx, end) : end, null);
  return out;
}

// ---- dependencies --------------------------------------------------------------------------------------

/** Can links be drawn at all? (A "Depends on" column that is data, and a widget that may write.) */
export function canLink(ctx) {
  const c = writableCol(ctx, 'dependsOn');
  return !!(ctx.editable && c && (c.kind === 'RefList' || c.kind === 'Ref'));
}

/** Make `predId` a predecessor of the task in `row`. A Ref column holds one, so it is replaced. */
export function planLink(row, ctx, predId) {
  const col = writableCol(ctx, 'dependsOn');
  if (!col || !ctx.editable) return { error: 'notAllowed' };
  if (col.kind === 'Ref') return { fields: { [col.id]: predId }, patch: { [col.id]: ['R', col.refTable, predId] } };
  const now = listOf(row[col.id]).filter((x) => typeof x === 'number');
  if (now.includes(predId)) return { error: 'already' };
  const next = ['L', ...now, predId];
  return { fields: { [col.id]: next }, patch: { [col.id]: next } };
}

/** Remove `predId` from the predecessors of the task in `row`. */
export function planUnlink(row, ctx, predId) {
  const col = writableCol(ctx, 'dependsOn');
  if (!col || !ctx.editable) return { error: 'notAllowed' };
  if (col.kind === 'Ref') return { fields: { [col.id]: 0 }, patch: { [col.id]: null } };
  const rest = listOf(row[col.id]).filter((x) => typeof x === 'number' && x !== predId);
  const next = rest.length ? ['L', ...rest] : null;
  return { fields: { [col.id]: next }, patch: { [col.id]: next } };
}
