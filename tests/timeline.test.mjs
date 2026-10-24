// The timeline and the lanes it shares with the booking grid: lane order per column kind, list
// columns, stacking, overlaps, and what moving a bar to another lane writes.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const L = await imp('src/model/lanes.js');
const TL = await imp('src/model/timeline.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' },
  { id: 'Owner', type: 'Ref:People' },
  { id: 'Team', type: 'RefList:People' },
  { id: 'Room', type: 'Choice', choices: ['Hall', 'Studio'] },
  { id: 'Tags', type: 'ChoiceList', choices: ['red', 'blue'] },
  { id: 'Area', type: 'Text' },
]);
const col = (id) => columns.find((c) => c.id === id);
const labels = { Owner: new Map([[2, 'Ben'], [1, 'Ann'], [3, 'Chloé']]), Team: new Map([[2, 'Ben'], [1, 'Ann'], [3, 'Chloé']]) };
const rows = [
  { id: 1, Task: 'A', Owner: ['R', 'People', 1], Team: ['L', 1, 2], Room: 'Hall', Tags: ['L', 'red'], Area: 'Web' },
  { id: 2, Task: 'B', Owner: ['R', 'People', 1], Team: ['L', 2], Room: 'Hall', Tags: null, Area: 'Brand' },
  { id: 3, Task: 'C', Owner: null, Team: null, Room: 'Loft', Tags: ['L', 'red', 'blue'], Area: '' },
  { id: 4, Task: 'D', Owner: ['R', 'People', 2], Team: ['L', 3], Room: 'Studio', Tags: null, Area: 'Web' },
];
const keys = (lanes) => lanes.map((l) => l.key);

// ---- lanes -------------------------------------------------------------------------------------------
eq('Ref: every row of the referenced table, in its order, booked or not', keys(L.lanesOf(col('Owner'), rows, labels)), ['', 'r:2', 'r:1', 'r:3']);
eq('Choice: the choice list, then values it does not know', keys(L.lanesOf(col('Room'), rows)), ['', 'v:Hall', 'v:Studio', 'v:Loft']);
eq('Text: alphabetical', keys(L.lanesOf(col('Area'), rows)), ['', 'v:Brand', 'v:Web']);
eq('lists put a row in every lane they name', [L.laneKeysOf(rows[0].Team, col('Team')), L.laneKeysOf(rows[2].Tags, col('Tags')), L.laneKeysOf(null, col('Team'))],
  [['r:1', 'r:2'], ['v:red', 'v:blue'], ['']]);

// ---- moving between lanes -------------------------------------------------------------------------------
{
  const own = L.lanesOf(col('Owner'), rows, labels);
  const lane = (k) => own.find((l) => l.key === k);
  eq('Ref: the new row id', L.planLaneChange(rows[0], col('Owner'), lane('r:1'), lane('r:3')), { fields: { Owner: 3 }, patch: { Owner: ['R', 'People', 3] } });
  eq('Ref to the empty lane: 0', L.planLaneChange(rows[0], col('Owner'), lane('r:1'), lane('')).fields, { Owner: 0 });
  const team = L.lanesOf(col('Team'), rows, labels);
  const tl = (k) => team.find((l) => l.key === k);
  eq('RefList: Ann and Ben, dragged from Ann to Chloé, are Ben and Chloé', L.planLaneChange(rows[0], col('Team'), tl('r:1'), tl('r:3')).fields, { Team: ['L', 2, 3] });
  eq('RefList: dragged onto someone already on it, just leaves the old lane', L.planLaneChange(rows[0], col('Team'), tl('r:1'), tl('r:2')).fields, { Team: ['L', 2] });
  eq('RefList: from the empty lane adds', L.planLaneChange(rows[2], col('Team'), tl(''), tl('r:1')).fields, { Team: ['L', 1] });
  eq('a formula column is not written', L.planLaneChange(rows[0], { ...col('Owner'), isFormula: true }, lane('r:1'), lane('r:2')).error, 'formula');
}

// ---- stacking and overlaps --------------------------------------------------------------------------------
{
  const items = [{ a: 1, b: 5 }, { a: 3, b: 4 }, { a: 6, b: 9 }, { a: 4, b: 7 }];
  eq('three tracks: 1-5 | 3-4 | 4-7, then 6-9 goes back to the first free track', [L.stack(items), items.map((x) => x.track)], [3, [0, 1, 0, 2]]);
  eq('touching days do not overlap; sharing one does', [...L.overlapping([{ id: 'a', a: 1, b: 5 }, { id: 'b', a: 6, b: 9 }, { id: 'c', a: 9, b: 9 }])].sort(), ['b', 'c']);
}

// ---- the timeline ----------------------------------------------------------------------------------------
{
  const T = (id, s, e) => ({ id, index: id, title: 'T' + id, start: day(s), end: day(e) });
  const tasks = [T(1, '2026-11-02', '2026-11-06'), T(2, '2026-11-04', '2026-11-05'), T(3, '2026-11-02', '2026-11-03'), T(4, '2026-11-09', '2026-11-10')];
  const tl = TL.buildTimeline(tasks, rows, { laneCol: col('Owner'), labels });
  eq('lanes with their tracks and offsets (Ben, Ann with two overlapping, Chloé empty)', tl.lanes.map((l) => [l.label ?? '∅', l.tracks, l.offset, l.bars.map((b) => `${b.task.id}@${b.track}`).join(' ')]),
    [['∅', 1, 0, '3@0'], ['Ben', 1, 1, '4@0'], ['Ann', 2, 2, '1@0 2@1'], ['Chloé', 1, 4, '']]);
  eq('total tracks', tl.tracks, 5);
  eq('lane at a track', [TL.laneAtTrack(tl, 0).key, TL.laneAtTrack(tl, 3).key, TL.laneAtTrack(tl, 9)], ['', 'r:1', null]);
  eq('no clashes unless asked (people may overlap)', tl.clashes.size, 0);
  const rooms = TL.buildTimeline(tasks, rows, { laneCol: col('Room'), clashes: true });
  eq('a room cannot: tasks 1 and 2 share the Hall on 4-5 Nov', [...rooms.clashes].sort(), [1, 2]);
  eq('hide empty lanes', TL.buildTimeline(tasks, rows, { laneCol: col('Owner'), labels, hideEmpty: true }).lanes.map((l) => l.key), ['', 'r:2', 'r:1']);
  const team = TL.buildTimeline(tasks, rows, { laneCol: col('Team'), labels });
  eq('a task of two people is in both lanes', team.lanes.filter((l) => l.bars.some((b) => b.task.id === 1)).map((l) => l.label), ['Ben', 'Ann']);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
