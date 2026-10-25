// How a view looks for this person: what a stored choice is cleaned to, row and bar heights, and the order of rows.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const D = await imp('src/model/display.js');
const { arrange } = await imp('src/model/tree.js');
const L = await imp('src/views/gantt/layout.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---- cleaning ----------------------------------------------------------------------------------------------
eq('nothing stored is the default', D.cleanDisplay(null), { ...D.DISPLAY_DEFAULTS, cols: [] });
eq('junk is the default', D.cleanDisplay('compact'), D.cleanDisplay(null));
eq('a valid choice of each kind is kept', D.cleanDisplay({ density: 'compact', sort: 'col:Status', colourBy: 'Owner', labels: 'beside', weekNumbers: false, weekends: false, today: false, cols: ['Status', 'Owner'] }),
  { density: 'compact', sort: 'col:Status', laneSort: null, colourBy: 'Owner', labels: 'beside', weekNumbers: false, weekends: false, today: false, cols: ['Status', 'Owner'] });
eq('an unknown density, label mode or sort falls back', [D.cleanDisplay({ density: 'huge' }).density, D.cleanDisplay({ labels: 'inside' }).labels, D.cleanDisplay({ sort: 'random' }).sort, D.cleanDisplay({ sort: 'col:' }).sort], ['comfortable', 'auto', null, null]);
eq('a toggle must be a yes or no', D.cleanDisplay({ weekends: 'no', today: 0 }), D.cleanDisplay(null));
eq('list columns: strings only, once each, at most three', D.cleanDisplay({ cols: ['a', 'a', 7, 'b', 'c', 'd'] }).cols, ['a', 'b', 'c']);
eq('the defaults are the defaults', [D.isDefaultDisplay(null), D.isDefaultDisplay({}), D.isDefaultDisplay({ density: 'compact' }), D.isDefaultDisplay({ cols: ['x'] })], [true, true, false, false]);
eq('heights: comfortable and compact', [D.heights(null), D.heights({ density: 'compact' })], [{ rowH: 32, barH: 20 }, { rowH: 24, barH: 16 }]);
eq('the heights the Gantt chart used until now are the comfortable ones', [L.ROW_H, L.BAR_H], [32, 20]);

// ---- the geometry follows the heights ------------------------------------------------------------------
const frame = L.makeFrame({ from: 100, to: 130 }, 110, 'week', 1);
const task = { kind: 'bar', start: 105, end: 108 };
eq('a bar sits in the middle of a row of any height (comfortable)', [L.barBox(frame, task, 2).y, L.barBox(frame, task, 2).h], [2 * 32 + 6, 20]);
eq('…and compact', [L.barBox(frame, task, 2, 24, 16).y, L.barBox(frame, task, 2, 24, 16).h], [2 * 24 + 4, 16]);
eq('a milestone is as tall as a bar', L.barBox(frame, { kind: 'milestone', start: 105, end: 105 }, 0, 24, 16).w, 16);
eq('the rows worth drawing: a shorter row means more rows on screen', [L.rowWindow(0, 320, 100).last, L.rowWindow(0, 320, 100, 8, 24).last], [18, 22]);

// ---- sorting -----------------------------------------------------------------------------------------------
const columns = [
  { id: 'Title', kind: 'Text', type: 'Text' },
  { id: 'Status', kind: 'Choice', type: 'Choice', choices: ['To do', 'Doing', 'Done'] },
  { id: 'Owner', kind: 'Ref', type: 'Ref:People', refTable: 'People' },
  { id: 'Hours', kind: 'Numeric', type: 'Numeric' },
  { id: 'Parent', kind: 'Ref', type: 'Ref:Tasks', refTable: 'Tasks' },
  { id: 'Notes', kind: 'Text', type: 'Text' },
];
const labels = { Owner: new Map([[1, 'Ann'], [2, 'Bo'], [3, 'Cy']]) };
const rows = [
  { id: 1, Title: 'task 10', Status: 'Done', Owner: 2, Hours: 5, Notes: '' },
  { id: 2, Title: 'task 2', Status: 'To do', Owner: 3, Hours: null, Notes: 'b' },
  { id: 3, Title: 'Task 1', Status: 'Doing', Owner: 1, Hours: 2, Notes: 'a' },
  { id: 4, Title: 'task 3', Status: '', Owner: 0, Hours: 9, Notes: '' },
  { id: 5, Title: 'Zeta', Status: 'Odd', Owner: 2, Hours: 1, Notes: 'c' },
];
const tasks = rows.map((r, i) => ({ id: r.id, index: i, title: r.Title, start: [20, null, 5, 5, 12][i], end: [25, null, 9, 8, 14][i] }));
const ctx = { columns, rowOf: (id) => rows.find((r) => r.id === id), labels };
const order = (key) => [...tasks].sort(D.taskSorter(key, ctx)).map((t) => t.id);
eq('no key: the table’s own order, no comparator', D.taskSorter(null, ctx), null);
eq('a column that is gone sorts nothing', D.taskSorter('col:Gone', ctx), null);
eq('by start: undated last, ties in the table’s order', order('start'), [3, 4, 5, 1, 2]);
eq('by end', order('end'), [4, 3, 5, 1, 2]);
eq('by name: numbers in a name count as numbers, capitals do not matter', order('name'), [3, 2, 4, 1, 5]);
eq('by a Choice: the choice list’s order, an empty value last, an unknown one after the listed', order('col:Status'), [2, 3, 1, 5, 4]);
eq('by a Reference: the people’s names, none last', order('col:Owner'), [3, 1, 5, 2, 4]);
eq('by a number: empty last', order('col:Hours'), [5, 3, 1, 4, 2]);
eq('by text: empty last, ties in the table’s order', order('col:Notes'), [3, 2, 5, 1, 4]);
eq('sorting twice gives the same order', JSON.stringify(order('col:Status')) === JSON.stringify([...tasks].sort(D.taskSorter('col:Status', ctx)).sort(D.taskSorter('col:Status', ctx)).map((t) => t.id)), true);

// the tree: siblings are sorted, children stay under their parent
const tree = [
  { id: 1, index: 0, title: 'P', start: 1, end: 9, parentId: null },
  { id: 2, index: 1, title: 'c late', start: 7, end: 9, parentId: 1 },
  { id: 3, index: 2, title: 'c early', start: 2, end: 4, parentId: 1 },
  { id: 4, index: 3, title: 'A', start: 20, end: 22, parentId: null },
];
const names = (opts) => arrange(tree, opts).entries.map((e) => e.task.title);
eq('without a sort the tree is in the table’s order', names({}), ['P', 'c late', 'c early', 'A']);
eq('sorted by start: parents among themselves, children among theirs', names({ sort: D.taskSorter('start', { columns, rowOf: () => null }) }), ['P', 'c early', 'c late', 'A']);
eq('sorted by name', names({ sort: D.taskSorter('name', { columns, rowOf: () => null }) }), ['A', 'P', 'c early', 'c late']);

// list columns
const cand = D.listColumns(columns, { title: 'Title', parent: 'Parent' }, 'Tasks').map((c) => c.id);
eq('the list may show or sort by any column but the name and the links', cand, ['Status', 'Owner', 'Hours', 'Notes']);

// ---- the grids and the lanes (1.9) ---------------------------------------------------------------------------
eq('grid heights: the workload row and the booking track, comfortable and compact', [D.gridHeights(null), D.gridHeights({ density: 'compact' })], [{ wlRowH: 58, trackH: 30 }, { wlRowH: 44, trackH: 24 }]);
eq('the heights the grids used until now are the comfortable ones', D.GRID_HEIGHTS.comfortable, { wlRowH: 58, trackH: 30 });
eq('a lane order is kept when it is one of the three', ['name', 'busiest', 'start'].map((k) => D.cleanDisplay({ laneSort: k }).laneSort), ['name', 'busiest', 'start']);
eq('another lane order falls back to the lanes’ own', [D.cleanDisplay({ laneSort: 'random' }).laneSort, D.cleanDisplay({ laneSort: 3 }).laneSort, D.cleanDisplay(null).laneSort], [null, null, null]);
eq('a lane order counts as a change from the defaults', [D.isDefaultDisplay({ laneSort: 'name' }), D.isDefaultDisplay(null)], [false, true]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
