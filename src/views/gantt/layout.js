// Where everything in the Gantt chart goes, as numbers. No DOM here: the view (gantt/view.js) only
// draws what these functions return, so the geometry is tested in Node (tests/layout.test.mjs).
//
// Time is day numbers (days since 1970-01-01, see model/values.js). A frame is the stretch of days
// the chart can scroll across and how many pixels a day gets at the current zoom.

/** Zoom levels: pixels per day, the padding added around the tasks, and the two header rows. */
export const ZOOMS = {
  day: { px: 32, pad: 7, top: 'month', bottom: 'day' },
  week: { px: 12, pad: 14, top: 'month', bottom: 'week' },
  month: { px: 4, pad: 31, top: 'year', bottom: 'month' },
  quarter: { px: 1.4, pad: 92, top: 'year', bottom: 'quarter' },
  year: { px: 0.5, pad: 366, top: null, bottom: 'year' },
};
export const ZOOM_ORDER = ['day', 'week', 'month', 'quarter', 'year'];

export const ROW_H = 32;
export const BAR_H = 20;

const mod = (a, n) => ((a % n) + n) % n;

/** 0 = Sunday … 6 = Saturday. Day 0 (1 Jan 1970) was a Thursday. */
export const weekday = (day) => mod(day + 4, 7);

const ymd = (day) => { const d = new Date(day * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
const dayOfYmd = (y, m, d) => Math.round(Date.UTC(y, m, d) / 864e5);

/** ISO 8601 week: weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeek(day) {
  const thursday = day + 3 - mod(weekday(day) + 6, 7);
  const y = ymd(thursday).y;
  return { year: y, week: Math.floor((thursday - dayOfYmd(y, 0, 1)) / 7) + 1 };
}

/** The first day of the unit (day, week, month, quarter, year) that contains `day`. */
export function startOfUnit(day, unit, weekStart = 1) {
  if (unit === 'day') return day;
  if (unit === 'week') return day - mod(weekday(day) - weekStart, 7);
  const { y, m } = ymd(day);
  if (unit === 'month') return dayOfYmd(y, m, 1);
  if (unit === 'quarter') return dayOfYmd(y, m - (m % 3), 1);
  return dayOfYmd(y, 0, 1);
}

/** The first day of the NEXT unit. */
export function nextUnit(day, unit, weekStart = 1) {
  const s = startOfUnit(day, unit, weekStart);
  if (unit === 'day') return s + 1;
  if (unit === 'week') return s + 7;
  const { y, m } = ymd(s);
  if (unit === 'month') return dayOfYmd(y, m + 1, 1);
  if (unit === 'quarter') return dayOfYmd(y, m + 3, 1);
  return dayOfYmd(y + 1, 0, 1);
}

/**
 * The scrollable stretch: every task and today, plus padding, snapped to whole header units.
 * @param {{from:number,to:number}|null} span  first and last task day (null: no tasks)
 */
export function makeFrame(span, today, zoom = 'week', weekStart = 1) {
  const z = ZOOMS[zoom] || ZOOMS.week;
  const lo = Math.min(span ? span.from : today, today) - z.pad;
  const hi = Math.max(span ? span.to : today, today) + z.pad;
  const snap = z.top || z.bottom;
  const from = startOfUnit(lo, snap, weekStart);
  const to = nextUnit(hi, snap, weekStart) - 1;
  return { zoom, px: z.px, from, to, weekStart, width: Math.round((to - from + 1) * z.px) };
}

export const xOf = (frame, day) => (day - frame.from) * frame.px;
export const dayAt = (frame, x) => frame.from + Math.floor(x / frame.px);

/**
 * Header cells for one unit between two x positions (only what is on screen gets drawn).
 * Each cell: {start, end (inclusive), x, w, y, m, d, q, wk, wkYear}.
 */
export function ticks(frame, unit, x0 = 0, x1 = frame.width) {
  const out = [];
  let s = startOfUnit(Math.max(frame.from, dayAt(frame, Math.max(0, x0))), unit, frame.weekStart);
  const last = Math.min(frame.to, dayAt(frame, x1));
  for (let guard = 0; s <= last && guard < 5000; guard++) {
    const n = nextUnit(s, unit, frame.weekStart);
    const a = Math.max(s, frame.from), b = Math.min(n - 1, frame.to);
    const { y, m, d } = ymd(s);
    // A week is numbered by the ISO week most of its days fall in: the Wednesday or Thursday of it,
    // whether it starts on Monday or on Sunday.
    const w = isoWeek(s + 3);
    out.push({ start: a, end: b, x: xOf(frame, a), w: (b - a + 1) * frame.px, y, m, d, q: Math.floor(m / 3) + 1, wk: w.week, wkYear: w.year });
    s = n;
  }
  return out;
}

/** Weekend days to shade between two x positions; none when a day is too narrow to see. */
export function weekendDays(frame, x0, x1, weekend = [0, 6]) {
  if (frame.px < 6) return [];
  const out = [];
  const a = Math.max(frame.from, dayAt(frame, Math.max(0, x0)));
  const b = Math.min(frame.to, dayAt(frame, x1));
  for (let d = a; d <= b; d++) if (weekend.includes(weekday(d))) out.push(d);
  return out;
}

/** A task's box in chart coordinates. Milestones are a point (the middle of their day). */
export function barBox(frame, task, rowIndex) {
  const y = rowIndex * ROW_H + (ROW_H - BAR_H) / 2;
  if (task.kind === 'milestone') {
    const cx = xOf(frame, task.start) + frame.px / 2;
    return { x: cx - BAR_H / 2, y, w: BAR_H, h: BAR_H, cx };
  }
  const x = xOf(frame, task.start);
  return { x, y, w: Math.max(3, (task.end - task.start + 1) * frame.px), h: BAR_H };
}

/** The rows worth drawing for a scroll position, with some to spare above and below. */
export function rowWindow(scrollTop, viewH, n, overscan = 8) {
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - overscan);
  const last = Math.min(n - 1, Math.ceil((scrollTop + viewH) / ROW_H) + overscan);
  return { first, last };
}

/** The scrollLeft that puts `day` a quarter of the way into the visible chart. */
export function scrollLeftFor(frame, day, viewW) {
  return Math.max(0, Math.min(frame.width - viewW, xOf(frame, day) - viewW / 4));
}

/** The most detailed zoom at which every task fits the visible width (with a little room around). */
export function fitZoom(span, viewW) {
  if (!span || viewW <= 0) return 'week';
  const days = span.to - span.from + 1;
  for (const z of ZOOM_ORDER) {
    if ((days + 2 * Math.ceil(ZOOMS[z].pad / 4)) * ZOOMS[z].px <= viewW) return z;
  }
  return 'year';
}
