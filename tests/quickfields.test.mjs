// More fields in the edit window (M22): which columns Settings offers, what is kept, and what a stored choice becomes.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const Q = await imp('src/model/quickfields.js');
const S = await imp('src/model/settings.js');
const { columnsFromFixture } = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'Status', type: 'Choice', choices: ['a'] }, { id: 'Sponsor', type: 'Text' },
  { id: 'Budget', type: 'Numeric' }, { id: 'Approved', type: 'Bool' }, { id: 'Owner', type: 'Ref:People' }, { id: 'Parent', type: 'Ref:Tasks' },
  { id: 'Files', type: 'Attachments' }, { id: 'Calc', type: 'Any' }, { id: 'Kind', type: 'ChoiceList', choices: ['x'] },
]);
const roles = { title: 'Task', start: 'Start', status: 'Status', assignee: 'Owner', parent: 'Parent' };

eq('offered: the columns no role uses, of a kind that can be edited here; not the name, a link to this table, attachments or Any',
  Q.quickCandidates(columns, roles, 'Tasks').map((c) => c.id), ['Sponsor', 'Budget', 'Approved', 'Kind']);
eq('nothing stored: nothing', Q.cleanQuick(undefined), { fields: [] });
eq('junk is dropped, a repeat once, ten become eight', [Q.cleanQuick({ fields: [null, { id: 3 }, { ref: 1, id: 'A' }, { ref: 1, id: 'A' }] }).fields.length, Q.cleanQuick({ fields: Array.from({ length: 10 }, (_, i) => ({ ref: i, id: 'C' + i })) }).fields.length], [1, 8]);
const ref = (id) => columns.find((c) => c.id === id).ref;
eq('a stored choice becomes the columns, in order', Q.quickColumns({ fields: [{ ref: ref('Budget'), id: 'Budget' }, { ref: ref('Sponsor'), id: 'Sponsor' }] }, columns, roles, 'Tasks').map((c) => c.id), ['Budget', 'Sponsor']);
eq('a renamed column is found by its ref', Q.quickColumns({ fields: [{ ref: ref('Sponsor'), id: 'Old_name' }] }, columns, roles, 'Tasks').map((c) => c.id), ['Sponsor']);
eq('a copied document, where refs differ, is found by id', Q.quickColumns({ fields: [{ ref: 999, id: 'Budget' }] }, columns, roles, 'Tasks').map((c) => c.id), ['Budget']);
eq('a column that is gone, or has since been given a role, is dropped', Q.quickColumns({ fields: [{ ref: 99, id: 'Gone' }, { ref: ref('Sponsor'), id: 'Sponsor' }] }, columns, { ...roles, project: 'Sponsor' }, 'Tasks'), []);

// ---- kept in the widget's options
{
  const o = S.readOptions({ quick: { fields: [{ ref: 4, id: 'Sponsor' }, { id: 7 }] } });
  eq('read from the options', o.quick, { fields: [{ ref: 4, id: 'Sponsor' }] });
  eq('absent: none', S.readOptions({}).quick, { fields: [] });
  const w = S.writeOptions({ other: 1 }, { quick: { fields: [{ ref: 4, id: 'Sponsor' }] } });
  eq('written, and what was there is kept', [w.quick, w.other], [{ fields: [{ ref: 4, id: 'Sponsor' }] }, 1]);
  eq('not asked to write it: what was there stays', S.writeOptions({ quick: { fields: [{ ref: 1, id: 'A' }] } }, { gantt: S.GANTT_DEFAULTS }).quick, { fields: [{ ref: 1, id: 'A' }] });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
