// The booking grid: resources down the side, periods across, a booking in every cell it covers, and
// the free cells counted per period (pop-up stores × weekends, Grist's apartments × months).
// Pure: tests/booking.test.mjs.
//
// Periods come from one of three places:
//   calendar   days, weeks or months; a booking covers every period its dates touch
//   a table    the rows of a table with a start (and end) date: "Summer market", "Christmas market"
//   a column   the values of a column of the bookings themselves, no dates needed: a "Weekend"
//              column with Weekend 1, 2, 3
// A booking that covers several periods spans their cells. Two bookings of one resource that share a
// day (or, by column, a period) are a double booking, and both say so.

import { lanesOf, laneKeysOf, overlapping, stack, planLaneChange } from './lanes.js';
import { planDates, datesFields, encodeInput } from './edits.js';
import { dayOf, plain } from './values.js';
import { startOfUnit, nextUnit } from '../views/gantt/layout.js';

export const PERIOD_UNITS = ['day', 'week', 'month'];
const MAX_PERIODS = 400;

/** Days, weeks or months from the one containing `from` to the one containing `to`. */
export function calendarPeriods(unit, from, to, weekStart = 1) {
  const out = [];
  for (let s = startOfUnit(from, unit, weekStart); s <= to && out.length < MAX_PERIODS; s = nextUnit(s, unit, weekStart)) {
    out.push({ key: 'd:' + s, start: s, end: nextUnit(s, unit, weekStart) - 1, unit });
  }
  return out;
}

/**
 * The rows of a periods table: the first date column is the start, the second (if any) the end, the
 * first text column the name. Rows without a start are left out; the rest are sorted by start.
 */
export function tablePeriods(rows, columns) {
  const dates = columns.filter((c) => c.kind === 'Date' || c.kind === 'DateTime');
  if (!dates.length) return [];
  const name = columns.find((c) => c.kind === 'Text') || null;
  const out = [];
  for (const r of rows) {
    const start = dayOf(r[dates[0].id], dates[0].type);
    if (start == null) continue;
    const e = dates[1] ? dayOf(r[dates[1].id], dates[1].type) : null;
    out.push({ key: 'r:' + r.id, id: r.id, start, end: e != null && e >= start ? e : start, label: name ? String(plain(r[name.id]) ?? '') : null });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The values of a column of the bookings, as periods without dates (the empty value left out). */
export function columnPeriods(col, rows, labels = {}) {
  return lanesOf(col, rows, labels).filter((l) => !l.none).map((l) => ({ key: l.key, label: l.label, value: l.value, colour: l.colour }));
}

/** Which periods a booking covers: [first, last] indexes, or null when it falls outside them all. */
function coverByDates(task, periods) {
  if (task.start == null || !periods.length) return null;
  let first = -1, last = -1;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (p.end < task.start || p.start > task.end) continue;
    if (first < 0) first = i;
    last = i;
  }
  return first < 0 ? null : [first, last];
}

/**
 * @param tasks   from buildTasks (dated and undated: a booking by column needs no dates)
 * @param ctx     {resourceCol, periods, periodCol (by column) | null, labels, keep: Set of resource keys | null,
 *                 clashes: false for rows that may overlap (people on tasks)}
 * @returns {{resources, free, clashes: Set, outside: number}}
 *   resource: {key, label, value, colour, none, items: [{task, first, last, track, clash}], tracks}
 *   free[i]:  how many resources (not counting "no resource") have nothing in period i
 *   outside:  bookings with no period here (dates outside the range, or no value in the period column)
 */
export function buildBooking(tasks, rows, { resourceCol, periods, periodCol = null, labels = {}, keep = null, clashes: flag = true }) {
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const resources = lanesOf(resourceCol, rows, labels)
    .filter((l) => l.none || !keep || keep.has(l.key))
    .map((l) => ({ ...l, items: [], tracks: 1 }));
  const byKey = new Map(resources.map((r) => [r.key, r]));
  const periodIndex = new Map(periods.map((p, i) => [p.key, i]));
  let outside = 0;
  for (const task of tasks) {
    const row = rowOf.get(task.id);
    if (!row) continue;
    let cover = null;
    if (periodCol) {
      const i = periodIndex.get(laneKeysOf(row[periodCol.id], periodCol)[0]);
      cover = i == null ? null : [i, i];
    } else cover = coverByDates(task, periods);
    if (!cover) { outside++; continue; }
    for (const k of laneKeysOf(row[resourceCol.id], resourceCol)) {
      byKey.get(k)?.items.push({ task, first: cover[0], last: cover[1], track: 0, clash: false });
    }
  }
  const clashes = new Set();
  const free = periods.map(() => 0);
  for (const res of resources) {
    res.tracks = stack(res.items.map((it) => Object.assign(it, { a: it.first, b: it.last })));
    if (!res.none && flag) {
      // By dates, a clash is a shared DAY, not a shared cell: a lease ending on the 14th and the next
      // one starting on the 15th share January's cell and are not a double booking.
      const hit = overlapping(res.items.map((it) => (periodCol ? { id: it.task.id, a: it.first, b: it.last } : { id: it.task.id, a: it.task.start, b: it.task.end })));
      for (const it of res.items) if (hit.has(it.task.id)) { it.clash = true; clashes.add(it.task.id); }
    }
    if (!res.none) {
      const used = new Array(periods.length).fill(false);
      for (const it of res.items) for (let i = it.first; i <= it.last; i++) used[i] = true;
      used.forEach((u, i) => { if (!u) free[i]++; });
    }
  }
  return { resources: resources.filter((r) => !r.none || r.items.length), free, clashes, outside };
}

/** Is this cell free (nothing of that resource covers that period)? */
export const isFree = (resource, i) => !resource.items.some((it) => it.first <= i && it.last >= i);

/**
 * The cells a booking dragged to another cell writes: the resource when the row changes; by dates, the
 * dates shifted by the distance between the periods (a lease from 15 Jan dropped on February starts
 * 15 Feb); by column, the period column.
 * @param move  {item, from (resource), to (resource), period: index of the target cell for the item's first period}
 * @param ctx   {resourceCol, periods, periodCol, edit: the edits.js context (roles, columns, settings, calendar, editable)}
 * @returns {{fields, patch} | {error}}
 */
export function planBookingMove(task, row, move, ctx) {
  const { resourceCol, periods, periodCol = null, edit } = ctx;
  const out = { fields: {}, patch: {} };
  const merge = (p) => { Object.assign(out.fields, p.fields); Object.assign(out.patch, p.patch); };
  if (move.to.key !== move.from.key) {
    const p = planLaneChange(row, resourceCol, move.from, move.to);
    if (p.error) return { error: 'resourceFormula' };
    merge(p);
  }
  if (move.period !== move.item.first) {
    if (periodCol) {
      const target = periods[move.period];
      if (!target) return { error: 'gone' };
      const p = planLaneChange(row, periodCol, { none: false, value: periods[move.item.first].value }, { none: false, value: target.value });
      if (p.error) return { error: 'periodFormula' };
      merge(p);
    } else {
      const delta = periods[move.period].start - periods[move.item.first].start;
      const p = planDates(task, row, edit, 'move', task.start + delta, task.end + delta);
      if (p.error) return { error: 'datesFormula' };
      merge(p);
    }
  }
  return out;
}

/**
 * A new booking for a free cell: the resource, the period (its dates, or its value in the period
 * column), a name when the name column is text, and the linked widget's selection.
 */
export function newBookingFields(resource, period, ctx) {
  const { resourceCol, periodCol = null, edit, titleCol = null, title = null, link = null } = ctx;
  const out = periodCol ? { fields: {}, patch: {} } : datesFields(edit, period.start, period.end);
  const put = (col, input) => { const [v, c] = encodeInput(col, input, null); out.fields[col.id] = v; out.patch[col.id] = c; };
  if (!resource.none && !resourceCol.isFormula) put(resourceCol, resourceCol.kind === 'RefList' || resourceCol.kind === 'ChoiceList' ? [resource.value] : resource.value);
  if (periodCol && !periodCol.isFormula) put(periodCol, periodCol.kind === 'RefList' || periodCol.kind === 'ChoiceList' ? [period.value] : period.value);
  if (title && titleCol && !titleCol.isFormula && (titleCol.kind === 'Text' || titleCol.kind === 'Any')) put(titleCol, title);
  if (link && !link.col.isFormula && !(link.col.id in out.fields)) { out.fields[link.col.id] = link.value; out.patch[link.col.id] = link.cell; }
  return out;
}

/**
 * Calendar periods to cover the bookings and today: from a little before the first to a little after
 * the last, at most MAX_PERIODS.
 */
export function bookingRange(tasks, unit, today) {
  let from = today, to = today;
  for (const t of tasks) { if (t.start == null) continue; if (t.start < from) from = t.start; if (t.end > to) to = t.end; }
  const pad = { day: [3, 14], week: [2, 8], month: [1, 6] }[unit] || [2, 8];
  const unitDays = { day: 1, week: 7, month: 31 }[unit] || 7;
  return { from: from - pad[0] * unitDays, to: to + pad[1] * unitDays };
}

/** The period unit that suits these bookings: days for short ones, months for leases. */
export function suggestUnit(tasks) {
  const lens = tasks.filter((t) => t.start != null).map((t) => t.end - t.start + 1).sort((a, b) => a - b);
  if (!lens.length) return 'week';
  const mid = lens[Math.floor(lens.length / 2)];
  return mid <= 2 ? 'day' : mid <= 21 ? 'week' : 'month';
}
