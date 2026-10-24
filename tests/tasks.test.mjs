// Cells -> days, and rows -> tasks. The cell shapes are the ones measured in real Grist
// (1.7.20, keepEncoded); the row rules are the table at the top of src/model/tasks.js.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const V = await imp('src/model/values.js');
const { buildTasks, spanOf } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const D = (iso) => ['d', Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 1000];
const day = (iso) => V.dayFromISO(iso);

// ---- values
eq('Date cell', V.dayOf(D('2026-11-03')), day('2026-11-03'));
eq('day round trip', V.isoFromDay(day('2026-12-31')), '2026-12-31');
// 23:30 on 3 Nov in New York is already 4 Nov in UTC: the day is the zone's own.
eq('DateTime late evening in New York', V.dayOf(['D', Date.UTC(2026, 10, 4, 4, 30) / 1000, 'America/New_York']), day('2026-11-03'));
// 00:30 on 3 Nov in Berlin is still 2 Nov in UTC.
eq('DateTime just after midnight in Berlin', V.dayOf(['D', Date.UTC(2026, 10, 2, 23, 30) / 1000, 'Europe/Berlin']), day('2026-11-03'));
eq('bare seconds with a Date type', V.dayOf(Date.UTC(2026, 0, 1) / 1000, 'Date'), day('2026-01-01'));
eq('bare seconds with a DateTime type', V.dayOf(Date.UTC(2026, 0, 1, 23) / 1000, 'DateTime:Asia/Tokyo'), day('2026-01-02'));
eq('empty and error cells', [V.dayOf(null), V.dayOf(''), V.dayOf(['E', 'ValueError']), V.dayOf('2026-01-01', 'Text')], [null, null, null, null]);
eq('Reference', [V.refId(['R', 'People', 3]), V.refId(['R', 'People', 0]), V.refId(null)], [3, null, null]);
eq('lists', [V.listOf(['L', 3, 4]), V.listOf(['L', 'blue']), V.listOf(['R', 'T', 5]), V.listOf(null)], [[3, 4], ['blue'], [5], []]);
eq('numbers', [V.num(0.4), V.num('12'), V.num(['E', 'x']), V.num('')], [0.4, 12, null, null]);
eq('progress scale', [V.progressScale([0, 0.5, 1]), V.progressScale([0, 50, 100]), V.progressScale([null])], [1, 100, 1]);
eq('today is the local calendar day', V.todayDay(new Date(2026, 9, 24, 23, 59)), day('2026-10-24'));

// ---- tasks
const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Due', type: 'Date' },
  { id: 'Days', type: 'Numeric' }, { id: 'Status', type: 'Choice' }, { id: 'Owner', type: 'RefList:People' },
  { id: 'Progress', type: 'Numeric' }, { id: 'Done', type: 'Bool' }, { id: 'Milestone', type: 'Bool' }, { id: 'Project', type: 'Ref:Projects' },
]);
columns.find((c) => c.id === 'Status').choiceOptions = { Doing: { fillColor: '#FDE68A' }, Done: { fillColor: '#FFFFFF' } };
const roles = { title: 'Task', start: 'Start', end: 'End', due: 'Due', duration: 'Days', status: 'Status', assignee: 'Owner',
  progress: 'Progress', done: 'Done', milestone: 'Milestone', project: 'Project' };
const labels = { Owner: new Map([[1, 'Ann'], [2, 'Ben']]), Project: new Map([[1, 'Alpha']]) };
const rows = [
  { id: 1, Task: 'Bar', Start: D('2026-11-02'), End: D('2026-11-04'), Status: 'Doing', Owner: ['L', 1, 2], Progress: 50, Project: ['R', 'Projects', 1] },
  { id: 2, Task: 'Start and due', Start: D('2026-11-02'), Due: D('2026-11-06') },
  { id: 3, Task: 'Duration', Start: D('2026-11-02'), Days: 3 },
  { id: 4, Task: 'Start only', Start: D('2026-11-09') },
  { id: 5, Task: 'Due only', Due: D('2026-11-20'), Done: true },
  { id: 6, Task: 'Milestone', Start: D('2026-11-10'), End: D('2026-11-12'), Milestone: true },
  { id: 7, Task: 'Backwards', Start: D('2026-11-10'), End: D('2026-11-08') },
  { id: 8, Task: 'No dates' },
  { id: 9, Task: 'Unknown owner', Start: D('2026-11-02'), Owner: ['L', 7], Status: 'Done', Progress: 100 },
];
const r = buildTasks(rows, { roles, columns, labels });
const t = Object.fromEntries(r.tasks.map((x) => [x.id, x]));
const span = (x) => [V.isoFromDay(x.start), V.isoFromDay(x.end), x.kind];

eq('start and end: a bar, end inclusive', span(t[1]), ['2026-11-02', '2026-11-04', 'bar']);
eq('start and due: the due date ends the bar', span(t[2]), ['2026-11-02', '2026-11-06', 'bar']);
eq('start and duration', span(t[3]), ['2026-11-02', '2026-11-04', 'bar']);
eq('start only: one day', span(t[4]), ['2026-11-09', '2026-11-09', 'bar']);
eq('due only: a milestone', [...span(t[5]), t[5].fromDue], ['2026-11-20', '2026-11-20', 'milestone', true]);
eq('milestone ticked', span(t[6]), ['2026-11-10', '2026-11-10', 'milestone']);
eq('end before start: one day, flagged', [...span(t[7]), t[7].flag, r.flagged], ['2026-11-10', '2026-11-10', 'bar', 'endBeforeStart', 1]);
eq('no dates: unscheduled, not drawn', [r.unscheduled.map((x) => x.id), !!t[8]], [[8], false]);
eq('assignees by label', t[1].people, ['Ann', 'Ben']);
eq('a label that is not loaded shows like Grist does', t[9].people, ['People[7]']);
eq('project label', t[1].project, 'Alpha');
eq('progress read as 0–100 for this column', [t[1].progress, t[9].progress], [0.5, 1]);
eq('done means complete', t[5].progress, 1);
eq('status colour from the choice', t[1].colour, '#FDE68A');
eq('a white choice counts as no colour: an automatic one instead', t[9].colour !== '#FFFFFF' && /^#/.test(t[9].colour), true);
eq('span', [V.isoFromDay(spanOf(r.tasks).from), V.isoFromDay(spanOf(r.tasks).to)], ['2026-11-02', '2026-11-20']);

{
  const due = buildTasks([{ id: 1, Task: 'x', Due: D('2026-11-20') }], { roles, columns, settings: { dueOnly: 'bar', defaultDays: 3 } });
  eq('due only as a bar of 3 days ending on the due date', span(due.tasks[0]), ['2026-11-18', '2026-11-20', 'bar']);
  const excl = buildTasks([{ id: 1, Task: 'x', Start: D('2026-11-02'), End: D('2026-11-05') }], { roles, columns, settings: { endInclusive: false } });
  eq('"end is the day after"', span(excl.tasks[0]), ['2026-11-02', '2026-11-04', 'bar']);
}
{
  const a = buildTasks([rows[0]], { roles, columns, labels }).tasks[0].hash;
  const b = buildTasks([{ ...rows[0], Notes: 'changed elsewhere' }], { roles, columns, labels }).tasks[0].hash;
  const c = buildTasks([{ ...rows[0], End: D('2026-11-05') }], { roles, columns, labels }).tasks[0].hash;
  eq('a change to an unmapped column leaves the hash alone', a === b, true);
  eq('a changed end date changes it', a === c, false);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
