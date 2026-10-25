// A task that cannot go on (M28): from a yes/no column or a status such as Blocked, and how it is counted.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const { buildTasks, isBlockedStatus } = await imp('src/model/tasks.js');
const { detectRoles } = await imp('src/model/roles.js');
const { buildOverview } = await imp('src/model/overview.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

eq('words that say a task is stuck, in three languages', ['Blocked', 'blocked', 'On hold', 'Blockiert', 'gesperrt', 'Bloqué', 'bloquée', 'en pause'].map(isBlockedStatus), Array(8).fill(true));
eq('words that do not', ['Doing', 'To do', 'Done', '', null, 'Unblocked'].map(isBlockedStatus), Array(6).fill(false));

const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Status', type: 'Choice', choices: ['To do', 'Blocked', 'Done'] },
  { id: 'Is_blocked', type: 'Bool' }, { id: 'Done', type: 'Bool' },
]);
eq('a yes/no column called Blocked is found', detectRoles(columns, { tableId: 'Tasks' }).roles.blocked, 'Is_blocked');
const D = (s) => ['d', day(s) * 86400];
const rows = [
  { id: 1, Task: 'ticked', Start: D('2026-11-02'), End: D('2026-11-04'), Status: 'To do', Is_blocked: true, Done: false },
  { id: 2, Task: 'by its status', Start: D('2026-11-02'), End: D('2026-11-04'), Status: 'Blocked', Is_blocked: false, Done: false },
  { id: 3, Task: 'finished though ticked', Start: D('2026-11-02'), End: D('2026-11-04'), Status: 'Done', Is_blocked: true, Done: true },
  { id: 4, Task: 'free', Start: D('2026-11-02'), End: D('2026-11-04'), Status: 'To do', Is_blocked: false, Done: false },
];
const roles = { title: 'Task', start: 'Start', end: 'End', status: 'Status', blocked: 'Is_blocked', done: 'Done' };
const built = buildTasks(rows, { roles, columns });
eq('blocked by the column, by the status; not once finished; not when free', built.tasks.map((x) => x.blocked), [true, true, false, false]);
const noCol = buildTasks(rows, { roles: { ...roles, blocked: undefined }, columns });
eq('without the column the status still says it', noCol.tasks.map((x) => x.blocked), [false, true, false, false]);
const changed = buildTasks(rows.map((r) => (r.id === 4 ? { ...r, Is_blocked: true } : r)), { roles, columns });
eq('a task that becomes blocked is redrawn (its hash changes)', built.tasks[3].hash !== changed.tasks[3].hash, true);
const ov = buildOverview(built.tasks, built.unscheduled, { today: day('2026-11-03'), rowOf: (id) => rows.find((r) => r.id === id), by: [null, null] });
eq('the overview counts the tasks that are blocked', ov.blocked, 2);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
