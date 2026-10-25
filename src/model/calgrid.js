// The calendar (M12): a month or a week as rows of seven days, and where each task's bar goes in them.
// A task that runs over several days is one bar per week row it touches, with a mark where it continues
// from or into the next row. Bars that overlap sit on separate tracks (rows of the week); a month cell
// has room for only so many, and says how many more are hidden. Pure: tests/calgrid.test.mjs.

import { isoFromDay, dayFromISO } from './values.js';
import { weekEndOf } from './agenda.js';

/** The first day of the week that holds `day` (weekStart: 0 Sunday, 1 Monday ...). */
export const weekStartOfDay = (day, weekStart = 1) => weekEndOf(day, weekStart) - 6;

/** The first and last day of the month that holds `day`. */
export function monthSpan(day) {
  const [y, m] = isoFromDay(day).split('-').map(Number);
  const first = dayFromISO(`${y}-${String(m).padStart(2, '0')}-01`);
  const next = m === 12 ? dayFromISO(`${y + 1}-01-01`) : dayFromISO(`${y}-${String(m + 1).padStart(2, '0')}-01`);
  return { first, last: next - 1 };
}

/** `day` moved by whole months (the same day of the month, or the last one when the month is shorter). */
export function addMonths(day, n) {
  const [y, m, d] = isoFromDay(day).split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const first = dayFromISO(`${ny}-${String(nm).padStart(2, '0')}-01`);
  return Math.min(first + d - 1, monthSpan(first).last);
}

/**
 * @param tasks dated tasks (from buildTasks)
 * @param o {mode: 'month' | 'week', anchor: any day in the month or week to show, weekStart, maxTracks (bars a row shows; Infinity for all)}
 * @returns {{from, to, month: {first, last} | null, weeks: Array<{start, days: number[], segments, more: number[], tracks}>}}
 *   segment: {task, col0, col1 (0-6), track, fromLeft, toRight}; more: bars hidden per day
 */
export function buildCalGrid(tasks, { mode = 'month', anchor, weekStart = 1, maxTracks = Infinity }) {
  let from, to, month = null;
  if (mode === 'week') { from = weekStartOfDay(anchor, weekStart); to = from + 6; }
  else { month = monthSpan(anchor); from = weekStartOfDay(month.first, weekStart); to = weekEndOf(month.last, weekStart); }
  const weeks = [];
  for (let start = from; start <= to; start += 7) weeks.push(buildWeek(tasks, start, maxTracks));
  return { from, to, month, weeks };
}

function buildWeek(tasks, start, maxTracks) {
  const end = start + 6;
  const all = tasks
    .filter((x) => x.start != null && x.end >= start && x.start <= end)
    .map((task) => ({ task, col0: Math.max(task.start, start) - start, col1: Math.min(task.end, end) - start, fromLeft: task.start < start, toRight: task.end > end }));
  // Those that began earliest first, then the longer: a task keeps its track from one week to the next.
  all.sort((a, b) => a.task.start - b.task.start || (b.task.end - b.task.start) - (a.task.end - a.task.start) || a.task.index - b.task.index);
  const ends = [];
  for (const seg of all) {
    let track = ends.findIndex((e) => e < seg.col0);
    if (track < 0) { track = ends.length; ends.push(seg.col1); } else ends[track] = seg.col1;
    seg.track = track;
  }
  const more = Array(7).fill(0);
  const segments = [];
  for (const seg of all) {
    if (seg.track < maxTracks) segments.push(seg);
    else for (let c = seg.col0; c <= seg.col1; c++) more[c]++;
  }
  return { start, days: Array.from({ length: 7 }, (_, i) => start + i), segments, more, tracks: Math.min(maxTracks, ends.length) };
}
