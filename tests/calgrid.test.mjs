// The calendar grid: which days a month or week shows, one bar per week row a task touches (marked
// where it continues), tracks for overlapping bars, and "more" counts when a cell has no room.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const G = await imp('src/model/calgrid.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

eq('a week starts on Monday', iso(G.weekStartOfDay(day('2026-11-04'), 1)), '2026-11-02');
eq('…or on Sunday', iso(G.weekStartOfDay(day('2026-11-04'), 0)), '2026-11-01');
eq('a Sunday belongs to the week before it with Monday weeks', iso(G.weekStartOfDay(day('2026-11-08'), 1)), '2026-11-02');
const nov = G.monthSpan(day('2026-11-17'));
eq('a month: first and last day', [iso(nov.first), iso(nov.last)], ['2026-11-01', '2026-11-30']);
eq('December ends on the 31st', iso(G.monthSpan(day('2026-12-05')).last), '2026-12-31');
eq('February in a leap year', iso(G.monthSpan(day('2028-02-10')).last), '2028-02-29');
eq('months forward keep the day', iso(G.addMonths(day('2026-11-17'), 1)), '2026-12-17');
eq('…across the year', iso(G.addMonths(day('2026-12-17'), 1)), '2027-01-17');
eq('…and back across it', iso(G.addMonths(day('2027-01-17'), -1)), '2026-12-17');
eq('a short month keeps the last day it has', iso(G.addMonths(day('2026-01-31'), 1)), '2026-02-28');
eq('forward more than a year', iso(G.addMonths(day('2026-11-17'), 14)), '2028-01-17');

let idx = 0;
const task = (a, b, extra = {}) => ({ id: ++idx, index: idx, title: 'T' + idx, start: day(a), end: day(b ?? a), kind: a === (b ?? a) ? 'milestone' : 'bar', ...extra });

// November 2026 starts on a Sunday: with Monday weeks it needs 6 rows (26 Oct – 6 Dec), with Sunday weeks 5 (1 Nov – 5 Dec)
const monday = G.buildCalGrid([], { mode: 'month', anchor: day('2026-11-17'), weekStart: 1 });
eq('November with Monday weeks: 26 Oct to 6 Dec, six rows', [iso(monday.from), iso(monday.to), monday.weeks.length], ['2026-10-26', '2026-12-06', 6]);
const sunday = G.buildCalGrid([], { mode: 'month', anchor: day('2026-11-17'), weekStart: 0 });
eq('…with Sunday weeks: 1 Nov to 5 Dec, five rows', [iso(sunday.from), iso(sunday.to), sunday.weeks.length], ['2026-11-01', '2026-12-05', 5]);
eq('a row has its seven days', monday.weeks[0].days.map(iso), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
eq('February 2027 starts on a Monday: four rows', G.buildCalGrid([], { mode: 'month', anchor: day('2027-02-10'), weekStart: 1 }).weeks.length, 4);
const wk = G.buildCalGrid([], { mode: 'week', anchor: day('2026-11-04'), weekStart: 1 });
eq('a week is one row, Monday to Sunday', [wk.weeks.length, iso(wk.from), iso(wk.to), wk.month], [1, '2026-11-02', '2026-11-08', null]);

// bars
const a = task('2026-11-03', '2026-11-05'), b = task('2026-11-04'), c = task('2026-11-06', '2026-11-12'), d = task('2026-10-28', '2026-11-03'), out = task('2026-12-20');
const g = G.buildCalGrid([a, b, c, d, out], { mode: 'week', anchor: day('2026-11-04'), weekStart: 1 });
const segs = g.weeks[0].segments.map((s) => [s.task.id, s.col0, s.col1, s.track, s.fromLeft, s.toRight]);
eq('bars of a week: where they start and end, which track, and where they continue', segs, [
  [d.id, 0, 1, 0, true, false],     // began the week before, ends Tuesday
  [a.id, 1, 3, 1, false, false],    // Tue-Thu, below d
  [b.id, 2, 2, 0, false, false],    // Wed, on track 0 again: d ended on Tuesday
  [c.id, 4, 6, 0, false, true],     // Fri to Sunday and on, back on track 0 where d is done
]);
eq('a task outside the week is not in it', g.weeks[0].segments.some((s) => s.task.id === out.id), false);
eq('tracks used', g.weeks[0].tracks, 2);

const next = G.buildCalGrid([c], { mode: 'week', anchor: day('2026-11-10'), weekStart: 1 });
eq('the next week: the same task from the left, ending Thursday', next.weeks[0].segments.map((s) => [s.col0, s.col1, s.fromLeft, s.toRight]), [[0, 3, true, false]]);

// a month cell with no room
const many = [1, 2, 3, 4, 5].map(() => task('2026-11-10'));
const m = G.buildCalGrid(many, { mode: 'month', anchor: day('2026-11-10'), weekStart: 1, maxTracks: 3 });
const row = m.weeks.find((w) => w.start === day('2026-11-09'));
eq('three bars shown, the rest counted on their day', [row.segments.length, row.more, row.tracks], [3, [0, 2, 0, 0, 0, 0, 0], 3]);
const roomy = G.buildCalGrid(many, { mode: 'week', anchor: day('2026-11-10'), weekStart: 1 });
eq('a week shows all five', [roomy.weeks[0].segments.length, roomy.weeks[0].more.every((x) => x === 0), roomy.weeks[0].tracks], [5, true, 5]);
const span = G.buildCalGrid([task('2026-11-09', '2026-11-11'), task('2026-11-09', '2026-11-11'), task('2026-11-10', '2026-11-10')], { mode: 'month', anchor: day('2026-11-10'), weekStart: 1, maxTracks: 2 });
eq('a hidden bar counts on every day it covers', span.weeks.find((w) => w.start === day('2026-11-09')).more, [0, 1, 0, 0, 0, 0, 0]);
const long = G.buildCalGrid([task('2026-11-09', '2026-11-11'), task('2026-11-09', '2026-11-11'), task('2026-11-09', '2026-11-11')], { mode: 'month', anchor: day('2026-11-10'), weekStart: 1, maxTracks: 2 });
eq('…a three-day hidden bar adds one to each of its three days', long.weeks.find((w) => w.start === day('2026-11-09')).more, [1, 1, 1, 0, 0, 0, 0]);
eq('no tasks, no bars', G.buildCalGrid([], { mode: 'month', anchor: day('2026-11-10') }).weeks.every((w) => !w.segments.length && w.tracks === 0), true);

// 400 tasks across a year: a month builds at once
const t0 = performance.now();
const big = Array.from({ length: 400 }, (_, i) => task(iso(day('2026-01-01') + (i * 7) % 360), iso(day('2026-01-01') + ((i * 7) % 360) + (i % 9))));
for (let k = 0; k < 12; k++) G.buildCalGrid(big, { mode: 'month', anchor: day('2026-01-15') + 30 * k, weekStart: 1, maxTracks: 3 });
eq('twelve months of 400 tasks in well under 100 ms', performance.now() - t0 < 100, true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
