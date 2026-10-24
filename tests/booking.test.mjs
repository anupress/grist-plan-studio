// The booking grid: pop-up stores × weekends (periods from a column), leases × months
// (periods by dates), periods from a table, free counts, double bookings, what a drag and a new
// booking write.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const B = await imp('src/model/booking.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const grid = (g, periods) => g.resources.map((r) => `${r.label ?? '∅'}: ` + periods.map((_, i) => {
  const here = r.items.filter((it) => it.first <= i && it.last >= i);
  return here.length ? here.map((it) => it.task.title + (it.clash ? '!' : '')).join('+') : '·';
}).join(' | '));

// ---- Pop-up stores × weekends, the weekend a column of the bookings ------------------------------
{
  const columns = columnsFromFixture([
    { id: 'Event', type: 'Ref:Events' },
    { id: 'Weekend', type: 'Choice', choices: ['Weekend 1', 'Weekend 2', 'Weekend 3'] },
    { id: 'Store', type: 'Ref:Stores' },
    { id: 'Participant', type: 'Ref:Participants' },
  ]);
  const col = (id) => columns.find((c) => c.id === id);
  const labels = {
    Store: new Map([[1, 'Store 1'], [2, 'Store 2'], [3, 'Store 3'], [4, 'Store 4']]),
    Participant: new Map([[1, 'Bakery Nord'], [2, 'Candles & Co'], [3, 'Wood Toys']]),
  };
  const P = (id) => ['R', 'Participants', id];
  const S = (id) => ['R', 'Stores', id];
  const rows = [
    { id: 1, Event: ['R', 'Events', 1], Weekend: 'Weekend 1', Store: S(1), Participant: P(1) },
    { id: 2, Event: ['R', 'Events', 1], Weekend: 'Weekend 1', Store: S(2), Participant: P(2) },
    { id: 3, Event: ['R', 'Events', 1], Weekend: 'Weekend 2', Store: S(1), Participant: P(3) },
    { id: 4, Event: ['R', 'Events', 1], Weekend: 'Weekend 2', Store: S(1), Participant: P(2) },
    { id: 5, Event: ['R', 'Events', 1], Weekend: '', Store: S(3), Participant: P(1) },
  ];
  const roles = { title: 'Participant', resource: 'Store', period: 'Weekend' };
  const built = buildTasks(rows, { roles, columns, labels });
  const tasks = [...built.tasks, ...built.unscheduled];
  const periods = B.columnPeriods(col('Weekend'), rows);
  eq('periods from the Weekend column, in its choice order', periods.map((p) => p.label), ['Weekend 1', 'Weekend 2', 'Weekend 3']);
  const g = B.buildBooking(tasks, rows, { resourceCol: col('Store'), periods, periodCol: col('Weekend'), labels });
  eq('every store, booked or not; Store 1 is double booked on Weekend 2', grid(g, periods), [
    'Store 1: Bakery Nord | Wood Toys!+Candles & Co! | ·',
    'Store 2: Candles & Co | · | ·',
    'Store 3: · | · | ·',
    'Store 4: · | · | ·',
  ]);
  eq('free stores per weekend', g.free, [2, 3, 4]);
  eq('the double booking, both rows', [...g.clashes].sort(), [3, 4]);
  eq('a booking with no weekend is counted, not drawn', g.outside, 1);
  eq('Store 1 has two tracks on Weekend 2', g.resources[0].tracks, 2);
  eq('a cell is free', [B.isFree(g.resources[0], 2), B.isFree(g.resources[0], 0)], [true, false]);
  eq('only some stores (a filter)', B.buildBooking(tasks, rows, { resourceCol: col('Store'), periods, periodCol: col('Weekend'), labels, keep: new Set(['r:2', 'r:4']) }).resources.map((r) => r.label), ['Store 2', 'Store 4']);

  // drag Wood Toys from Store 1, Weekend 2 to Store 3, Weekend 3
  const res = g.resources;
  const item = res[0].items.find((it) => it.task.id === 3);
  const m = B.planBookingMove(item.task, rows[2], { item, from: res[0], to: res[2], period: 2 }, { resourceCol: col('Store'), periods, periodCol: col('Weekend') });
  eq('a drag writes the store and the weekend, one row', m, { fields: { Store: 3, Weekend: 'Weekend 3' }, patch: { Store: ['R', 'Stores', 3], Weekend: 'Weekend 3' } });
  const nb = B.newBookingFields(res[3], periods[1], { resourceCol: col('Store'), periodCol: col('Weekend'), link: { col: col('Event'), value: 1, cell: ['R', 'Events', 1] } });
  eq('booking the free cell Store 4 × Weekend 2, with the event selected in a linked widget', nb.fields, { Store: 4, Weekend: 'Weekend 2', Event: 1 });
}

// ---- Leases × months, by dates --------------------------------------------------------------------------
{
  const columns = columnsFromFixture([
    { id: 'Lease_ID', type: 'Text' },
    { id: 'Lease_Start_Date', type: 'Date' },
    { id: 'Lease_End_Date', type: 'Date', isFormula: true },
    { id: 'Apartment', type: 'Ref:Apartments' },
  ]);
  const col = (id) => columns.find((c) => c.id === id);
  const labels = { Apartment: new Map([[1, '1A'], [2, '1B'], [3, '2A']]) };
  const d = (s) => ['d', day(s) * 86400];
  const rows = [
    { id: 1, Lease_ID: 'L1', Lease_Start_Date: d('2026-01-15'), Lease_End_Date: d('2026-03-14'), Apartment: ['R', 'Apartments', 1] },
    { id: 2, Lease_ID: 'L2', Lease_Start_Date: d('2026-03-15'), Lease_End_Date: d('2026-12-31'), Apartment: ['R', 'Apartments', 1] },
    { id: 3, Lease_ID: 'L3', Lease_Start_Date: d('2026-02-01'), Lease_End_Date: d('2026-02-28'), Apartment: ['R', 'Apartments', 2] },
    { id: 4, Lease_ID: 'L4', Lease_Start_Date: d('2026-02-20'), Lease_End_Date: d('2026-04-30'), Apartment: ['R', 'Apartments', 2] },
  ];
  const roles = { title: 'Lease_ID', start: 'Lease_Start_Date', end: 'Lease_End_Date', resource: 'Apartment' };
  const tasks = buildTasks(rows, { roles, columns, labels }).tasks;
  const periods = B.calendarPeriods('month', day('2026-01-01'), day('2026-04-30'));
  eq('months', periods.map((p) => iso(p.start) + '..' + iso(p.end)), ['2026-01-01..2026-01-31', '2026-02-01..2026-02-28', '2026-03-01..2026-03-31', '2026-04-01..2026-04-30']);
  const g = B.buildBooking(tasks, rows, { resourceCol: col('Apartment'), periods, labels });
  eq('a lease spans every month it touches; 1A changes tenant in March without a clash; 1B overlaps 20-28 Feb', grid(g, periods), [
    '1A: L1 | L1 | L1+L2 | L2',
    '1B: · | L3!+L4! | L4! | L4!',
    '2A: · | · | · | ·',
  ]);
  eq('free apartments per month', g.free, [2, 1, 1, 1]);
  eq('rows that may overlap (people on tasks): nothing is flagged, the free counts stay', [B.buildBooking(tasks, rows, { resourceCol: col('Apartment'), periods, labels, clashes: false }).clashes.size, B.buildBooking(tasks, rows, { resourceCol: col('Apartment'), periods, labels, clashes: false }).free], [0, [2, 1, 1, 1]]);
  eq('weeks start on Monday', B.calendarPeriods('week', day('2026-11-04'), day('2026-11-10')).map((p) => iso(p.start)), ['2026-11-02', '2026-11-09']);
  // drag L3 (1B, February) onto 2A, April: the start moves by 1 Feb -> 1 Apr; the end is a formula, so only the start
  const res = g.resources;
  const item = res[1].items.find((it) => it.task.id === 3);
  const edit = { roles, columns, settings: {}, editable: true };
  const m = B.planBookingMove(item.task, rows[2], { item, from: res[1], to: res[2], period: 3 }, { resourceCol: col('Apartment'), periods, edit });
  eq('a lease dragged two months on and to another flat: the apartment and the start, one row', m.fields, { Apartment: 3, Lease_Start_Date: day('2026-04-01') * 86400 });
  const nb = B.newBookingFields(res[2], periods[0], { resourceCol: col('Apartment'), edit, titleCol: col('Lease_ID'), title: 'New booking' });
  eq('booking a free month: the flat, the first day (the end is a formula), a name', nb.fields, { Lease_Start_Date: day('2026-01-01') * 86400, Apartment: 3, Lease_ID: 'New booking' });
  eq('a month-long booking unit for leases, days for one-day bookings', [B.suggestUnit(tasks), B.suggestUnit([{ start: 1, end: 1 }, { start: 5, end: 5 }])], ['month', 'day']);
}

// ---- periods from a table ------------------------------------------------------------------------------
{
  const cols = columnsFromFixture([{ id: 'Name', type: 'Text' }, { id: 'From', type: 'Date' }, { id: 'To', type: 'Date' }]);
  const d = (s) => ['d', day(s) * 86400];
  const p = B.tablePeriods([
    { id: 7, Name: 'Christmas market', From: d('2026-11-27'), To: d('2026-12-23') },
    { id: 6, Name: 'Summer fair', From: d('2026-07-03'), To: d('2026-07-05') },
    { id: 8, Name: 'No date', From: null, To: null },
  ], cols);
  eq('rows of a periods table, by start, those without a date left out', p.map((x) => `${x.key} ${x.label} ${iso(x.start)}..${iso(x.end)}`),
    ['r:6 Summer fair 2026-07-03..2026-07-05', 'r:7 Christmas market 2026-11-27..2026-12-23']);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
