// Selecting several tasks (M26): what a click with Ctrl or Shift does.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const S = await imp('src/model/selection.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const order = [10, 20, 30, 40, 50, 60];
const none = { multi: new Set(), primary: null, anchor: null };
const show = (s) => ({ multi: [...s.multi], primary: s.primary, anchor: s.anchor });

// Ctrl
let s = S.clickSelection({ ...none, primary: 20, anchor: 20 }, { id: 40, ctrl: true, order });
eq('Ctrl on a second task: both are selected, the second is the primary', show(s), { multi: [20, 40], primary: 40, anchor: 40 });
s = S.clickSelection(s, { id: 60, ctrl: true, order });
eq('…a third', show(s), { multi: [20, 40, 60], primary: 60, anchor: 60 });
s = S.clickSelection(s, { id: 40, ctrl: true, order });
eq('Ctrl on one that is in takes it out', show(s), { multi: [20, 60], primary: 60, anchor: 40 });
s = S.clickSelection(s, { id: 60, ctrl: true, order });
eq('down to one task: no selection of several, that task is the primary', show(s), { multi: [], primary: 20, anchor: 60 });
eq('Ctrl with nothing selected starts one', show(S.clickSelection(none, { id: 30, ctrl: true, order })), { multi: [], primary: 30, anchor: 30 });

// Shift
s = S.clickSelection({ ...none, primary: 20, anchor: 20 }, { id: 50, shift: true, order });
eq('Shift: the range from the one before', show(s), { multi: [20, 30, 40, 50], primary: 50, anchor: 20 });
s = S.clickSelection(s, { id: 30, shift: true, order });
eq('…and again from the same anchor, the other way', show(s), { multi: [20, 30], primary: 30, anchor: 20 });
s = S.clickSelection({ ...none, primary: 50, anchor: 50 }, { id: 20, shift: true, order });
eq('a range upwards is in the order drawn', show(s), { multi: [20, 30, 40, 50], primary: 20, anchor: 50 });
s = S.clickSelection({ multi: new Set([20, 30]), primary: 30, anchor: 20 }, { id: 60, shift: true, ctrl: true, order });
eq('Ctrl + Shift adds the range to what is selected', show(s).multi, [20, 30, 40, 50, 60]);
eq('Shift with nothing selected selects only the one', show(S.clickSelection(none, { id: 40, shift: true, order })), { multi: [], primary: 40, anchor: 40 });
eq('Shift on a task that is not drawn: it is added like Ctrl would', show(S.clickSelection({ ...none, primary: 20, anchor: 20 }, { id: 99, shift: true, order })), { multi: [20, 99], primary: 99, anchor: 99 });

// all, and what is left after a change
s = S.selectAll(order);
eq('select all', [s.multi.size, s.primary], [6, 60]);
eq('all of one task is one task', show(S.selectAll([10])), { multi: [], primary: 10, anchor: 10 });
eq('nothing to select', show(S.selectAll([])), { multi: [], primary: null, anchor: null });
const pruned = S.pruneSelection({ multi: new Set([10, 20, 30]), primary: 30, anchor: 10 }, (id) => id !== 30);
eq('a task that is gone leaves the selection, the primary moves to one that is left', show(pruned), { multi: [10, 20], primary: 20, anchor: 10 });
eq('all but one gone: the one is the primary and the rest is no selection', show(S.pruneSelection({ multi: new Set([10, 20]), primary: 20, anchor: 10 }, (id) => id === 10)), { multi: [], primary: 10, anchor: 10 });
eq('the primary is gone with nothing else selected', show(S.pruneSelection({ multi: new Set(), primary: 5, anchor: 5 }, () => false)), { multi: [], primary: null, anchor: 5 });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
