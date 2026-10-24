// Gantt geometry: calendars, ISO weeks, the frame, header ticks and bar boxes.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const L = await imp('src/views/gantt/layout.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---- calendar
eq('1 Jan 1970 was a Thursday', L.weekday(0), 4);
eq('24 Oct 2026 is a Saturday', L.weekday(day('2026-10-24')), 6);
eq('ISO week of 1 Jan 2026 (a Thursday)', L.isoWeek(day('2026-01-01')), { year: 2026, week: 1 });
eq('31 Dec 2026 is in week 53', L.isoWeek(day('2026-12-31')), { year: 2026, week: 53 });
eq('1 Jan 2027 still belongs to 2026-W53', L.isoWeek(day('2027-01-01')), { year: 2026, week: 53 });
eq('3 Jan 2021 belongs to 2020-W53', L.isoWeek(day('2021-01-03')), { year: 2020, week: 53 });
eq('4 Jan 2021 starts 2021-W01', L.isoWeek(day('2021-01-04')), { year: 2021, week: 1 });

const wed = day('2026-11-04');
eq('week starting Monday', iso(L.startOfUnit(wed, 'week', 1)), '2026-11-02');
eq('week starting Sunday', iso(L.startOfUnit(wed, 'week', 0)), '2026-11-01');
eq('a Monday is its own week start', iso(L.startOfUnit(day('2026-11-02'), 'week', 1)), '2026-11-02');
eq('month', iso(L.startOfUnit(day('2026-11-17'), 'month')), '2026-11-01');
eq('quarter', iso(L.startOfUnit(day('2026-11-17'), 'quarter')), '2026-10-01');
eq('year', iso(L.startOfUnit(day('2026-11-17'), 'year')), '2026-01-01');
eq('next month across a year end', iso(L.nextUnit(day('2026-12-15'), 'month')), '2027-01-01');
eq('next quarter', iso(L.nextUnit(day('2026-11-17'), 'quarter')), '2027-01-01');

// ---- frame
{
  const today = day('2026-10-24');
  const f = L.makeFrame({ from: day('2026-11-02'), to: day('2026-12-20') }, today, 'week', 1);
  eq('week zoom snaps to whole months and includes today', [iso(f.from), iso(f.to)], ['2026-10-01', '2027-01-31']);
  eq('width is days × px', f.width, (f.to - f.from + 1) * 12);
  const none = L.makeFrame(null, today, 'month', 1);
  eq('no tasks: a frame around today', [iso(none.from), iso(none.to)], ['2026-01-01', '2026-12-31']);
  eq('x of a day', L.xOf(f, day('2026-10-02')), 12);
  eq('day at an x', iso(L.dayAt(f, 25)), '2026-10-03');

  const weeks = L.ticks(f, 'week');
  eq('week ticks start on the frame start', iso(weeks[0].start), '2026-10-01');
  eq('the first full week is a Monday', iso(weeks[1].start), '2026-10-05');
  eq('week numbers are ISO', weeks[1].wk, 41);
  const sundays = L.ticks(L.makeFrame({ from: day('2026-11-02'), to: day('2026-12-20') }, today, 'week', 0), 'week');
  eq('a Sunday-start week takes the number of the Monday after it', [iso(sundays[1].start), sundays[1].wk], ['2026-10-04', 41]);
  const months = L.ticks(f, 'month');
  eq('four months', months.map((m) => m.m), [9, 10, 11, 0]);
  eq('a month cell is as wide as its days', months[0].w, 31 * 12);
  const visible = L.ticks(f, 'week', 1200, 1500);
  eq('only the weeks on screen', visible.every((t) => t.x + t.w >= 1200 - 84 && t.x <= 1500), true);

  eq('weekends at week zoom', L.weekendDays(f, 0, 12 * 7).map(iso), ['2026-10-03', '2026-10-04']);
  eq('no weekend shading when days are thin', L.weekendDays(L.makeFrame(null, today, 'month'), 0, 400), []);

  const bar = L.barBox(f, { kind: 'bar', start: day('2026-11-02'), end: day('2026-11-04') }, 2);
  eq('bar: x, inclusive width, row y', [bar.x, bar.w, bar.y], [L.xOf(f, day('2026-11-02')), 36, 2 * L.ROW_H + (L.ROW_H - L.BAR_H) / 2]);
  const ms = L.barBox(f, { kind: 'milestone', start: day('2026-11-02'), end: day('2026-11-02') }, 0);
  eq('milestone centred on its day', ms.cx, L.xOf(f, day('2026-11-02')) + 6);
  eq('a short bar is still visible', L.barBox(L.makeFrame(null, today, 'year'), { kind: 'bar', start: today, end: today }, 0).w, 3);
  eq('scroll puts a day a quarter in', L.scrollLeftFor(f, day('2026-11-02'), 800), L.xOf(f, day('2026-11-02')) - 200);
}

// ---- zoom to fit
eq('a fortnight fits at days', L.fitZoom({ from: day('2026-11-02'), to: day('2026-11-15') }, 800), 'day');
eq('three months fit at weeks', L.fitZoom({ from: day('2026-09-01'), to: day('2026-11-30') }, 1200), 'week');
eq('a year fits at months', L.fitZoom({ from: day('2026-01-01'), to: day('2026-12-31') }, 1600), 'month');
eq('six years: years', L.fitZoom({ from: day('2021-01-01'), to: day('2026-12-31') }, 1200), 'year');
eq('no tasks: weeks', L.fitZoom(null, 800), 'week');

// ---- rows on screen
eq('row window', L.rowWindow(320, 640, 5000, 2), { first: 8, last: 32 });
eq('row window at the end', L.rowWindow(0, 640, 5, 8), { first: 0, last: 4 });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
