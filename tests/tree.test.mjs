// Row order: parents and children, summary spans, groups, collapsing, loops, undated tasks.
// And dependencies: pushing successors along, loops, the critical path, with and without working days.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const { arrange } = await imp('src/model/tree.js');
const S = await imp('src/model/schedule.js');
const { makeCalendar, holidaysBetween } = await imp('src/model/calendar.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const T = (id, s, e, extra = {}) => ({ id, index: id, title: 'T' + id, start: s == null ? null : day(s), end: e == null ? null : day(e), parentId: null, deps: [], ...extra });
const show = (entries) => entries.map((e) => (e.kind === 'group' ? `[${e.label}:${e.count}]` : '  '.repeat(e.depth) + e.task.title + (e.summary ? '*' : '') + (e.undated ? '?' : '') + (e.collapsed ? '+' : '')));

// ---- parents and children
{
  const tasks = [
    T(1, null, null, { title: 'Phase A' }),
    T(2, '2026-11-02', '2026-11-04', { parentId: 1 }),
    T(3, '2026-11-05', '2026-11-10', { parentId: 1 }),
    T(4, '2026-11-11', '2026-11-12'),
    T(5, '2026-11-06', '2026-11-07', { parentId: 3 }),
    T(6, null, null),
  ];
  const r = arrange(tasks);
  eq('tree order, summaries marked, undated last', show(r.entries), ['Phase A*', '  T2', '  T3*', '    T5', 'T4', 'T6?']);
  eq('a parent without dates spans its children', [iso(r.summaries.get(1).start), iso(r.summaries.get(1).end), r.summaries.get(1).count], ['2026-11-02', '2026-11-10', 3]);
  eq('a parent with dates of its own spans both', [iso(r.summaries.get(3).start), iso(r.summaries.get(3).end)], ['2026-11-05', '2026-11-10']);
  eq('depth and children counts', r.entries.slice(0, 4).map((e) => [e.depth, e.kids]), [[0, 2], [1, 0], [1, 1], [2, 0]]);
  const c = arrange(tasks, { collapsed: new Set(['p:1']) });
  eq('a collapsed parent hides everything under it', show(c.entries), ['Phase A*+', 'T4', 'T6?']);
  eq('hidden tasks are not visible', c.visibleIds.has(5), false);
}
{
  const loop = [T(1, '2026-11-02', '2026-11-03', { parentId: 2 }), T(2, '2026-11-04', '2026-11-05', { parentId: 1 }), T(3, '2026-11-06', '2026-11-06', { parentId: 3 })];
  eq('a loop is cut where it closes; a task that is its own parent is top-level', show(arrange(loop).entries), ['T2*', '  T1', 'T3']);
  eq('a parent that is filtered out leaves the child at the top', show(arrange([T(2, '2026-11-02', '2026-11-03', { parentId: 99 })]).entries), ['T2']);
}

// ---- groups
{
  const tasks = [
    T(1, '2026-11-02', '2026-11-03', { status: 'Doing' }),
    T(2, '2026-11-04', '2026-11-08', { status: 'To do' }),
    T(3, '2026-11-01', '2026-11-02', { status: null }),
    T(4, '2026-11-05', '2026-11-06', { status: 'Doing', parentId: 1 }),
    T(5, '2026-11-09', '2026-11-09', { status: 'To do', parentId: 1 }),
  ];
  const group = { key: (t) => t.status, label: (k) => k || '(none)', order: ['To do', 'Doing', 'Done'] };
  const r = arrange(tasks, { group });
  eq('groups in the column’s choice order, no value last; a child in another group stands alone there',
    show(r.entries), ['[To do:2]', 'T2', 'T5', '[Doing:2]', 'T1*', '  T4', '[(none):1]', 'T3']);
  const g = r.entries.find((e) => e.kind === 'group' && e.key === 'To do');
  eq('a group spans its tasks', [iso(g.start), iso(g.end)], ['2026-11-04', '2026-11-09']);
  eq('a collapsed group shows only its header', show(arrange(tasks, { group, collapsed: new Set(['g:Doing']) }).entries), ['[To do:2]', 'T2', 'T5', '[Doing:2]', '[(none):1]', 'T3']);
}

// ---- dependencies --------------------------------------------------------------------------------------
const plain = makeCalendar();
{
  const tasks = [
    T(1, '2026-11-02', '2026-11-04'),
    T(2, '2026-11-05', '2026-11-06', { deps: [1] }),
    T(3, '2026-11-09', '2026-11-10', { deps: [2] }),
    T(4, '2026-11-20', '2026-11-20', { deps: [1] }),
    T(5, '2026-11-05', '2026-11-05', { deps: [99, 5] }),
  ];
  const links = S.linksOf(tasks);
  eq('links: only between tasks here, never to itself', links.map((l) => `${l.from}>${l.to}`), ['1>2', '2>3', '1>4']);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  eq('nothing late yet', links.map((l) => S.isLate(l, byId, plain)), [false, false, false]);
  const push = S.pushPlan(tasks, links, { id: 1, start: day('2026-11-04'), end: day('2026-11-06') }, plain);
  eq('moving T1 two days later pushes T2; T3 (from the 9th) and T4 still have room',
    push.map((p) => [p.id, iso(p.start), iso(p.end)]), [[2, '2026-11-07', '2026-11-08']]);
  eq('moving earlier pushes nothing', S.pushPlan(tasks, links, { id: 1, start: day('2026-10-30'), end: day('2026-11-01') }, plain), []);
  const big = S.pushPlan(tasks, links, { id: 1, start: day('2026-11-08'), end: day('2026-11-10') }, plain);
  eq('a bigger move ripples down the chain', big.map((p) => [p.id, iso(p.start), iso(p.end)]), [[2, '2026-11-11', '2026-11-12'], [3, '2026-11-13', '2026-11-14']]);
  eq('loops: adding 3>1 would close one', [S.wouldLoop(links, 3, 1), S.wouldLoop(links, 1, 3), S.wouldLoop(links, 2, 2)], [true, false, true]);
}
{
  // with working days and a holiday: T2 must start on the next working day after T1 and keep 2 working days
  const hol = holidaysBetween('DE', day('2026-01-01'), day('2026-12-31'));
  const work = makeCalendar({ workdays: true, holidays: hol });
  const tasks = [T(1, '2026-03-30', '2026-03-31'), T(2, '2026-04-01', '2026-04-02', { deps: [1] })];
  const push = S.pushPlan(tasks, S.linksOf(tasks), { id: 1, start: day('2026-03-31'), end: day('2026-04-01') }, work);
  eq('working days: pushed past Good Friday, the weekend and Easter Monday', push.map((p) => [iso(p.start), iso(p.end)]), [['2026-04-02', '2026-04-07']]);
}

// ---- groups inside groups (M27)
{
  const tasks = [
    T(1, '2026-11-02', '2026-11-03', { status: 'Doing', team: 'Ann' }),
    T(2, '2026-11-04', '2026-11-08', { status: 'To do', team: 'Ben' }),
    T(3, '2026-11-01', '2026-11-02', { status: 'Doing', team: 'Ben' }),
    T(4, '2026-11-09', '2026-11-10', { status: 'To do', team: 'Ann' }),
    T(5, '2026-11-11', '2026-11-12', { status: 'To do', team: 'Ann', parentId: 4 }),
    T(6, '2026-11-13', '2026-11-13', { status: 'To do', team: null }),
  ];
  const group = { key: (t) => t.status, label: (k) => k || '(none)', order: ['To do', 'Doing'] };
  const group2 = { key: (t) => t.team, label: (k) => k || '(nobody)' };
  const r = arrange(tasks, { group, group2 });
  eq('a group has its own groups: status, then person (no value last)', show(r.entries).map((x) => x), ['[To do:4]', '[Ben:1]', 'T2', '[Ann:2]', 'T4*', '  T5', '[(nobody):1]', 'T6', '[Doing:2]', '[Ann:1]', 'T1', '[Ben:1]', 'T3']);
  eq('the levels', r.entries.filter((e) => e.kind === 'group').map((e) => e.level), [0, 1, 1, 1, 0, 1, 1]);
  eq('the inner key carries the outer', r.entries.filter((e) => e.kind === 'group' && e.level === 1).map((e) => e.key.split('')), [['To do', 'Ben'], ['To do', 'Ann'], ['To do', ''], ['Doing', 'Ann'], ['Doing', 'Ben']]);
  eq('an inner group spans its tasks', (() => { const g = r.entries.find((e) => e.key === 'To doAnn'); return [iso(g.start), iso(g.end), g.count]; })(), ['2026-11-09', '2026-11-12', 2]);
  eq('a collapsed inner group shows only its header', show(arrange(tasks, { group, group2, collapsed: new Set(['g:To doAnn']) }).entries).slice(0, 5), ['[To do:4]', '[Ben:1]', 'T2', '[Ann:2]', '[(nobody):1]']);
  eq('a collapsed outer group hides the inner ones too', show(arrange(tasks, { group, group2, collapsed: new Set(['g:To do']) }).entries).slice(0, 3), ['[To do:4]', '[Doing:2]', '[Ann:1]']);
  eq('a second level with no first level is no grouping', show(arrange(tasks, { group2 }).entries).filter((x) => x.startsWith('[')), []);
  eq('a child stays under its parent only in the same inner group', show(arrange(tasks.map((t) => (t.id === 5 ? { ...t, team: 'Ben' } : t)), { group, group2 }).entries).slice(0, 8), ['[To do:4]', '[Ben:2]', 'T2', 'T5', '[Ann:1]', 'T4', '[(nobody):1]', 'T6']);
}

// ---- critical path ---------------------------------------------------------------------------------
{
  // A(2d) -> B(3d) -> D(2d) is the long chain; A -> C(1d) -> D has slack; E stands alone.
  const tasks = [
    T(1, '2026-11-02', '2026-11-03', { title: 'A' }),
    T(2, '2026-11-04', '2026-11-06', { title: 'B', deps: [1] }),
    T(3, '2026-11-04', '2026-11-04', { title: 'C', deps: [1] }),
    T(4, '2026-11-07', '2026-11-08', { title: 'D', deps: [2, 3] }),
    T(5, '2026-11-02', '2026-11-08', { title: 'E' }),
  ];
  const cp = S.criticalPath(tasks, S.linksOf(tasks), plain);
  eq('critical: A, B, D (C has two days of slack, E has no links)', [...cp.tasks].sort(), [1, 2, 4]);
  eq('critical links', [...cp.links].sort(), ['1>2', '2>4']);
  eq('no links, no path', S.criticalPath(tasks.map((t) => ({ ...t, deps: [] })), [], plain).tasks.size, 0);
  const loop = [T(1, '2026-11-02', '2026-11-03', { deps: [2] }), T(2, '2026-11-04', '2026-11-05', { deps: [1] })];
  eq('a loop gives no path', S.criticalPath(loop, S.linksOf(loop), plain).tasks.size, 0);
}
{
  // Working days: Fri 30 Oct -> Mon 2 Nov is tight (no working day between), so both are critical.
  const work = makeCalendar({ workdays: true });
  const tasks = [T(1, '2026-10-29', '2026-10-30'), T(2, '2026-11-02', '2026-11-03', { deps: [1] })];
  eq('working days: a weekend between two tasks is no slack', [...S.criticalPath(tasks, S.linksOf(tasks), work).tasks].sort(), [1, 2]);
  eq('…but in calendar days it is', [...S.criticalPath(tasks, S.linksOf(tasks), plain).tasks].sort(), [2]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
