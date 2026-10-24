// The M3 exit check: a 40-task plan with dependencies reschedules correctly, and its critical path
// matches one worked out by hand. (The small cases for pushPlan and criticalPath are in tree.test.mjs.)
//
// The plan, in working days (Mon-Fri, no holidays), from Monday 2 November 2026:
//   1        Kick-off, 1 day
//   2-10     Stream A, 9 tasks of 2 days, in a chain after the kick-off   = 18 days
//   11-19    Stream B, 9 tasks of 3 days, likewise                         = 27 days (the longest)
//   20-28    Stream C, 9 tasks of 1 day                                    =  9 days
//   29-37    Stream D, 8 tasks of 2 days and a last one of 4               = 20 days
//   38       Integration, 2 days, after the last task of every stream
//   39       Testing, 3 days
//   40       Launch, 1 day
// Worked by hand: B runs from Tue 3 Nov for 27 working days to Wed 9 Dec; Integration Thu 10 - Fri 11
// Dec, Testing Mon 14 - Wed 16 Dec, Launch Thu 17 Dec. The critical path is 1, 11-19, 38, 39, 40.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const S = await imp('src/model/schedule.js');
const { makeCalendar } = await imp('src/model/calendar.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const work = makeCalendar({ workdays: true });

// [id, working days, depends on]
const SPEC = [[1, 1, []]];
const stream = (first, lengths) => lengths.forEach((n, i) => SPEC.push([first + i, n, [i ? first + i - 1 : 1]]));
stream(2, Array(9).fill(2));
stream(11, Array(9).fill(3));
stream(20, Array(9).fill(1));
stream(29, [...Array(8).fill(2), 4]);
SPEC.push([38, 2, [10, 19, 28, 37]], [39, 3, [38]], [40, 1, [39]]);

// Every task as early as its predecessors allow (the plan as a planner would have entered it).
const tasks = [];
const at = new Map();
for (const [id, n, deps] of SPEC) {
  const start = deps.length ? Math.max(...deps.map((d) => work.after(at.get(d).end))) : day('2026-11-02');
  const t = { id, index: id, title: 'T' + id, start, end: work.endAfter(start, n), parentId: null, deps };
  tasks.push(t);
  at.set(id, t);
}
const dates = (id) => [iso(at.get(id).start), iso(at.get(id).end)];
eq('40 tasks', tasks.length, 40);
eq('hand check: stream B ends Wed 9 Dec', iso(at.get(19).end), '2026-12-09');
eq('hand check: stream A ends Thu 26 Nov', iso(at.get(10).end), '2026-11-26');
eq('hand check: Integration, Testing, Launch', [dates(38), dates(39), dates(40)],
  [['2026-12-10', '2026-12-11'], ['2026-12-14', '2026-12-16'], ['2026-12-17', '2026-12-17']]);

const links = S.linksOf(tasks);
eq('links: 36 in the streams, 4 into Integration, 2 after it', links.length, 42);

// ---- the critical path, against the hand-worked one
{
  const cp = S.criticalPath(tasks, links, work);
  eq('critical tasks: kick-off, stream B, Integration, Testing, Launch', [...cp.tasks].sort((a, b) => a - b), [1, ...range(11, 19), 38, 39, 40]);
  eq('critical links: 12, along that path', [...cp.links].sort(),
    ['1>11', ...range(11, 18).map((i) => `${i}>${i + 1}`), '19>38', '38>39', '39>40'].sort());
}

// Apply a move and the push it brings, as main.js writes them (one action for all of them).
const after = (moved, push) => tasks.map((t) => {
  const p = moved.id === t.id ? moved : push.find((x) => x.id === t.id);
  return p ? { ...t, start: p.start, end: p.end } : t;
});
const shifted = (id, n) => { const t = at.get(id); return { id, start: work.shift(t.start, n), end: work.shift(t.end, n) }; };

// ---- a two-day slip in the middle of the critical stream ripples to the launch
{
  const moved = shifted(13, 2);
  const push = S.pushPlan(tasks, links, moved, work);
  eq('slip B3 by 2 days: B4-B9, Integration, Testing, Launch move (9 tasks)', push.map((p) => p.id).sort((a, b) => a - b), [...range(14, 19), 38, 39, 40]);
  eq('…each by exactly 2 working days, keeping its length',
    push.every((p) => p.start === work.shift(at.get(p.id).start, 2) && work.length(p.start, p.end) === work.length(at.get(p.id).start, at.get(p.id).end)), true);
  eq('…so Launch moves from Thu 17 to Mon 21 Dec', iso(push.find((p) => p.id === 40).start), '2026-12-21');
  const next = after(moved, push);
  eq('…and no link is broken afterwards', S.linksOf(next).filter((l) => S.isLate(l, new Map(next.map((t) => [t.id, t])), work)).length, 0);
}

// ---- a slip in a stream with slack stays inside it
{
  const moved = shifted(2, 5);
  const push = S.pushPlan(tasks, links, moved, work);
  eq('slip A1 by 5 days: only A2-A9 move; A still ends before B (Thu 3 Dec)', [push.map((p) => p.id).sort((a, b) => a - b), iso(push.find((p) => p.id === 10).end)], [range(3, 10), '2026-12-03']);
}

// ---- a slip bigger than the slack takes over the critical path
{
  const moved = shifted(2, 10);
  const push = S.pushPlan(tasks, links, moved, work);
  eq('slip A1 by 10 days: A2-A9 and Integration, Testing, Launch move (11 tasks)', push.map((p) => p.id).sort((a, b) => a - b), [...range(3, 10), 38, 39, 40]);
  const next = after(moved, push);
  const byId = new Map(next.map((t) => [t.id, t]));
  eq('…A ends Thu 10 Dec, Integration Fri 11 - Mon 14, Launch Fri 18 Dec',
    [iso(byId.get(10).end), iso(byId.get(38).start), iso(byId.get(38).end), iso(byId.get(40).start)], ['2026-12-10', '2026-12-11', '2026-12-14', '2026-12-18']);
  const cp = S.criticalPath(next, S.linksOf(next), work);
  eq('…now stream A is critical; B has a day of slack and so does the kick-off', [...cp.tasks].sort((a, b) => a - b), [...range(2, 10), 38, 39, 40]);
}

// ---- the same plan in calendar days: nothing is pushed over a weekend that is not there
{
  const plain = makeCalendar();
  const t2 = tasks.map((t) => ({ ...t }));
  const push = S.pushPlan(t2, links, { id: 1, start: at.get(1).start + 1, end: at.get(1).end + 1 }, plain);
  eq('calendar days: moving the kick-off a day pushes the first task of each stream (no slack there)', push.filter((p) => [2, 11, 20, 29].includes(p.id)).length, 4);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
