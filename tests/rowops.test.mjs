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

// ---- copies on later dates (M24)
{
  const sh = O.planDuplicate(ctx, tasks, rows, 2, { children: 'all', firstId: 100, shift: 7 });
  eq('a shift moves the start and the end of the copy and of its sub-tasks', [sh.rows.map((r) => r.Start[1] / 86400 - day('2026-11-02')), sh.rows.map((r) => r.End[1] / 86400 - day('2026-11-04'))], [[7, 7, 7], [7, 7, 7]]);
  eq('…and the original is untouched, a Stamp (not a role column) is copied as it was', [rows[1].Start[1] / 86400 - day('2026-11-02'), sh.rows[0].Stamp], [0, ['D', stamp[1], 'Europe/Berlin']]);
  eq('a task with no date is copied without one', O.planDuplicate(ctx, tasks, [{ ...rows[2], Start: null, End: null }], 3, { firstId: 5, shift: 7 }).rows[0].Start, null);
  const dated = { ...ctx, roles: { ...roles, due: 'Stamp' } };
  eq('a column that is not shifted stays: Stamp is not a role in the plain case', O.planDuplicate(ctx, tasks, rows, 2, { firstId: 5, shift: 7 }).rows[0].Stamp, ['D', stamp[1], 'Europe/Berlin']);
  const fresh = (rowSet, c = { ...ctx, roles: { ...roles, done: 'Flag', progress: 'Hours' } }) => O.planDuplicate(c, (() => { const b = buildTasks(rowSet, { roles: c.roles, columns }); return [...b.tasks, ...b.unscheduled]; })(), rowSet, 2, { firstId: 5, fresh: true }).rows[0];
  const finished = rows.map((r) => (r.id === 2 ? { ...r, Status: 'Done', Flag: true, Hours: 8 } : r));
  const f1 = fresh(finished);
  eq('starting over: not done, no progress, the first open status', [f1.Flag, f1.Hours, f1.Status], [false, 0, 'To do']);
  eq('without starting over a finished task is copied finished', O.planDuplicate(ctx, tasks, finished, 2, { firstId: 5 }).rows[0].Status, 'Done');
}

// ---- a series in one action
{
  const one = O.planSeries(ctx, tasks, rows, 3, { firstId: 100, deltas: [7, 14, 21], copyTitle: (s) => s });
  eq('three weekly copies: three rows, numbered one after the other', [one.ids, one.rounds, one.action[0]], [[100, 101, 102], 3, 'BulkAddRecord']);
  eq('…each a week after the one before, one column of values per field', one.action[3].Start.map((v) => v / 86400 - day('2026-11-02')), [7, 14, 21]);
  const withKids = O.planSeries(ctx, tasks, rows, 2, { children: 'all', firstId: 100, deltas: [7, 14] });
  eq('with sub-tasks: each round has the original and its two, parents point at their own round', [withKids.ids, withKids.action[3].Parent], [[100, 101, 102, 103, 104, 105], [1, 100, 100, 1, 103, 103]]);
  eq('…and every column has one value for each row', Object.values(withKids.action[3]).every((v) => v.length === 6), true);
  eq('a task that is not there', O.planSeries(ctx, tasks, rows, 99, { firstId: 1, deltas: [1] }), { error: 'gone' });
}

// ---- one level in or out (M24)
{
  // top level in row order: 1 Phase, 5 Ship, 6 Docs; under Phase: 2 Build, 3 Test; under Build: 4 Unit tests, 7 Review
  const into = O.planReparent(ctx, tasks, 5, 'in');
  eq('in: the task above it at its level becomes its parent', [into.fields, into.parentId], [{ Parent: 1 }, 1]);
  eq('in, with a brother above: Test goes under Build', O.planReparent(ctx, tasks, 3, 'in').parentId, 2);
  eq('in, with nothing above it at its level: not possible', O.planReparent(ctx, tasks, 1, 'in'), { error: 'first' });
  eq('in, the first sub-task of a task has nothing above it either', O.planReparent(ctx, tasks, 4, 'in'), { error: 'first' });
  const out = O.planReparent(ctx, tasks, 4, 'out');
  eq('out: it takes the parent’s place, under the grandparent', [out.fields, out.parentId], [{ Parent: 1 }, 1]);
  eq('out of a task one level below the top: parent 0, an empty Reference', [O.planReparent(ctx, tasks, 2, 'out').fields, O.planReparent(ctx, tasks, 2, 'out').patch], [{ Parent: 0 }, { Parent: null }]);
  eq('out, already at the top', O.planReparent(ctx, tasks, 6, 'out'), { error: 'top' });
  eq('a formula Parent column cannot be written', O.planReparent({ ...ctx, columns: columns.map((c) => (c.id === 'Parent' ? { ...c, isFormula: true } : c)) }, tasks, 5, 'in'), { error: 'parentFormula' });
  eq('no Parent column at all', O.planReparent({ ...ctx, roles: { title: 'Task' } }, tasks, 5, 'in'), { error: 'noParentColumn' });
  eq('not there', O.planReparent(ctx, tasks, 99, 'in'), { error: 'gone' });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
