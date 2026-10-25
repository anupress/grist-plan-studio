// A checklist in a text cell (M28): reading it, ticking an item, adding one.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const C = await imp('src/model/checklist.js');
const { detectRoles } = await imp('src/model/roles.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const text = 'Before the shoot\n[ ] book the room\n[x] write the brief\n- [ ] send the invitations\nnotes: ask Ann\n* [X] pay the deposit';
const r = C.parseChecklist(text);
eq('items are the lines that start with a box; the rest are notes', r.items.map((x) => [x.line, x.text, x.done]), [[1, 'book the room', false], [2, 'write the brief', true], [3, 'send the invitations', false], [5, 'pay the deposit', true]]);
eq('counted', [r.done, r.total], [2, 4]);
eq('a box with a tick in other forms', C.parseChecklist('[✓] a\n☑ b\n☐ c\n[] d').items.map((x) => x.done), [true, true, false, false]);
eq('no list, no items', [C.parseChecklist('just a note'), C.parseChecklist(null), C.parseChecklist('')].map((x) => x.total), [0, 0, 0]);
eq('a box in the middle of a line is not an item', C.parseChecklist('call [x] later').total, 0);

eq('ticking an item changes that line only', C.setItem(text, 1, true), 'Before the shoot\n[x] book the room\n[x] write the brief\n- [ ] send the invitations\nnotes: ask Ann\n* [X] pay the deposit');
eq('clearing one keeps its dash or star', C.setItem(text, 5, false), 'Before the shoot\n[ ] book the room\n[x] write the brief\n- [ ] send the invitations\nnotes: ask Ann\n* [ ] pay the deposit');
eq('a line that is not an item is left alone', C.setItem(text, 4, true), text);
eq('a line that is not there is left alone', C.setItem(text, 40, true), text);
eq('Windows line breaks stay', C.setItem('[ ] a\r\n[ ] b', 1, true), '[ ] a\r\n[x] b');
eq('ticking an empty box "[]" writes a proper one', C.setItem('[] a', 0, true), '[x] a');

eq('adding an item puts it on a line of its own at the end', C.addItem('[ ] a\n[x] b', 'c'), '[ ] a\n[x] b\n[ ] c');
eq('…and starts a list in an empty cell', C.addItem('', '  first   item '), '[ ] first item');
eq('an empty item is nothing', C.addItem('[ ] a', '   '), '[ ] a');
eq('trailing blank lines do not pile up', C.addItem('[ ] a\n\n', 'b'), '[ ] a\n[ ] b');

const columns = columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Checklist', type: 'Text' }, { id: 'Notes', type: 'Text' }]);
const found = detectRoles(columns, { tableId: 'Tasks' }).roles;
eq('a column called Checklist is found; Notes is not it', [found.checklist, found.checklist === 'Notes'], ['Checklist', false]);
const rows = [{ id: 1, Task: 'a', Start: ['d', 0], End: ['d', 86400], Checklist: '[x] one\n[ ] two\n[ ] three' }];
const t0 = buildTasks(rows, { roles: { title: 'Task', start: 'Start', end: 'End', checklist: 'Checklist' }, columns }).tasks[0];
eq('a task carries its counts', t0.checks, { done: 1, total: 3 });
const t1 = buildTasks([{ ...rows[0], Checklist: '[x] one\n[x] two\n[ ] three' }], { roles: { title: 'Task', start: 'Start', end: 'End', checklist: 'Checklist' }, columns }).tasks[0];
eq('…and is drawn again when a box is ticked', t0.hash !== t1.hash, true);
eq('without the column, no counts', buildTasks(rows, { roles: { title: 'Task', start: 'Start', end: 'End' }, columns }).tasks[0].checks, null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
