// Copies on later dates (M24): the days they start on.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const S = await imp('src/model/series.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const isos = (list) => list.map(iso);

eq('a month is a calendar month: 31 Jan + 1 = 28 Feb (2027)', iso(S.addMonths(day('2027-01-31'), 1)), '2027-02-28');
eq('…29 Feb in a leap year', iso(S.addMonths(day('2028-01-31'), 1)), '2028-02-29');
eq('…the day is kept when the month has it', iso(S.addMonths(day('2026-10-15'), 3)), '2027-01-15');
eq('…and a month later again from the start, not from the cut-back day', isos(S.seriesStarts({ first: day('2026-12-31'), times: 4, every: 1, unit: 'month' })), ['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
eq('twelve months over a year end', iso(S.addMonths(day('2026-11-30'), 14)), '2028-01-30');
eq('a negative step goes back', iso(S.addMonths(day('2026-03-31'), -1)), '2026-02-28');

eq('weekly, four times', isos(S.seriesStarts({ first: day('2026-11-02'), times: 4, every: 1, unit: 'week' })), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
eq('every two weeks', isos(S.seriesStarts({ first: day('2026-11-02'), times: 3, every: 2, unit: 'week' })), ['2026-11-02', '2026-11-16', '2026-11-30']);
eq('every three days', isos(S.seriesStarts({ first: day('2026-11-02'), times: 3, every: 3, unit: 'day' })), ['2026-11-02', '2026-11-05', '2026-11-08']);
eq('over the clock change the days stay whole', isos(S.seriesStarts({ first: day('2026-10-24'), times: 3, every: 1, unit: 'week' })), ['2026-10-24', '2026-10-31', '2026-11-07']);
eq('until: stops at the last start on or before the day', isos(S.seriesStarts({ first: day('2026-11-02'), times: 50, every: 1, unit: 'week', until: day('2026-11-23') })), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
eq('until before the first start: no copy', S.seriesStarts({ first: day('2026-11-02'), times: 5, until: day('2026-10-01') }), []);
eq('one copy by default', S.seriesStarts({ first: day('2026-11-02') }).length, 1);
eq('at most one hundred', S.seriesStarts({ first: day('2026-11-02'), times: 5000, every: 1, unit: 'day' }).length, S.MAX_COPIES);
eq('nonsense counts and steps fall back to one', [S.seriesStarts({ first: 10, times: 0 }).length, S.seriesStarts({ first: 10, times: 2, every: 0, unit: 'day' })], [1, [10, 11]]);
eq('the delta of each copy from the original', S.deltasOf(day('2026-11-02'), [day('2026-11-09'), day('2026-11-23')]), [7, 21]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
