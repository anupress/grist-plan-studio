// How a task waits for another (M25): which ends are linked and how many days lie between them. Pure: tests/links.test.mjs.
//
//   fs  finish to start   the task starts after the other ends          (the default, the only one before 1.17)
//   ss  start to start    the task starts when the other starts
//   ff  finish to finish  the task ends when the other ends
//   sf  start to finish   the task ends when the other starts
//
// A lag moves the earliest day later (days, or working days when the plan counts working days); a negative lag lets the two
// overlap. The type and the lag are columns of the task that waits and hold for everything it waits for: one setting a task.

export const LINK_TYPES = ['fs', 'ss', 'ff', 'sf'];

const START_WORDS = new Set(['start', 'starts', 'begin', 'begins', 'beginn', 'anfang', 'debut', 'inicio', 'comienzo']);
const FINISH_WORDS = new Set(['finish', 'finishes', 'end', 'ends', 'ende', 'fin', 'abschluss', 'final', 'fim']);
// the short codes: English, German (Ende-Anfang = EA), French (fin-début = FD)
const CODES = { fs: 'fs', ss: 'ss', ff: 'ff', sf: 'sf', ea: 'fs', aa: 'ss', ee: 'ff', ae: 'sf', fd: 'fs', dd: 'ss', df: 'sf' };

/** A cell's text -> a type. Anything not understood is finish to start. */
export function linkTypeOf(raw) {
  const text = String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!text) return 'fs';
  if (CODES[text]) return CODES[text];
  const words = text.split(/[^a-z]+/).filter((w) => START_WORDS.has(w) || FINISH_WORDS.has(w));
  if (words.length !== 2) return 'fs';
  const [a, b] = words.map((w) => (START_WORDS.has(w) ? 's' : 'f'));
  return a + b;
}

const lagOf = (link) => (Number.isFinite(link.lag) ? Math.round(link.lag) : 0);
const lenOf = (cal, x) => x.len ?? cal.length(x.start, x.end);
/** The first day a task of this length may start when it must end on `end`. */
const startFromEnd = (cal, end, len) => cal.shift(end, -(len - 1));

/**
 * The first day the task that waits (`s`, with a start and an end) may start, given the task it waits for (`p`) and the link.
 * @param link {type, lag}, p / s {start, end, len?}, cal model/calendar.js
 */
export function minStart(link, p, s, cal) {
  const L = lagOf(link);
  switch (link.type) {
    case 'ss': return cal.shift(p.start, L);
    case 'ff': return startFromEnd(cal, cal.shift(p.end, L), lenOf(cal, s));
    case 'sf': return startFromEnd(cal, cal.shift(p.start, L), lenOf(cal, s));
    default: return cal.shift(cal.after(p.end), L);
  }
}

/**
 * The latest day the task that is waited for (`p`) may end without the task that waits (`s`) having to move.
 * With start to start and start to finish it is the end of a task that starts as late as it may.
 */
export function latestEnd(link, p, s, cal) {
  const L = lagOf(link);
  switch (link.type) {
    case 'ss': return cal.endAfter(cal.shift(s.start, -L), lenOf(cal, p));
    case 'ff': return cal.shift(s.end, -L);
    case 'sf': return cal.endAfter(cal.shift(s.end, -L), lenOf(cal, p));
    default: return cal.shift(s.start, -(1 + L));
  }
}
