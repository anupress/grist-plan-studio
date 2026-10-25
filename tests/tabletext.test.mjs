// The plan as text (M24): outline numbers, and the rows as tab-separated or comma-separated text.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const X = await imp('src/model/tabletext.js');
const { isoFromDay: iso, dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const task = (id, depth, over = {}) => ({ kind: 'task', depth, task: { id, title: 'T' + id, start: day('2026-11-02'), end: day('2026-11-04'), status: 'To do', people: [], progress: null, kind: 'bar', ...over } });
const entries = [task(1, 0), task(2, 1), task(3, 2), task(4, 2), task(5, 1), task(6, 0), { kind: 'group', key: 'x' }, task(7, 0), task(8, 1)];

eq('outline numbers: a task under a task is 1.1, deeper 1.1.1', [...X.wbsOf(entries)], [[1, '1'], [2, '1.1'], [3, '1.1.1'], [4, '1.1.2'], [5, '1.2'], [6, '2'], [7, '3'], [8, '3.1']]);
eq('a group heading is not numbered and does not restart the count', X.wbsOf(entries).get(7), '3');
eq('a task deeper than its predecessor by two steps counts from 1', [...X.wbsOf([task(1, 0), task(2, 2)])], [[1, '1'], [2, '1.0.1']]);
eq('nothing, nothing', X.wbsOf([]).size, 0);

const rows = X.tableRows([task(1, 0, { title: 'Plan', people: ['Ann', 'Ben'], progress: 0.456 }), task(2, 1, { start: null, end: null, status: null }), task(3, 1, { kind: 'milestone', end: day('2026-11-02') })], { iso, length: (a, b) => b - a + 1 });
eq('a row: number, name, dates, days, status, people, progress', rows[0], ['1', 'Plan', '2026-11-02', '2026-11-04', '3', 'To do', 'Ann, Ben', '46']);
eq('a task with no dates: empty cells', rows[1], ['1.1', 'T2', '', '', '', '', '', '']);
eq('a milestone lasts no days', rows[2][4], '0');

eq('tab-separated: a header, a row a line', X.toTsv(['A', 'B'], [['1', '2'], ['x', 'y']]), 'A\tB\n1\t2\nx\ty\n');
eq('…a tab or line break in a cell becomes a space', X.toTsv(['A'], [['a\tb\nc']]), 'A\na b c\n');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
