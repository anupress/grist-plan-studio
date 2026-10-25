// Links with a type and a lag (M25): reading the type, the earliest day each type allows, what a move pushes, the late check and the
// critical path, with calendar days and with working days.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const L = await imp('src/model/links.js');
const Sc = await imp('src/model/schedule.js');
const { makeCalendar } = await imp('src/model/calendar.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { detectRoles, ROLES } = await imp('src/model/roles.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---- reading a type from a cell
eq('English words', ['Finish to start', 'Start to start', 'Finish to finish', 'Start to finish'].map(L.linkTypeOf), ['fs', 'ss', 'ff', 'sf']);
eq('with hyphens, other words and capitals', ['finish-to-start', 'START-START', 'End to End', 'start → finish'].map(L.linkTypeOf), ['fs', 'ss', 'ff', 'sf']);
eq('short codes: English, German, French', ['FS', 'ss', 'EA', 'AA', 'EE', 'AE', 'FD', 'DD', 'DF'].map(L.linkTypeOf), ['fs', 'ss', 'fs', 'ss', 'ff', 'sf', 'fs', 'ss', 'sf']);
eq('German words', ['Ende bis Anfang', 'Anfang bis Anfang', 'Ende bis Ende', 'Anfang bis Ende'].map(L.linkTypeOf), ['fs', 'ss', 'ff', 'sf']);
eq('French words', ['Fin à début', 'Début à début', 'Fin à fin', 'Début à fin'].map(L.linkTypeOf), ['fs', 'ss', 'ff', 'sf']);
eq('empty, nothing, a word that is not one: finish to start', [L.linkTypeOf(''), L.linkTypeOf(null), L.linkTypeOf(undefined), L.linkTypeOf('urgent'), L.linkTypeOf('Start')], ['fs', 'fs', 'fs', 'fs', 'fs']);

// ---- the earliest start each type allows (a Monday 2 Nov 2026 to a Wednesday 4 Nov for the task waited for, a three-day task waits)
const plain = makeCalendar();
const work = makeCalendar({ workdays: true });
const P = { start: day('2026-11-02'), end: day('2026-11-04') };
const S3 = { start: day('2026-11-09'), end: day('2026-11-11') };   // 3 days long
const at = (link, cal = plain, p = P, s = S3) => iso(L.minStart(link, p, s, cal));
eq('finish to start: the day after the end', at({ type: 'fs', lag: 0 }), '2026-11-05');
eq('…with a lag of 2 days', at({ type: 'fs', lag: 2 }), '2026-11-07');
eq('…with a negative lag the two overlap', at({ type: 'fs', lag: -2 }), '2026-11-03');
eq('start to start: the same day', at({ type: 'ss', lag: 0 }), '2026-11-02');
eq('…and 3 days later', at({ type: 'ss', lag: 3 }), '2026-11-05');
eq('finish to finish: ends on the same day, so starts two days before (3 days long)', at({ type: 'ff', lag: 0 }), '2026-11-02');
eq('…and one day after the end', at({ type: 'ff', lag: 1 }), '2026-11-03');
eq('start to finish: ends where the other starts', at({ type: 'sf', lag: 0 }), '2026-10-31');
eq('a link with no type is finish to start', at({ lag: 1 }), '2026-11-06');
eq('a lag that is not a number is none', at({ type: 'fs', lag: NaN }), '2026-11-05');
// working days: the other ends on a Friday 6 Nov
const Pw = { start: day('2026-11-04'), end: day('2026-11-06') };
eq('working days, finish to start: the Monday', iso(L.minStart({ type: 'fs', lag: 0 }, Pw, S3, work)), '2026-11-09');
eq('…a lag of 2 working days: the Wednesday', iso(L.minStart({ type: 'fs', lag: 2 }, Pw, S3, work)), '2026-11-11');
eq('working days, finish to finish: three working days ending Friday start on Wednesday', iso(L.minStart({ type: 'ff', lag: 0 }, Pw, S3, work)), '2026-11-04');

// ---- the latest end of the task that is waited for
const Sx = { start: day('2026-11-10'), end: day('2026-11-12') };
eq('latest end, finish to start: the day before the other starts', iso(L.latestEnd({ type: 'fs', lag: 0 }, P, Sx, plain)), '2026-11-09');
eq('…with a lag of 2: three days before', iso(L.latestEnd({ type: 'fs', lag: 2 }, P, Sx, plain)), '2026-11-07');
eq('latest end, finish to finish: the end of the other', iso(L.latestEnd({ type: 'ff', lag: 0 }, P, Sx, plain)), '2026-11-12');
eq('latest end, start to start: starts as late as it may, keeping its three days', iso(L.latestEnd({ type: 'ss', lag: 0 }, P, Sx, plain)), '2026-11-12');
eq('latest end, start to finish', iso(L.latestEnd({ type: 'sf', lag: 0 }, P, Sx, plain)), '2026-11-14');

// ---- links read from tasks
const T = (id, s, e, over = {}) => ({ id, start: day(s), end: day(e), deps: [], lag: 0, linkType: 'fs', ...over });
const tasks = [T(1, '2026-11-02', '2026-11-04'), T(2, '2026-11-09', '2026-11-11', { deps: [1], lag: 1, linkType: 'ss' }), T(3, '2026-11-12', '2026-11-13', { deps: [2] })];
eq('links carry the type and the lag of the task that waits', Sc.linksOf(tasks), [{ from: 1, to: 2, type: 'ss', lag: 1 }, { from: 2, to: 3, type: 'fs', lag: 0 }]);
const byId = new Map(tasks.map((t) => [t.id, t]));
eq('a start to start link that is kept is not late', Sc.isLate(Sc.linksOf(tasks)[0], byId, plain), false);
const early = [T(1, '2026-11-02', '2026-11-04'), T(2, '2026-11-02', '2026-11-04', { deps: [1], lag: 1, linkType: 'ss' })];
eq('…and one that starts before lag allows is late', Sc.isLate(Sc.linksOf(early)[0], new Map(early.map((t) => [t.id, t])), plain), true);
const ff = [T(1, '2026-11-02', '2026-11-10'), T(2, '2026-11-04', '2026-11-08', { deps: [1], linkType: 'ff' })];
eq('finish to finish: ending before the other ends is late', Sc.isLate(Sc.linksOf(ff)[0], new Map(ff.map((t) => [t.id, t])), plain), true);
const ffOk = [T(1, '2026-11-02', '2026-11-10'), T(2, '2026-11-06', '2026-11-10', { deps: [1], linkType: 'ff' })];
eq('…and ending the same day is not', Sc.isLate(Sc.linksOf(ffOk)[0], new Map(ffOk.map((t) => [t.id, t])), plain), false);

// ---- what a move pushes
{
  const plan = [T(1, '2026-11-02', '2026-11-04'), T(2, '2026-11-04', '2026-11-07', { deps: [1], linkType: 'ss', lag: 2 }), T(3, '2026-11-09', '2026-11-09', { deps: [2], lag: 1 })];
  const links = Sc.linksOf(plan);
  const move = Sc.pushPlan(plan, links, { id: 1, start: day('2026-11-09'), end: day('2026-11-11') }, plain);
  eq('moving the first task by a week pushes a start-to-start task to its start plus 2, keeping its length, and the next one after its end plus 1',
    move.map((m) => [m.id, iso(m.start), iso(m.end)]), [[2, '2026-11-11', '2026-11-14'], [3, '2026-11-16', '2026-11-16']]);
  const noPush = Sc.pushPlan(plan, links, { id: 1, start: day('2026-11-02'), end: day('2026-11-03') }, plain);
  eq('shortening a task that others only start with pushes nothing', noPush, []);
  const ffPlan = [T(1, '2026-11-02', '2026-11-04'), T(2, '2026-11-02', '2026-11-04', { deps: [1], linkType: 'ff' })];
  const ffMove = Sc.pushPlan(ffPlan, Sc.linksOf(ffPlan), { id: 1, start: day('2026-11-02'), end: day('2026-11-08') }, plain);
  eq('finish to finish: the other task ends when this one does, keeping its three days', ffMove.map((m) => [m.id, iso(m.start), iso(m.end)]), [[2, '2026-11-06', '2026-11-08']]);
  const sfPlan = [T(1, '2026-11-10', '2026-11-12'), T(2, '2026-11-02', '2026-11-04', { deps: [1], linkType: 'sf' })];
  const sfMove = Sc.pushPlan(sfPlan, Sc.linksOf(sfPlan), { id: 1, start: day('2026-11-20'), end: day('2026-11-22') }, plain);
  eq('start to finish: the other ends where this one starts', sfMove.map((m) => [m.id, iso(m.start), iso(m.end)]), [[2, '2026-11-18', '2026-11-20']]);
  const wd = [T(1, '2026-11-02', '2026-11-04'), T(2, '2026-11-05', '2026-11-06', { deps: [1], lag: 1 })];
  const wdMove = Sc.pushPlan(wd, Sc.linksOf(wd), { id: 1, start: day('2026-11-04'), end: day('2026-11-06') }, work);
  eq('working days: a lag of one working day after a Friday end is the Tuesday', wdMove.map((m) => [m.id, iso(m.start), iso(m.end)]), [[2, '2026-11-10', '2026-11-11']]);
}

// ---- the critical path
{
  // A (Mon 2 – Wed 4) ; B waits for A start to start with lag 1 (Tue 3 – Fri 6) ; plan ends Fri 6: A is on the path through B only when B can't slip
  const A = T(1, '2026-11-02', '2026-11-04'), B = T(2, '2026-11-03', '2026-11-06', { deps: [1], linkType: 'ss', lag: 1 });
  const links = Sc.linksOf([A, B]);
  const c = Sc.criticalPath([A, B], links, plain);
  eq('start to start: both ends of a tight link are critical', [[...c.tasks].sort(), [...c.links]], [[1, 2], ['1>2']]);
  const slack = T(3, '2026-11-02', '2026-11-04'), after = T(4, '2026-11-10', '2026-11-12', { deps: [3] });
  const c2 = Sc.criticalPath([slack, after], Sc.linksOf([slack, after]), plain);
  eq('finish to start with a gap: the first task has slack, only the last one is on the path', [[...c2.tasks].sort(), [...c2.links]], [[4], []]);
  const lagged = T(5, '2026-11-02', '2026-11-04'), tight = T(6, '2026-11-07', '2026-11-09', { deps: [5], lag: 2 });
  const c3 = Sc.criticalPath([lagged, tight], Sc.linksOf([lagged, tight]), plain);
  eq('finish to start with a lag that fills the gap: both are critical', [[...c3.tasks].sort(), [...c3.links]], [[5, 6], ['5>6']]);
}

// ---- the table's columns
{
  const columns = columnsFromFixture([
    { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'After', type: 'RefList:Tasks' },
    { id: 'Lag_days', type: 'Int' }, { id: 'Link_type', type: 'Choice', choices: ['Finish to start', 'Start to start'] },
  ]);
  const found = detectRoles(columns, { tableId: 'Tasks' }).roles;
  eq('a Lag column and a Link type column are found by name', [found.lag, found.linkType], ['Lag_days', 'Link_type']);
  eq('…and are roles of the panel', ROLES.some((r) => r.id === 'lag') && ROLES.some((r) => r.id === 'linkType'), true);
  const other = detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Delay', type: 'Numeric' }, { id: 'Verzögerung_Tage', type: 'Int' }, { id: 'Link', type: 'Text' }]), { tableId: 'Tasks' }).roles;
  eq('a plain "Link" text column (a web address) is not a link type', other.linkType ?? null, null);
  eq('Delay and the German word are lags (the better match wins)', [other.lag === 'Delay' || other.lag === 'Verzögerung_Tage'], [true]);
  const rows = [{ id: 1, Task: 'a', Start: ['d', day('2026-11-02') * 86400], End: ['d', day('2026-11-03') * 86400], After: null, Lag_days: 2, Link_type: 'Start to start' }];
  const built = buildTasks(rows, { roles: { title: 'Task', start: 'Start', end: 'End', dependsOn: 'After', lag: 'Lag_days', linkType: 'Link_type' }, columns });
  eq('a task carries its lag and its type', [built.tasks[0].lag, built.tasks[0].linkType], [2, 'ss']);
  const none = buildTasks(rows, { roles: { title: 'Task', start: 'Start', end: 'End', dependsOn: 'After' }, columns });
  eq('without the columns: no lag, finish to start', [none.tasks[0].lag, none.tasks[0].linkType], [0, 'fs']);
  const changed = buildTasks([{ ...rows[0], Lag_days: 3 }], { roles: { title: 'Task', start: 'Start', end: 'End', dependsOn: 'After', lag: 'Lag_days', linkType: 'Link_type' }, columns });
  eq('a change of the lag changes the task\'s hash (so the view redraws)', built.tasks[0].hash !== changed.tasks[0].hash, true);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
