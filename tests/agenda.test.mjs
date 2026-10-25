// The agenda: open tasks under the day they next need someone (late, today, tomorrow, in progress,
// this week, next week, later, no date), finished ones and parents left out, Mine, bookings never late.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const A = await imp('src/model/agenda.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// Wednesday 4 Nov 2026; weeks start on Monday, so this week ends Sunday 8 Nov and the next on the 15th.
const WED = day('2026-11-04');
const d = (n) => ['d', (WED + n) * 86400];
eq('Wednesday’s week ends on Sunday', iso(A.weekEndOf(WED, 1)), '2026-11-08');
eq('a Sunday is the last day of its own week', iso(A.weekEndOf(day('2026-11-08'), 1)), '2026-11-08');
eq('with weeks from Sunday, Saturday ends it', iso(A.weekEndOf(WED, 0)), '2026-11-07');

const cols = columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Status', type: 'Choice' },
  { id: 'Who', type: 'Text' }, { id: 'Parent', type: 'Ref:Tasks' }]);
const roles = { title: 'Task', start: 'Start', end: 'End', status: 'Status', assignee: 'Who', parent: 'Parent' };
const rows = [
  { id: 1, Task: 'Late long', Start: d(-10), End: d(-4), Status: 'Doing', Who: 'Ann' },
  { id: 2, Task: 'Late short', Start: d(-3), End: d(-1), Status: 'Doing', Who: 'Ben' },
  { id: 3, Task: 'Shipped late', Start: d(-3), End: d(-1), Status: 'Done', Who: 'Ann' },
  { id: 4, Task: 'Due today', Start: d(-2), End: d(0), Status: 'Doing', Who: 'Ann' },
  { id: 5, Task: 'Starts today', Start: d(0), End: d(3), Status: 'To do', Who: 'Ann' },
  { id: 6, Task: 'Milestone tomorrow', Start: d(1), End: d(1), Who: 'Ben' },
  { id: 7, Task: 'Under way', Start: d(-5), End: d(9), Status: 'Doing', Who: 'Ann' },
  { id: 8, Task: 'Friday', Start: d(2), End: d(6), Who: 'Ann' },
  { id: 9, Task: 'Next Monday', Start: d(5), End: d(5), Who: 'Ann' },
  { id: 10, Task: 'Later', Start: d(12), End: d(14), Who: 'Ann' },
  { id: 11, Task: 'No date', Who: 'Ann' },
  { id: 12, Task: 'Parent', Start: d(-1), End: d(20), Who: 'Ann' },
  { id: 13, Task: 'Child', Start: d(3), End: d(3), Who: 'Ann', Parent: ['R', 'Tasks', 12] },
  { id: 14, Task: 'Due tomorrow', Start: d(-2), End: d(1), Status: 'Doing', Who: 'Ann' },
  { id: 15, Task: 'Sunday', Start: d(4), End: d(4), Who: 'Ann' },
];
const b = buildTasks(rows, { roles, columns: cols });
const ag = A.buildAgenda(b.tasks, b.unscheduled, { today: WED, weekStart: 1, doable: true });
const said = (g) => g.items.map((x) => x.task.title + (x.what ? ' ' + x.what : '') + (x.late ? ' ' + x.late : ''));
const of = (a) => Object.fromEntries(a.groups.map((g) => [g.id, said(g)]));
eq('every group, in its order', of(ag), {
  late: ['Late long due 4', 'Late short due 1'],
  today: ['Due today due', 'Starts today starts'],
  tomorrow: ['Milestone tomorrow due', 'Due tomorrow due'],
  now: ['Under way until'],
  week: ['Friday starts', 'Child due', 'Sunday due'],
  next: ['Next Monday due'],
  later: ['Later starts'],
  undated: ['No date'],
});
eq('open: 15 rows less the finished one and the parent', ag.open, 13);
eq('finished (status Done) and parents are left out', ag.groups.flatMap((g) => g.items).some((x) => ['Shipped late', 'Parent'].includes(x.task.title)), false);
eq('an item under way is listed by its end', ag.groups.find((g) => g.id === 'now').items[0].day, WED + 9);

const mine = A.buildAgenda(b.tasks, b.unscheduled, { today: WED, weekStart: 1, keep: (x) => x.people.includes('Ben') });
eq('Mine: only Ben’s', of(mine), { late: ['Late short due 1'], tomorrow: ['Milestone tomorrow due'] });

// Bookings: a table that cannot be finished has nothing late, and says starts, ends and on.
const booked = A.buildAgenda(b.tasks, b.unscheduled, { today: WED, weekStart: 1, doable: false });
eq('bookings: past ones are over, not late', booked.groups.some((g) => g.id === 'late'), false);
eq('bookings: ends today, starts today, a one-day booking is on its day', [...said(booked.groups.find((g) => g.id === 'today')), ...said(booked.groups.find((g) => g.id === 'tomorrow'))],
  ['Due today ends', 'Starts today starts', 'Milestone tomorrow on', 'Due tomorrow ends']);

// Full progress and a German status finish a task too.
const cols2 = columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Status', type: 'Choice' }, { id: 'Progress', type: 'Numeric' }]);
const b2 = buildTasks([
  { id: 1, Task: 'Erledigt', Start: d(0), End: d(0), Status: 'Erledigt', Progress: 0.5 },
  { id: 2, Task: 'Full', Start: d(0), End: d(0), Status: 'Doing', Progress: 1 },
  { id: 3, Task: 'Half', Start: d(0), End: d(0), Status: 'Doing', Progress: 0.5 },
], { roles: { title: 'Task', start: 'Start', end: 'End', status: 'Status', progress: 'Progress' }, columns: cols2 });
eq('finished: a done word in German, or full progress', b2.tasks.map((x) => x.finished), [true, true, false]);
eq('…so only Half is due today', of(A.buildAgenda(b2.tasks, [], { today: WED })), { today: ['Half due'] });
eq('nothing open: no groups', A.buildAgenda([], [], { today: WED }).groups, []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
