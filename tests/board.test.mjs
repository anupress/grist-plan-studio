// The board: lanes from Choice, Reference and Text columns, card order, what a drag writes, quick add.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const B = await imp('src/model/board.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' },
  { id: 'Status', type: 'Choice', choices: ['To do', 'Doing', 'Done'] },
  { id: 'Owner', type: 'Ref:People' },
  { id: 'Area', type: 'Text' },
  { id: 'Rank', type: 'Numeric' },
  { id: 'Pos', type: 'Int' },
  { id: 'Due', type: 'Date' },
  { id: 'Finished', type: 'Bool' },
]);
const col = (id) => columns.find((c) => c.id === id);
const roles = { title: 'Task', status: 'Status', assignee: 'Owner', due: 'Due', done: 'Finished' };
const labels = { Owner: new Map([[2, 'Ben'], [1, 'Ann'], [3, 'Chloé']]) };   // the People table's order: Ben, Ann, Chloé
const d = (iso) => ['d', day(iso) * 86400];
const rows = [
  { id: 1, Task: 'Write brief', Status: 'Doing', Owner: ['R', 'People', 1], Area: 'Web', Rank: 2, Pos: 1, Due: d('2026-10-20'), Finished: false },
  { id: 2, Task: 'Pick fonts', Status: 'Doing', Owner: ['R', 'People', 2], Area: 'Brand', Rank: 1, Pos: 2, Due: null, Finished: false },
  { id: 3, Task: 'Old idea', Status: 'Parked', Owner: null, Area: '', Rank: null, Pos: null, Due: null, Finished: false },
  { id: 4, Task: 'Launch', Status: 'Done', Owner: ['R', 'People', 1], Area: 'Web', Rank: 1, Pos: 3, Due: d('2026-10-01'), Finished: true },
  { id: 5, Task: 'Untriaged', Status: '', Owner: ['R', 'People', 3], Area: 'Brand', Rank: null, Pos: 4, Due: null, Finished: false },
  { id: 6, Task: 'Ship', Status: 'Doing', Owner: null, Area: 'Web', Rank: 3, Pos: 5, Due: d('2026-10-30'), Finished: false },
];
const built = buildTasks(rows, { roles, columns, labels });
const tasks = [...built.tasks, ...built.unscheduled].sort((a, b) => a.index - b.index);
const board = (over = {}) => B.buildBoard(tasks, rows, { laneCol: col('Status'), orderCol: col('Rank'), labels, today: day('2026-10-24'), ...over });
const view = (b) => b.lanes.map((l) => `${l.none ? '∅' : l.label}:${l.cards.map((c) => c.id).join(',')}`);

// ---- lanes ------------------------------------------------------------------------------------------
eq('Choice: the choice list in order, an unknown value gets its own lane, the empty lane first',
  view(board()), ['∅:5', 'To do:', 'Doing:2,1,6', 'Done:4', 'Parked:3']);
eq('hide empty lanes', view(board({ hideEmpty: true })), ['∅:5', 'Doing:2,1,6', 'Done:4', 'Parked:3']);
eq('Reference: the referenced table’s order (ranked cards first within a lane)', view(board({ laneCol: col('Owner') })), ['∅:6,3', 'Ben:2', 'Ann:4,1', 'Chloé:5']);
eq('Text: alphabetical', view(board({ laneCol: col('Area') })), ['∅:3', 'Brand:2,5', 'Web:4,1,6']);
eq('no order column: the rows’ own order', view(board({ orderCol: null })), ['∅:5', 'To do:', 'Doing:1,2,6', 'Done:4', 'Parked:3']);
eq('lane values for writing', board().lanes.map((l) => l.value), ['', 'To do', 'Doing', 'Done', 'Parked']);
eq('a Reference lane writes its row id', board({ laneCol: col('Owner') }).lanes.map((l) => l.value), [0, 2, 1, 3]);
eq('lane keys', board().lanes.map((l) => l.key), ['', 'v:To do', 'v:Doing', 'v:Done', 'v:Parked']);

// ---- limits and what a card says -----------------------------------------------------------------------
{
  const b = board({ wip: { 'v:Doing': 2, 'v:Done': 1 } });
  const lane = (k) => b.lanes.find((l) => l.key === k);
  eq('3 open in Doing against a limit of 2: one over', [lane('v:Doing').open, lane('v:Doing').limit, lane('v:Doing').over], [3, 2, 1]);
  eq('done cards do not count against a limit', [lane('v:Done').open, lane('v:Done').over], [0, 0]);
  eq('no limit set', lane('v:To do').limit, null);
  eq('overdue: due 20 Oct, today 24 Oct', [b.byId.get(1).due, b.byId.get(1).late], [day('2026-10-20'), 4]);
  eq('not yet due', b.byId.get(6).late, 0);
  eq('done is never late', b.byId.get(4).late, null);
  eq('no date', [b.byId.get(2).due, b.byId.get(2).span, b.byId.get(2).late], [null, null, null]);
}
eq('initials', ['Ann Lee', 'Chloé', 'dieter.m@x.de', 'jean-luc picard', ''].map(B.initials), ['AL', 'C', 'DM', 'JP', '?']);
eq('card fields as text', [B.cellText(rows[0], col('Owner'), labels), B.cellText(rows[0], col('Due'), {}, () => '20 Oct'),
  B.cellText(rows[3], col('Finished')), B.cellText(rows[2], col('Area'))], ['Ann', '20 Oct', '✓', null]);

// ---- ranks ---------------------------------------------------------------------------------------------
eq('between two', B.rankBetween(1, 2), 1.5);
eq('on top / at the bottom', [B.rankBetween(undefined, 1), B.rankBetween(3, undefined)], [0, 4]);
eq('an empty lane keeps the card’s own rank', [B.rankBetween(undefined, undefined, 'Numeric', 7), B.rankBetween(undefined, undefined)], [7, 1]);
eq('Int: room / no room', [B.rankBetween(2, 6, 'Int'), B.rankBetween(2, 3, 'Int')], [4, null]);
eq('a neighbour without a rank: number the lane', B.rankBetween(null, 4), null);
{
  let a = 1, b = 2, n = 0;
  while (B.rankBetween(a, b) != null && n < 200) { b = B.rankBetween(a, b); n++; }
  eq('halving runs out of room after a few dozen drags, not never', n > 25 && n < 60, true);
}

// ---- moves ---------------------------------------------------------------------------------------------
const ctx = { laneCol: col('Status'), orderCol: col('Rank'), rows };
{
  const b = board();
  const m = B.planCardMove(b, { id: 6, toKey: 'v:Doing', index: 0 }, ctx);
  eq('up to the top of its lane: one row, rank 0 (below Pick fonts at 1)', m.items, [{ id: 6, plan: { fields: { Rank: 0 }, patch: { Rank: 0 } } }]);
  const m2 = B.planCardMove(b, { id: 6, toKey: 'v:Doing', index: 1 }, ctx);
  eq('between Pick fonts (1) and Write brief (2): 1.5', m2.items[0].plan.fields, { Rank: 1.5 });
  const m3 = B.planCardMove(b, { id: 1, toKey: 'v:Done', index: 1 }, ctx);
  eq('to another lane, under Launch (1): its rank 2 already fits, so the status only', m3.items, [{ id: 1, plan: { fields: { Status: 'Done' }, patch: { Status: 'Done' } } }]);
  const m3b = B.planCardMove(b, { id: 6, toKey: 'v:Done', index: 0 }, ctx);
  eq('to another lane, above Launch (1): status and rank in one row', m3b.items, [{ id: 6, plan: { fields: { Status: 'Done', Rank: 0 }, patch: { Status: 'Done', Rank: 0 } } }]);
  const m4 = B.planCardMove(b, { id: 2, toKey: 'v:To do', index: 0 }, ctx);
  eq('into an empty lane: the status only, its rank stays', m4.items, [{ id: 2, plan: { fields: { Status: 'To do' }, patch: { Status: 'To do' } } }]);
  const m5 = B.planCardMove(b, { id: 2, toKey: 'v:Doing', index: 0 }, ctx);
  eq('dropped where it was: nothing to write', m5.items, []);
  const m6 = B.planCardMove(b, { id: 1, toKey: '', index: 1 }, ctx);
  eq('into the empty lane, under an unranked card: the lane is numbered, status cleared', m6.items, [
    { id: 5, plan: { fields: { Rank: 1 }, patch: { Rank: 1 } } },
    { id: 1, plan: { fields: { Status: '' }, patch: { Status: '' } } },   // already 2
  ]);
}
{
  const b = board({ orderCol: col('Pos') });
  const m = B.planCardMove(b, { id: 6, toKey: 'v:Doing', index: 1 }, { ...ctx, orderCol: col('Pos') });
  eq('Int ranks 1, 2, 5 -> between 1 and 2 there is no room: the lane is numbered again', m.items, [
    { id: 6, plan: { fields: { Pos: 2 }, patch: { Pos: 2 } } },
    { id: 2, plan: { fields: { Pos: 3 }, patch: { Pos: 3 } } },
  ]);
}
{
  const b = board({ laneCol: col('Owner') });
  const m = B.planCardMove(b, { id: 6, toKey: 'r:2', index: 1 }, { ...ctx, laneCol: col('Owner') });
  eq('a Reference lane writes the row id, the patch keeps the encoded cell', m.items[0].plan, { fields: { Owner: 2, Rank: 2 }, patch: { Owner: ['R', 'People', 2], Rank: 2 } });
}
{
  const b = board({ orderCol: null });
  eq('no order column: up and down in a lane writes nothing', B.planCardMove(b, { id: 6, toKey: 'v:Doing', index: 0 }, { ...ctx, orderCol: null }).error, 'noOrder');
  eq('...but another lane is just the status', B.planCardMove(b, { id: 6, toKey: 'v:Done', index: 0 }, { ...ctx, orderCol: null }).items[0].plan.fields, { Status: 'Done' });
  const formula = { ...col('Status'), isFormula: true };
  eq('a formula status cannot be dragged to another lane', B.planCardMove(B.buildBoard(tasks, rows, { laneCol: formula }), { id: 6, toKey: 'v:Done', index: 0 }, { ...ctx, laneCol: formula }).error, 'laneFormula');
}

// ---- quick add -------------------------------------------------------------------------------------------
{
  const b = board();
  const doing = b.lanes.find((l) => l.key === 'v:Doing');
  eq('a card added to Doing: name, status, next rank', B.newCardFields(doing, 'New one', { laneCol: col('Status'), orderCol: col('Rank'), titleCol: col('Task') }).fields,
    { Task: 'New one', Status: 'Doing', Rank: 4 });
  const link = { col: col('Owner'), value: 3, cell: ['R', 'People', 3] };
  eq('...with the linked widget’s selection filled in', B.newCardFields(doing, 'x', { laneCol: col('Status'), titleCol: col('Task'), link }).fields, { Task: 'x', Status: 'Doing', Owner: 3 });
  const none = b.lanes.find((l) => l.none);
  eq('the empty lane writes no status', B.newCardFields(none, 'y', { laneCol: col('Status'), titleCol: col('Task') }).fields, { Task: 'y' });
}

// ---- the quick filters: a lane's limit and count look at every card ------------------------------------
{
  const shown = tasks.filter((x) => x.id !== 1 && x.id !== 6);   // the filters keep four of the six; two open Doing cards are hidden
  const lanesOf = (o = {}) => B.buildBoard(shown, rows, { laneCol: col('Status'), orderCol: col('Rank'), labels, today: day('2026-10-24'), wip: { 'v:Doing': 2 }, ...o });
  const withAll = lanesOf({ everyone: tasks });
  const doing = withAll.lanes.find((l) => l.key === 'v:Doing');
  eq('the cards are the ones the filters keep', doing.cards.map((c) => c.id), [2]);
  eq('…the lane counts every open card against its limit', [doing.open, doing.total, doing.hidden, doing.over], [3, 3, 2, 1]);
  const without = lanesOf().lanes.find((l) => l.key === 'v:Doing');
  eq('without the full list the lane would have counted only what it shows (the mistake this prevents)', [without.open, without.over], [1, 0]);
  eq('a lane nothing hides says so: no hidden cards', withAll.lanes.find((l) => l.key === 'v:Done').hidden, 0);
  eq('"hide empty lanes" goes by every card, so a lane the filters emptied stays', view(lanesOf({ everyone: tasks, hideEmpty: true })), ['∅:5', 'Doing:2', 'Done:4', 'Parked:3']);
  eq('…and the lane for "no value" is there while a card of it is on show', view(lanesOf({ everyone: tasks, hideEmpty: true })).includes('∅:5'), true);
  eq('…and gone when the filters hide the only card in it', view(B.buildBoard(shown.filter((x) => x.id !== 5), rows, { laneCol: col('Status'), orderCol: col('Rank'), labels, today: day('2026-10-24'), everyone: tasks })).some((x) => x.startsWith('∅')), false);
  eq('with no list of everyone, the counts are the cards', [board().lanes.find((l) => l.key === 'v:Doing').total, board().lanes.find((l) => l.key === 'v:Doing').hidden], [3, 0]);
}

// ---- cards in the person's own order (1.9) -----------------------------------------------------------------
{
  const byName = (a, b) => String(a.title).localeCompare(String(b.title));
  const sortedBoard = board({ sorter: byName });
  eq('no sorter: ranked cards first, as before', [board().sorted, view(board())[2]], [false, 'Doing:2,1,6']);
  eq('a sorter orders the cards of every lane, whatever their rank', view(sortedBoard), ['∅:5', 'To do:', 'Doing:2,6,1', 'Done:4', 'Parked:3']);
  eq('the board says it is sorted', sortedBoard.sorted, true);
  eq('dropping a card elsewhere in its own lane writes nothing: the order is not the person’s to set', B.planCardMove(sortedBoard, { id: 1, toKey: 'v:Doing', index: 0 }, { laneCol: col('Status'), orderCol: col('Rank'), rows }), { error: 'sorted' });
  const across = B.planCardMove(sortedBoard, { id: 1, toKey: 'v:Done', index: 0 }, { laneCol: col('Status'), orderCol: col('Rank'), rows });
  eq('to another lane it changes the lane only, no rank', [across.items.map((i) => [i.id, Object.keys(i.plan.fields)]), across.ranked, across.sameLane], [[[1, ['Status']]], false, false]);
  const own = B.planCardMove(board(), { id: 1, toKey: 'v:Doing', index: 0 }, { laneCol: col('Status'), orderCol: col('Rank'), rows });
  eq('unsorted, the same drop writes the rank as it always did', [own.ranked, own.items.length], [true, 1]);
}

// ---- swimlanes and the sub-task line (M23)
{
  const swim = (over = {}) => board({ swimCol: col('Owner'), ...over });
  const ctxS0 = () => ({ laneCol: col('Status'), orderCol: col('Rank'), rows, swimCol: col('Owner') });
  const flat = (b) => b.swims.map((x) => [x.label ?? '∅', x.lanes.map((l) => l.cards.map((c) => c.id))]);
  const b = swim();
  eq('no swim column: one band with every lane, as before', [board().swims.length, board().swimmed, board().swims[0].lanes.map((l) => l.cards.length)], [1, false, board().lanes.map((l) => l.cards.length)]);
  eq('bands: the referenced table’s order, the empty one last', b.swims.map((x) => x.label ?? '∅'), ['Ben', 'Ann', 'Chloé', '∅']);
  eq('each band holds its cards in each lane (lanes: ∅, To do, Doing, Done, Parked)', flat(b), [
    ['Ben', [[], [], [2], [], []]], ['Ann', [[], [], [1], [4], []]], ['Chloé', [[5], [], [], [], []]], ['∅', [[], [], [6], [], [3]]],
  ]);
  eq('swimmed says so', b.swimmed, true);
  eq('every card is in exactly one band', b.swims.flatMap((x) => x.lanes.flatMap((l) => l.cards.map((c) => c.id))).sort(), [1, 2, 3, 4, 5, 6]);
  eq('a text column makes bands from the values the cards have', swim({ swimCol: col('Area') }).swims.map((x) => x.label ?? '∅'), ['Brand', 'Web', '∅']);
  const dan = { Owner: new Map([[2, 'Ben'], [1, 'Ann'], [3, 'Chloé'], [4, 'Dan']]) };
  eq('a person with no card keeps a band to drop one on', swim({ labels: dan }).swims.map((x) => [x.label ?? '∅', x.lanes.every((l) => !l.cards.length)]), [['Ben', false], ['Ann', false], ['Chloé', false], ['Dan', true], ['∅', false]]);
  eq('…unless empty lanes are hidden', swim({ labels: dan, hideEmpty: true }).swims.map((x) => x.label ?? '∅'), ['Ben', 'Ann', 'Chloé', '∅']);
  eq('…and dropping on it writes that person', B.planCardMove(swim({ labels: dan }), { id: 1, toKey: 'v:Doing', swimKey: 'r:4', index: 0 }, { ...ctxS0() }).items[0].plan.fields.Owner, 4);
  eq('the card knows its band', [b.byId.get(1).swim, b.byId.get(3).swim], ['r:1', '']);
  // sub-tasks
  const kids = new Map([[1, { done: 2, total: 5 }]]);
  const withKids = board({ kids });
  eq('a card with sub-tasks says how many are done', [withKids.byId.get(1).sub, withKids.byId.get(2).sub], [{ done: 2, total: 5 }, null]);
  eq('…and redraws when that changes', withKids.byId.get(1).hash !== board({ kids: new Map([[1, { done: 3, total: 5 }]]) }).byId.get(1).hash, true);
  // moves
  const ctxS = { laneCol: col('Status'), orderCol: col('Rank'), rows, swimCol: col('Owner') };
  const bandOf = (label) => b.swims.find((x) => (x.label ?? '∅') === label);
  const toBen = B.planCardMove(b, { id: 1, toKey: 'v:Doing', swimKey: 'r:2', index: 0 }, ctxS);
  eq('dragged into another band in the same lane: the band’s column is written, the lane’s is not', [toBen.items.map((i) => Object.keys(i.plan.fields).sort()), toBen.swimChanged, toBen.sameLane], [[['Owner', 'Rank']], true, false]);
  eq('…the person written is the band’s: Ben is row 2', toBen.items[0].plan.fields.Owner, 2);
  const across = B.planCardMove(b, { id: 1, toKey: 'v:Done', swimKey: 'r:2', index: 0 }, ctxS);
  eq('into another lane and another band: both columns', Object.keys(across.items[0].plan.fields).filter((k) => k !== 'Rank').sort(), ['Owner', 'Status']);
  eq('into the empty band the swim column is emptied', B.planCardMove(b, { id: 1, toKey: 'v:Doing', swimKey: '', index: 0 }, ctxS).items[0].plan.fields.Owner, 0);
  // Area as the swim column: the Web band holds cards 1 and 6 in Doing (ranks 2 and 3)
  const ctxA = { ...ctxS, swimCol: col('Area') };
  const web = swim({ swimCol: col('Area') });
  const within = B.planCardMove(web, { id: 6, toKey: 'v:Doing', swimKey: 'v:Web', index: 0 }, ctxA);
  eq('within its own band it only ranks, as before', [within.items.map((i) => Object.keys(i.plan.fields)), within.swimChanged, within.sameLane], [[['Rank']], false, true]);
  eq('…above the card that was first', within.items[0].plan.fields.Rank < 2, true);
  eq('the rank goes between the neighbours in the band: Ann’s Doing cell holds card 1 only, so moving 1 to Ben’s cell at index 0 ranks above Ben’s card 2 (rank 1)', toBen.items[0].plan.fields.Rank < 1, true);
  eq('a swim column that is a formula cannot be written', B.planCardMove(b, { id: 1, toKey: 'v:Doing', swimKey: 'r:2', index: 0 }, { ...ctxS, swimCol: { ...col('Owner'), isFormula: true } }), { error: 'swimFormula' });
  eq('sorted: a drop into another band still writes the band, never the place', (() => { const sb = swim({ sorter: (a, c) => String(a.title).localeCompare(String(c.title)) }); const p = B.planCardMove(sb, { id: 1, toKey: 'v:Doing', swimKey: 'r:2', index: 0 }, ctxS); return [Object.keys(p.items[0].plan.fields), p.ranked]; })(), [['Owner'], false]);
  // a card added in a band
  const lane = b.lanes.find((l) => l.key === 'v:Doing');
  const added = B.newCardFields(lane, 'New', { laneCol: col('Status'), orderCol: col('Rank'), titleCol: col('Task'), swim: { col: col('Owner'), value: 2, none: false } });
  eq('a card added inside a band takes the band’s value', [added.fields.Status, added.fields.Owner, added.fields.Task], ['Doing', 2, 'New']);
  eq('…none for the empty band', 'Owner' in B.newCardFields(lane, 'New', { laneCol: col('Status'), titleCol: col('Task'), swim: { col: col('Owner'), value: 0, none: true } }).fields, false);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
