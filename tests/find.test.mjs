// Quick filters: what a search and chosen values keep, how a tree is held together, and what the filter offers.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const F = await imp('src/model/find.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const columns = [
  { id: 'Title', kind: 'Text' },
  { id: 'Status', kind: 'Choice', choices: ['Todo', 'Doing', 'Done'] },
  { id: 'Owner', kind: 'Ref', refTable: 'People' },
  { id: 'Tags', kind: 'ChoiceList', choices: ['web', 'print'] },
  { id: 'Urgent', kind: 'Bool' },
  { id: 'Parent', kind: 'Ref', refTable: 'Tasks' },
];
const roles = { title: 'Title', status: 'Status', assignee: 'Owner', parent: 'Parent' };
const labels = { Owner: new Map([[1, 'Ann Müller'], [2, 'Bo'], [3, 'Çelik']]) };
const row = (id, o) => ({ id, Title: '', Status: '', Owner: 0, Tags: null, Urgent: false, Parent: 0, ...o });
const rows = [
  row(1, { Title: 'Design', Status: '' }),                                      // a group
  row(2, { Title: 'Logo and brand', Status: 'Doing', Owner: 1, Parent: 1, Urgent: true }),
  row(3, { Title: 'Sitemap', Status: 'Todo', Owner: 2, Parent: 1, Tags: ['L', 'web'] }),
  row(4, { Title: 'Build', Status: '' }),                                         // a group
  row(5, { Title: 'Front-end', Status: 'Doing', Owner: 2, Parent: 4, Tags: ['L', 'web', 'print'] }),
  row(6, { Title: 'Shop setup', Status: 'Done', Owner: 3, Parent: 4 }),
  row(7, { Title: 'Launch day', Status: 'Todo' }),
  row(8, { Title: 'Ünïcode café', Status: 'Todo', Owner: 3 }),
];
const ctx = { columns, roles, labels };
const kept = (find) => { const r = F.applyFind(rows, find, ctx); return r.keep ? [...r.keep].sort((a, b) => a - b) : null; };

// nothing chosen keeps everything
eq('an empty find filters nothing', F.applyFind(rows, F.emptyFind(), ctx), { active: false, keep: null, shown: 8, total: 8 });
eq('spaces alone are not a search', F.isActive({ q: '   ' }), false);
eq('a column with nothing chosen does not filter', F.isActive({ sel: { Status: [] } }), false);

// search
eq('a word starts a word of the name', kept({ q: 'logo' }), [1, 2]);
eq('…its parent stays, so the tree holds', kept({ q: 'sitemap' }), [1, 3]);
eq('every word must be found, in any order', kept({ q: 'brand logo' }), [1, 2]);
eq('a group name finds what is under it', kept({ q: 'design' }), [1, 2, 3]);
eq('capitals and accents do not matter', kept({ q: 'UNICODE CAFE' }), [8]);
eq('three letters may sit inside a word', kept({ q: 'ront' }), [4, 5]);
eq('two letters must start a word: "ro" is inside Front but starts nothing', kept({ q: 'ro' }), []);
eq('nothing matches', kept({ q: 'zzz' }), []);
eq('a hyphen splits words: "en" starts the word end of Front-end', kept({ q: 'en' }), [4, 5]);

// values
eq('a Choice keeps its rows', kept({ sel: { Status: ['Todo'] } }), [1, 3, 7, 8]);
eq('several values are any-of', kept({ sel: { Status: ['Todo', 'Done'] } }), [1, 3, 4, 6, 7, 8]);
eq('a Reference keeps by row id', kept({ sel: { Owner: ['2'] } }), [1, 3, 4, 5]);
eq('no value is the empty token', kept({ sel: { Owner: [F.NONE] } }), [7]);
eq('a ChoiceList keeps a row with any of the values', kept({ sel: { Tags: ['print'] } }), [4, 5]);
eq('a yes/no column', kept({ sel: { Urgent: ['1'] } }), [1, 2]);
eq('two columns must both agree', kept({ sel: { Status: ['Doing'], Owner: ['2'] } }), [4, 5]);
eq('values and a search together', kept({ q: 'logo', sel: { Status: ['Todo'] } }), []);
eq('a column that is no longer there filters nothing', F.applyFind(rows, { sel: { Gone: ['x'] } }, ctx).active, false);

// the tree
const tree = [row(1, { Title: 'A' }), row(2, { Title: 'B', Parent: 1, Status: 'Todo' }), row(3, { Title: 'C', Parent: 2, Status: 'Doing' }), row(4, { Title: 'D', Parent: 3, Status: 'Doing' })];
const keptTree = (find) => [...F.applyFind(tree, find, ctx).keep].sort((a, b) => a - b);
eq('every level above a match stays', keptTree({ sel: { Status: ['Doing'] } }), [1, 2, 3, 4]);
eq('a parent’s own value never decides: only its leaves do', keptTree({ sel: { Status: ['Todo'] } }).length, 0);
const loop = [row(1, { Title: 'A', Parent: 2 }), row(2, { Title: 'B', Parent: 1, Status: 'Doing' })];
eq('a loop in the parents does not hang', F.applyFind(loop, { sel: { Status: ['Doing'] } }, ctx).active, true);
eq('a parent outside the rows (Grist filtered it) is a root', [...F.applyFind([row(5, { Title: 'X', Parent: 99, Status: 'Doing' })], { sel: { Status: ['Doing'] } }, ctx).keep], [5]);

// counts and rows
const r1 = F.applyFind(rows, { sel: { Status: ['Doing'] } }, ctx);
eq('shown counts kept rows, parents included', [r1.shown, r1.total], [4, 8]);
eq('rowsKept follows the table’s order', F.rowsKept(rows, r1).map((x) => x.id), [1, 2, 4, 5]);
eq('a row just added stays whatever it says', F.rowsKept(rows, r1, new Set([7])).map((x) => x.id), [1, 2, 4, 5, 7]);
eq('without a filter every row stays', F.rowsKept(rows, F.applyFind(rows, null, ctx)).length, 8);

// choices
const ch = (id) => F.choicesOf(rows, columns.find((c) => c.id === id), labels).map((c) => `${c.value}|${c.label}|${c.count}`);
eq('a Choice in the column’s order, the empty value last', ch('Status'), ['Todo|Todo|3', 'Doing|Doing|2', 'Done|Done|1', '||2']);
eq('a Reference by name, with the people’s names', ch('Owner'), ['1|Ann Müller|1', '2|Bo|2', '3|Çelik|2', '||3']);
eq('a list column counts each value', ch('Tags'), ['web|web|2', 'print|print|1', '||6']);
eq('a yes/no column: yes first', ch('Urgent'), ['1|1|1', '0|0|7']);

// the board and the calendar take every row as it is: a parent matches on its own values, nothing is added above
const flat = (find) => [...F.applyFind(rows, find, ctx, false).keep].sort((x, y) => x - y);
eq('flat: a row is decided by itself, so a group is not kept for its children', flat({ sel: { Status: ['Doing'] } }), [2, 5]);
eq('flat: a group that matches on its own is a card of its own', flat({ sel: { Status: [F.NONE] } }), [1, 4]);
eq('flat: a search still finds the tasks under a named group, and the group itself', flat({ q: 'design' }), [1, 2, 3]);
eq('flat: counts are every row', F.facetRows(rows, null, 'Status', ctx, false).length, 8);

// facets: what ticking a value would leave, counted among the tasks that pass the other filters
const leaves = (find, colId) => F.facetRows(rows, find, colId, ctx).map((r) => r.id);
eq('with no filter the facet is every task, never a parent', leaves(null, 'Status'), [2, 3, 5, 6, 7, 8]);
eq('a search narrows it', leaves({ q: 'design' }, 'Status'), [2, 3]);
eq('the column’s own choice is left out, so its other values stay on offer', leaves({ sel: { Status: ['Done'] } }, 'Status'), [2, 3, 5, 6, 7, 8]);
eq('another column’s choice narrows it', leaves({ sel: { Owner: ['2'] } }, 'Status'), [3, 5]);
const status = columns.find((c) => c.id === 'Status');
eq('a value the other filters leave none of is still listed, with 0', F.choicesOf(F.facetRows(rows, null, 'Status', ctx), status, labels, F.facetRows(rows, { sel: { Owner: ['2'] } }, 'Status', ctx)).map((c) => c.value + ':' + c.count), ['Todo:1', 'Doing:1', 'Done:0']);
eq('parents’ own values are not offered', F.choicesOf(F.facetRows(rows, null, 'Status', ctx), status, labels).some((c) => c.value === F.NONE), false);

// stored finds are cleaned
eq('junk becomes an empty find', F.cleanFind('x'), F.emptyFind());
eq('a search loses its leading spaces and is capped', F.cleanFind({ q: '  a   b' }).q, 'a b');
eq('values keep only strings, once each', F.cleanFind({ sel: { Status: ['a', 'a', 3, 'b'] } }).sel, { Status: ['a', 'b'] });
eq('an empty list is dropped', F.cleanFind({ sel: { Status: [] } }).sel, {});
eq('at most eight columns', Object.keys(F.cleanFind({ sel: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['c' + i, ['x']])) }).sel).length, 8);
eq('extra filter columns are kept, once each', F.cleanFind({ cols: ['A', 'A', 'B', 3] }).cols, ['A', 'B']);

// speed: 5,000 rows, a search and two values
const big = Array.from({ length: 5000 }, (_, i) => row(i + 1, { Title: 'Task number ' + i, Status: ['Todo', 'Doing', 'Done'][i % 3], Owner: (i % 3) + 1, Parent: i > 10 && i % 7 === 0 ? i - 3 : 0 }));
const t0 = Date.now();
const res = F.applyFind(big, { q: 'number 4', sel: { Status: ['Doing', 'Done'], Owner: ['1', '2'] } }, ctx);
eq('5,000 rows filter in well under 100 ms', Date.now() - t0 < 100, true);
eq('…and keep something', res.shown > 0 && res.shown < 5000, true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
