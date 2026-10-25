// Copies of a task on later dates (M24): which days the copies start on. Pure: tests/series.test.mjs.
//
// A copy keeps the length of what it copies, so only its first day is needed; the rest of the dates of the copy (and of
// its sub-tasks) move by the same number of days. Months are calendar months: the 31st plus a month is the last day of the
// next one, never a day in the month after.

export const UNITS = ['day', 'week', 'month'];
export const MAX_COPIES = 100;

const DAY_MS = 864e5;

/** `day` plus a number of calendar months, the day of the month kept or cut back to the last day of that month. */
export function addMonths(day, n) {
  const d = new Date(day * DAY_MS);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
  const total = m + n;
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return Date.UTC(ny, nm, Math.min(dd, last)) / DAY_MS;
}

/** The start of copy number `k` (0 is the first), one every `every` days, weeks or months. */
export function startOf(first, k, every, unit) {
  const n = k * Math.max(1, Math.round(every) || 1);
  if (unit === 'month') return addMonths(first, n);
  return first + n * (unit === 'week' ? 7 : 1);
}

/**
 * The days the copies start on: `times` copies, the first on `first`, the next ones `every` days, weeks or months later,
 * stopping at the day `until` when there is one. At most MAX_COPIES.
 */
export function seriesStarts({ first, times = 1, every = 1, unit = 'week', until = null }) {
  const out = [];
  const count = Math.min(Math.max(1, Math.round(times) || 1), MAX_COPIES);
  for (let k = 0; k < count; k++) {
    const s = startOf(first, k, every, unit);
    if (until != null && s > until) break;
    out.push(s);
  }
  return out;
}

/** How many days each copy moves by, from the day the original starts. */
export const deltasOf = (anchor, starts) => starts.map((s) => s - anchor);
