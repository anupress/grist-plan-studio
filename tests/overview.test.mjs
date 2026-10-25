// The overview (M19): the counts, the breakdown by a column, what counts as late, and which columns can be chosen.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const O = await imp('src/model/overview.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Status', type: 'Choice', choices: ['To do', 'Doing', 'Done'] },
  { id: 'Owner', type: 'Ref:People' }, { id: 'Team', type: 'RefList:People' }, { id: 'Parent', type: 'Ref:Tasks' }, { id: 'Flag', type: 'Bool' }, { id: 'Milestone', type: 'Bool' },
]);
const roles = { title: 'Task', start: 'Start', end: 'End', status: 'Status', assignee: 'Owner', parent: 'Parent', milestone: 'Milestone' };
const labels = { Owner: new Map([[1, 'Ann'], [2, 'Ben']]), Team: new Map([[1, 'Ann'], [2, 'Ben']]) };
const D = (iso) => ['d', day(iso) * 86400];
const R = (id) => ['R', 'People', id];
const today = day('2026-11-10');
// 1 done; 2 doing, ended 5 Nov (late); 3 to do, ends tomorrow (soon); 4 to do, in three weeks; 5 to do, no dates; 6 a parent of 7 and 8 (not counted);
// 7 doing, ends in 3 days; 8 done; 9 a milestone in 5 days; 10 a milestone that was on 1 Nov and is not done (late)
const rows = [
  { id: 1, Task: 'A', Start: D('2026-11-02'), End: D('2026-11-04'), Status: 'Done', Owner: R(1), Team: ['L', 1], Parent: null },
  { id: 2, Task: 'B', Start: D('2026-11-03'), End: D('2026-11-05'), Status: 'Doing', Owner: R(2), Team: ['L', 1, 2], Parent: null },
  { id: 3, Task: 'C', Start: D('2026-11-09'), End: D('2026-11-11'), Status: 'To do', Owner: R(1), Team: null, Parent: null },
  { id: 4, Task: 'D', Start: D('2026-11-30'), End: D('2026-12-02'), Status: 'To do', Owner: null, Team: null, Parent: null },
  { id: 5, Task: 'E', Start: null, End: null, Status: 'To do', Owner: R(2), Team: null, Parent: null },
  { id: 6, Task: 'Phase', Start: null, End: null, Status: 'Doing', Owner: null, Team: null, Parent: null },
  { id: 7, Task: 'F', Start: D('2026-11-09'), End: D('2026-11-13'), Status: 'Doing', Owner: R(1), Team: null, Parent: ['R', 'Tasks', 6] },
  { id: 8, Task: 'G', Start: D('2026-11-02'), End: D('2026-11-06'), Status: 'Done', Owner: R(2), Team: null, Parent: ['R', 'Tasks', 6] },
  { id: 9, Task: 'M1', Start: D('2026-11-15'), End: D('2026-11-15'), Status: 'To do', Owner: null, Team: null, Parent: null, Milestone: true },
  { id: 10, Task: 'M0', Start: D('2026-11-01'), End: D('2026-11-01'), Status: 'To do', Owner: null, Team: null, Parent: null, Milestone: true },
];
const built = buildTasks(rows, { roles, columns, labels });
const col = (id) => columns.find((c) => c.id === id);
const rowOf = (id) => rows.find((r) => r.id === id);
const text = (c, token) => (token === '' ? '(none)' : c.kind === 'Ref' || c.kind === 'RefList' ? labels[c.id].get(Number(token)) : token);
const ov = (by = [col('Status'), col('Owner')], over = {}) => O.buildOverview(built.tasks, built.unscheduled, { today, doable: true, rowOf, labels, by, valueText: text, ...over });

// ---- the counts
{
  const o = ov();
  eq('a parent is left out: nine tasks do the work', o.total, 9);
  eq('done: A and G', o.done, 2);
  eq('open is what is not done', o.open, 7);
  eq('late: B (ended the 5th) and the milestone of the 1st', o.late, 2);
  eq('due in the next seven days: C (tomorrow), F (in three days), the milestone on the 15th is the 5th day', o.soon, 3);
  eq('undated: E', o.undated, 1);
  eq('the share done', Math.round(o.share * 100), 22);
  eq('no tasks: no share', O.buildOverview([], [], { today, rowOf, by: [] }).share, null);
  eq('nothing is late when a row cannot be finished (a booking list)', ov(undefined, { doable: false }).late, 0);
}

// ---- the breakdown
{
  const [status, owner] = ov().breakdowns;
  eq('by status, in the column’s own order: To do, Doing, Done', status.groups.map((g) => [g.label, g.total, g.done, g.late, g.open]),
    [['To do', 5, 0, 1, 4], ['Doing', 2, 0, 1, 1], ['Done', 2, 2, 0, 0]]);
  eq('by person: Ann, Ben, then the tasks with nobody last', owner.groups.map((g) => [g.label, g.total, g.done, g.late, g.open]),
    [['Ann', 3, 1, 0, 2], ['Ben', 3, 1, 1, 1], ['(none)', 3, 0, 1, 2]]);
  eq('done + open + late is the total, in every group', ov().breakdowns.every((b) => b.groups.every((g) => g.done + g.open + g.late === g.total)), true);
  eq('the groups of a column add up to the tasks when a task has one value', status.groups.reduce((n, g) => n + g.total, 0), 9);
  const team = ov([col('Team')]).breakdowns[0];
  eq('a list column counts a task under each value, and says so', [team.multi, team.groups.map((g) => [g.label, g.total])], [true, [['Ann', 2], ['Ben', 1], ['(none)', 7]]]);
  eq('no column, no breakdown', ov([null, null]).breakdowns, []);
  eq('a value no task holds is not listed', ov([col('Flag')]).breakdowns[0].groups.map((g) => g.label), ['(none)']);
}

// ---- what needs attention
{
  const o = ov();
  eq('the late ones, the longest first', o.lateList.map((x) => [x.task.title, x.days]), [['M0', 9], ['B', 5]]);
  eq('the next milestones, the nearest first, not the one that is past', o.milestones.map((x) => [x.task.title, x.inDays]), [['M1', 5]]);
  const many = [];
  for (let i = 0; i < 20; i++) many.push({ id: 100 + i, index: i, title: 'L' + i, start: day('2026-10-01'), end: day('2026-10-02') + i, finished: false, kind: 'bar', parentId: null });
  eq('the list is cut at six', O.buildOverview(many, [], { today, rowOf: () => ({}), by: [] }).lateList.length, 6);
}

// ---- which columns, which by default
{
  const cols = O.breakdownColumns(columns, roles, 'Tasks').map((c) => c.id);
  eq('Choice, Reference, list and yes/no columns; not the name, not a link to the same table', cols, ['Status', 'Owner', 'Team', 'Flag', 'Milestone']);
  const ids = (p) => p.map((c) => c && c.id);
  const withText = columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Who', type: 'Text' }, { id: 'Notes', type: 'Text' }, { id: 'Status', type: 'Choice', choices: ['a'] }]);
  eq('a Text column counts when it is the person; free text does not', O.breakdownColumns(withText, { title: 'Task', assignee: 'Who' }, 'T').map((c) => c.id), ['Who', 'Status']);
  eq('by default the status, then the person', ids(O.pickBreakdowns(columns, roles, 'Tasks')), ['Status', 'Owner']);
  eq('what was chosen is used', ids(O.pickBreakdowns(columns, roles, 'Tasks', ['Owner', 'Team'])), ['Owner', 'Team']);
  eq('the second can be none', ids(O.pickBreakdowns(columns, roles, 'Tasks', [undefined, null])), ['Status', null]);
  eq('a column that is gone falls back', ids(O.pickBreakdowns(columns, roles, 'Tasks', ['Gone', 'Gone2'])), ['Status', 'Owner']);
  eq('the second is never the first again', ids(O.pickBreakdowns(columns, roles, 'Tasks', ['Owner', 'Owner'])), ['Owner', null]);
  eq('a table with no roles takes the first column that can be broken down', ids(O.pickBreakdowns(columns, { title: 'Task' }, 'Tasks')), ['Status', 'Owner']);
  eq('a table with nothing to break down by', O.pickBreakdowns(columns.filter((c) => c.kind === 'Text' || c.kind === 'Date'), roles, 'Tasks'), [null, null]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
