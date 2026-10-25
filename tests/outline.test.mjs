// Add several tasks from an outline (M24): reading the lines, and the rows they become.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const O = await imp('src/model/outline.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { makeCalendar } = await imp('src/model/calendar.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const shape = (text) => O.parseOutline(text).map((x) => `${x.depth}:${x.title}`);

// ---- reading the lines
eq('one task a line, blank lines skipped', shape('A\n\n  \nB\r\nC'), ['0:A', '0:B', '0:C']);
eq('tabs are levels', shape('Phase\n\tOne\n\t\tDeep\n\tTwo\nNext'), ['0:Phase', '1:One', '2:Deep', '1:Two', '0:Next']);
eq('spaces count in the smallest step used (two)', shape('Phase\n  One\n    Deep\n  Two'), ['0:Phase', '1:One', '2:Deep', '1:Two']);
eq('…or four', shape('Phase\n    One\n        Deep'), ['0:Phase', '1:One', '2:Deep']);
eq('bullets, dashes, numbers and checklist boxes are dropped', shape('- A\n* B\n• C\n1. D\n2) E\n[ ] F\n- [x] G'), ['0:A', '0:B', '0:C', '0:D', '0:E', '0:F', '0:G']);
eq('a hyphen in a name stays', shape('Plan e-mail follow-up'), ['0:Plan e-mail follow-up']);
eq('a number that is part of the name stays', shape('2026 budget\n3D print'), ['0:2026 budget', '0:3D print']);
eq('a line is never more than one level below the one above', shape('A\n\t\t\tB'), ['0:A', '1:B']);
eq('the first line is a top task even when indented', shape('    A\n    B'), ['0:A', '0:B']);
eq('nothing in, nothing out', [shape(''), shape(null), shape('  \n\t')], [[], [], []]);
eq('a very long name is cut', O.parseOutline('x'.repeat(500))[0].title.length, 200);
eq('at most five hundred lines', O.parseOutline(Array.from({ length: 800 }, (_, i) => 'T' + i).join('\n')).length, O.MAX_LINES);

// ---- the rows
const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Parent', type: 'Ref:Tasks' }, { id: 'After', type: 'RefList:Tasks' },
  { id: 'Owner', type: 'Ref:People' }, { id: 'Calc', type: 'Text', isFormula: true },
]);
const roles = { title: 'Task', start: 'Start', end: 'End', parent: 'Parent', dependsOn: 'After' };
const ctx = { tableId: 'Tasks', roles, columns };
const items = O.parseOutline('Design\n\tMock-ups\n\tReview\nBuild\n\tAPI\n\tUI\nLaunch');
const days = (list) => list.map((v) => (v == null ? null : iso(v / 86400)));

{
  const p = O.planOutline(ctx, items, { firstId: 100 });
  eq('rows get the next row numbers, the action is one BulkAddRecord', [p.action[0], p.action[1], p.ids], ['BulkAddRecord', 'Tasks', [100, 101, 102, 103, 104, 105, 106]]);
  eq('names in order', p.action[3].Task, ['Design', 'Mock-ups', 'Review', 'Build', 'API', 'UI', 'Launch']);
  eq('parents are the row numbers of the lines above (0 for the top)', p.action[3].Parent, [0, 100, 100, 0, 103, 103, 0]);
  eq('without a start, no dates are written', [p.dated, 'Start' in p.action[3]], [0, false]);
  eq('two parents', p.parents, 2);
  eq('the rows as the widget keeps them', [p.rows[1].id, p.rows[1].Task, p.rows[1].Parent], [101, 'Mock-ups', ['R', 'Tasks', 100]]);
}
{
  const p = O.planOutline(ctx, items, { firstId: 100, start: day('2026-11-02'), days: 2, chain: true });
  eq('one after the other: each task of two days follows the one before', days(p.action[3].Start), ['2026-11-02', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-06', '2026-11-08', '2026-11-10']);
  eq('…ends', days(p.action[3].End), ['2026-11-05', '2026-11-03', '2026-11-05', '2026-11-09', '2026-11-07', '2026-11-09', '2026-11-11']);
  eq('…a parent covers its tasks', [iso(p.action[3].Start[0] / 86400), iso(p.action[3].End[0] / 86400), iso(p.action[3].End[3] / 86400)], ['2026-11-02', '2026-11-05', '2026-11-09']);
  eq('…each task waits for the one before; parents wait for nothing', p.action[3].After, [null, null, ['L', 101], null, ['L', 102], ['L', 104], ['L', 105]]);
  eq('every column has one value for each row', Object.values(p.action[3]).every((v) => v.length === 7), true);
}
{
  const p = O.planOutline(ctx, items, { firstId: 100, start: day('2026-11-02'), days: 3, chain: false });
  eq('side by side: every task starts on the same day', days(p.action[3].Start), Array(7).fill('2026-11-02'));
  eq('no links without chain', 'After' in p.action[3], false);
}
{
  const cal = makeCalendar({ workdays: true });
  const p = O.planOutline({ ...ctx, calendar: cal }, O.parseOutline('A\nB\nC'), { firstId: 1, start: day('2026-11-06'), days: 2, chain: true });   // a Friday
  eq('in working days: two days from a Friday are Friday and Monday, the next starts on Tuesday', [days(p.action[3].Start), days(p.action[3].End)], [['2026-11-06', '2026-11-10', '2026-11-12'], ['2026-11-09', '2026-11-11', '2026-11-13']]);
  const sat = O.planOutline({ ...ctx, calendar: cal }, O.parseOutline('A'), { firstId: 1, start: day('2026-11-07'), days: 1 });
  eq('a start on a Saturday goes to the Monday', days(sat.action[3].Start), ['2026-11-09']);
}
{
  const p = O.planOutline(ctx, O.parseOutline('A\nB'), { firstId: 10, underId: 7 });
  eq('under a task: the top lines become its sub-tasks', p.action[3].Parent, [7, 7]);
  const deep = O.planOutline(ctx, O.parseOutline('A\n\tB'), { firstId: 10, underId: 7 });
  eq('…and their own sub-tasks stay under them', deep.action[3].Parent, [7, 10]);
}
{
  const flat = O.planOutline({ ...ctx, roles: { title: 'Task', start: 'Start', end: 'End' } }, items, { firstId: 1 });
  eq('with no Parent column everything is one level and it says so', [flat.flattened, 'Parent' in flat.action[3], flat.parents], [true, false, 0]);
  eq('a Parent column that is a formula is no column to write', O.planOutline({ ...ctx, columns: columns.map((c) => (c.id === 'Parent' ? { ...c, isFormula: true } : c)) }, items, { firstId: 1 }).flattened, true);
  eq('no name column: no tasks', O.planOutline({ ...ctx, roles: { start: 'Start' } }, items, { firstId: 1 }), { error: 'noName' });
  eq('an empty outline', O.planOutline(ctx, [], { firstId: 1 }), { error: 'empty' });
}
{
  const owner = columns.find((c) => c.id === 'Owner');
  const p = O.planOutline(ctx, O.parseOutline('A\n\tB'), { firstId: 1, assign: { col: owner, value: 3 } });
  eq('a person given for the new tasks is written on each', p.action[3].Owner, [3, 3]);
  const q = O.planOutline(ctx, O.parseOutline('A\n\tB'), { firstId: 1, link: { col: owner, value: 4, cell: ['R', 'People', 4] } });
  eq('a link value keeps them on show under a linked widget', q.action[3].Owner, [4, 4]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
