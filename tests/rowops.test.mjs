// Delete and duplicate a task (M20): what is written, so that one Undo brings everything back.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const O = await imp('src/model/rowops.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Stamp', type: 'DateTime:Europe/Berlin' },
  { id: 'Status', type: 'Choice', choices: ['To do', 'Done'] }, { id: 'Owner', type: 'Ref:People' }, { id: 'Team', type: 'RefList:People' },
  { id: 'Tags', type: 'ChoiceList', choices: ['a', 'b'] }, { id: 'Hours', type: 'Numeric' }, { id: 'Flag', type: 'Bool' },
  { id: 'Parent', type: 'Ref:Tasks' }, { id: 'After', type: 'RefList:Tasks' }, { id: 'Files', type: 'Attachments' },
  { id: 'Calc', type: 'Numeric', isFormula: true },
]);
const roles = { title: 'Task', start: 'Start', end: 'End', status: 'Status', assignee: 'Owner', parent: 'Parent', dependsOn: 'After' };
const D = (iso) => ['d', day(iso) * 86400];
const stamp = ['D', Date.UTC(2026, 10, 4, 8, 30) / 1000, 'Europe/Berlin'];   // 09:30 in Berlin
const base = (id, over = {}) => ({ id, Task: 'T' + id, Start: D('2026-11-02'), End: D('2026-11-04'), Stamp: null, Status: 'To do', Owner: null, Team: null, Tags: null, Hours: 8, Flag: false, Parent: null, After: null, Files: null, Calc: 99, ...over });
const R = (n) => ['R', 'Tasks', n];
// 1 Phase (top); 2 and 3 are its tasks; 4 is a sub-task of 2; 5 waits for 2 and 3; 6 waits for 4 and is on its own; 7 a task of 2 that also waits for it
const rows = [
  base(1, { Task: 'Phase' }),
  base(2, { Task: 'Build', Parent: R(1), Owner: ['R', 'People', 3], Team: ['L', 3, 4], Tags: ['L', 'a', 'b'], Stamp: stamp, Files: ['L', 9], Flag: true }),
  base(3, { Task: 'Test', Parent: R(1) }),
  base(4, { Task: 'Unit tests', Parent: R(2), After: ['L', 3] }),
  base(5, { Task: 'Ship', After: ['L', 2, 3] }),
  base(6, { Task: 'Docs', After: ['L', 4] }),
  base(7, { Task: 'Review', Parent: R(2), After: ['L', 2] }),
];
const tasks = (() => { const b = buildTasks(rows, { roles, columns }); return [...b.tasks, ...b.unscheduled]; })();
const ctx = { tableId: 'Tasks', roles, columns };

// ---- what is below a task
eq('everything below a task, deeper ones after', O.descendantsOf(tasks, 1), [2, 4, 7, 3]);
eq('a task with nothing under it', O.descendantsOf(tasks, 5), []);
eq('a cycle in the data does not run forever', O.descendantsOf([{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }], 1), [2]);

// ---- delete
{
  const lone = O.planDelete(ctx, tasks, 6);
  eq('a task with nothing around it: only itself goes', [lone.updates, lone.removed, lone.moved, lone.unlinked], [[], [6], 0, 0]);
  const keep = O.planDelete(ctx, tasks, 2);
  eq('its sub-tasks move up one level, to its own parent', keep.updates.filter((u) => 'Parent' in u.fields).map((u) => [u.id, u.fields.Parent]), [[4, 1], [7, 1]]);
  eq('…and what waited for it no longer lists it', keep.updates.filter((u) => 'After' in u.fields).map((u) => [u.id, u.fields.After]), [[7, null], [5, ['L', 3]]]);
  eq('only the one row goes; the counts say what else was done', [keep.removed, keep.moved, keep.unlinked], [[2], 2, 2]);
  eq('a sub-task that is also a dependent is one update with both changes', keep.updates.find((u) => u.id === 7), { id: 7, fields: { Parent: 1, After: null }, patch: { Parent: ['R', 'Tasks', 1], After: null } });
  const top = O.planDelete(ctx, tasks, 1);
  eq('a top task: its sub-tasks become top tasks (parent 0)', top.updates.map((u) => [u.id, u.fields.Parent]), [[2, 0], [3, 0]]);
  const all = O.planDelete(ctx, tasks, 1, { children: 'delete' });
  eq('with its sub-tasks: they all go', all.removed, [1, 2, 4, 7, 3]);
  eq('…and what waited for any of them is unlinked: Ship waited for 2 and 3, Docs for 4', all.updates.map((u) => [u.id, u.fields.After]).sort((a, b) => a[0] - b[0]), [[5, null], [6, null]]);
  eq('nothing is moved when they go too', all.moved, 0);
  eq('a task that waits for one of two keeps the other', O.planDelete(ctx, tasks, 3).updates.filter((u) => u.id === 5).map((u) => u.fields.After), [['L', 2]]);
  eq('not there', O.planDelete(ctx, tasks, 99), { error: 'gone' });
  const formulaParent = { ...ctx, columns: columns.map((c) => (c.id === 'Parent' ? { ...c, isFormula: true } : c)) };
  eq('sub-tasks cannot be moved up when the parent column is a formula', O.planDelete(formulaParent, tasks, 2), { error: 'parentFormula' });
  eq('…but a task with none can still be deleted', O.planDelete(formulaParent, tasks, 6).removed, [6]);
  const noLinks = { ...ctx, roles: { title: 'Task', start: 'Start', end: 'End' } };
  eq('no parent or links mapped: only the row goes', O.planDelete(noLinks, tasks.map((x) => ({ ...x, parentId: null, deps: [] })), 2).updates, []);
}

// ---- duplicate
{
  const copy = O.planDuplicate(ctx, tasks, rows, 2, { firstId: 100, copyTitle: (s) => `${s} (copy)` });
  const [kind, table, ids, cols] = copy.action;
  eq('one BulkAddRecord with the copy’s own row number', [kind, table, ids], ['BulkAddRecord', 'Tasks', [100]]);
  eq('the name is marked', cols.Task, ['Build (copy)']);
  eq('every other cell is the original’s: dates, status, person, list, tags, hours, yes/no', [cols.Start, cols.End, cols.Status, cols.Owner, cols.Team, cols.Tags, cols.Hours, cols.Flag],
    [[day('2026-11-02') * 86400], [day('2026-11-04') * 86400], ['To do'], [3], [['L', 3, 4]], [['L', 'a', 'b']], [8], [true]]);
  eq('a date with a time keeps its time of day', cols.Stamp, [stamp[1]]);
  eq('the copy sits under the same parent', cols.Parent, [1]);
  eq('attachments are copied', cols.Files, [['L', 9]]);
  eq('a formula column is not written', 'Calc' in cols, false);
  eq('the copy as the widget keeps it', [copy.rows[0].id, copy.rows[0].Task, copy.rows[0].Owner, copy.rows[0].Start], [100, 'Build (copy)', ['R', 'People', 3], ['d', day('2026-11-02') * 86400]]);
  const deep = O.planDuplicate(ctx, tasks, rows, 2, { children: 'all', firstId: 100, copyTitle: (s) => s + '*' });
  eq('with its sub-tasks: the parent first, then each below it', [deep.ids, [...deep.map]], [[100, 101, 102], [[2, 100], [4, 101], [7, 102]]]);
  eq('only the top copy is renamed', deep.action[3].Task, ['Build*', 'Unit tests', 'Review']);
  eq('a copied sub-task sits under the copy of its parent', deep.action[3].Parent, [1, 100, 100]);
  eq('links between the copies point at the copies; links to anything else stay', deep.action[3].After, [null, ['L', 3], ['L', 100]]);
  eq('a task that is not copied is not touched: a copy of a task keeps what it waited for', O.planDuplicate(ctx, tasks, rows, 5, { firstId: 50 }).action[3].After, [['L', 2, 3]]);
  eq('a copy of a sub-task waits for what the original waited for', O.planDuplicate(ctx, tasks, rows, 4, { firstId: 50 }).action[3].After, [['L', 3]]);
  eq('not there', O.planDuplicate(ctx, tasks, rows, 99, { firstId: 1 }), { error: 'gone' });
  const noName = O.planDuplicate({ ...ctx, roles: { start: 'Start' } }, tasks, rows, 3, { firstId: 70, copyTitle: (s) => s + '!' });
  eq('with no name column the copy is exact', noName.action[3].Task, ['Test']);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
