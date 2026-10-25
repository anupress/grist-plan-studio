// The workload: hours spread over working days and split between people, capacity from hours a week
// or a share, holidays and a person's own days off, periods, and levelling (what moves, what may not,
// one plan of 500 tasks in well under a second).

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const W = await imp('src/model/workload.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { makeCalendar } = await imp('src/model/calendar.js');
const { calendarPeriods } = await imp('src/model/booking.js');
const { linksOf } = await imp('src/model/schedule.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// Mon 2 Nov 2026 is a Monday. Ann, Ben, Dieter (part-time).
const MON = day('2026-11-02');
const d = (n) => ['d', (MON + n) * 86400];
const P = (...ids) => (ids.length === 1 ? ['R', 'People', ids[0]] : ['L', ...ids]);
const people = new Map([[1, 'Ann'], [2, 'Ben'], [3, 'Dieter']]);
const cal = makeCalendar();
const isWork = cal.isWork;

function plan(cols, rows, roles) {
  const columns = columnsFromFixture(cols);
  const tasks = buildTasks(rows, { roles, columns, labels: { Who: people } });
  return { columns, tasks: tasks.tasks, col: (id) => columns.find((c) => c.id === id) };
}
const loadOf = (wl, name, from = MON) => {
  const p = wl.people.find((x) => x.label === name);
  return p ? [...p.load].slice(0, 7).map((h) => Math.round(h * 100) / 100) : null;
};

// ---- the load ----------------------------------------------------------------------------------------
{
  const rows = [
    { id: 1, Task: 'Brief', Start: d(0), End: d(1), Who: P(1), Hours: 16 },
    { id: 2, Task: 'Pair', Start: d(0), End: d(1), Who: ['L', 1, 2], Hours: 16 },
    { id: 3, Task: 'Over the weekend', Start: d(4), End: d(7), Who: P(2), Hours: 16 },
    { id: 4, Task: 'Unestimated', Start: d(2), End: d(2), Who: P(1), Hours: null },
    { id: 5, Task: 'Finished', Start: d(2), End: d(2), Who: P(1), Hours: 8, Done: true },
  ];
  const { tasks, col } = plan(
    [{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Who', type: 'RefList:People' }, { id: 'Hours', type: 'Numeric' }, { id: 'Done', type: 'Bool' }],
    rows, { title: 'Task', start: 'Start', end: 'End', assignee: 'Who', effort: 'Hours', done: 'Done' });
  const wl = W.buildWorkload(tasks, rows, { personCol: col('Who'), labels: { Who: people }, isWork, from: MON, to: MON + 13, effortCol: col('Hours'), effortUnit: 'hours' });
  eq('Ann: 8 + 4 on Mon and Tue, nothing for the empty or the done task', loadOf(wl, 'Ann'), [12, 12, 0, 0, 0, 0, 0]);
  eq('Ben: half the pair, then the weekend task on Friday only (Sat, Sun off)', loadOf(wl, 'Ben'), [4, 4, 0, 0, 8, 0, 0]);
  eq('…and on the Monday after', wl.people.find((p) => p.label === 'Ben').load[7], 8);
  eq('Dieter has a row though nothing is his', loadOf(wl, 'Dieter'), [0, 0, 0, 0, 0, 0, 0]);
  eq('one task without hours is counted', wl.missing, 1);
  eq('Ann is over on Mon and Tue (12 of 8)', wl.overs.filter((o) => o.key === 'r:1').map((o) => iso(o.day)), ['2026-11-02', '2026-11-03']);
  eq('nobody else is over', wl.overs.filter((o) => o.key !== 'r:1').length, 0);
  eq('capacity: 8 on weekdays, 0 at the weekend', [...wl.people[0].cap].slice(0, 7), [8, 8, 8, 8, 8, 0, 0]);

  const weeks = calendarPeriods('week', MON, MON + 13, 1);
  const t = W.periodTotals(wl.people.find((p) => p.label === 'Ann'), weeks, MON);
  eq('Ann, week 1: 24 h of 40, 2 days over', [t[0].load, t[0].cap, t[0].over], [24, 40, 2]);
  eq('team, week 1: 24 + 16 + 0 h of 120', [W.teamTotals(wl.people, weeks, MON)[0].load, W.teamTotals(wl.people, weeks, MON)[0].cap], [40, 120]);
  const inCell = W.tasksIn(wl.people.find((p) => p.label === 'Ann'), weeks[0]).map((x) => `${x.task.title} ${x.hours}`);
  eq('the tasks behind Ann’s week, most hours first', inCell, ['Brief 16', 'Pair 8']);

  // Person-days, and a column that says so
  eq('"Hours" counts hours', W.effortUnitOf({ id: 'Hours', label: 'Hours' }), 'hours');
  eq('"Person_days" counts days', W.effortUnitOf({ id: 'Person_days', label: 'Person days' }), 'days');
  eq('"Aufwand_Tage" counts days', W.effortUnitOf({ id: 'Aufwand_Tage', label: 'Aufwand (Tage)' }), 'days');
  eq('"Charge (jours)" counts days', W.effortUnitOf({ id: 'Charge', label: 'Charge (jours)' }), 'days');
  eq('the setting wins', W.effortUnitOf({ id: 'Person_days', label: 'Person days' }, 'hours'), 'hours');
  const wd = W.buildWorkload(tasks, rows, { personCol: col('Who'), labels: { Who: people }, isWork, from: MON, to: MON + 13, effortCol: col('Hours'), effortUnit: 'days' });
  eq('16 person-days over Mon–Tue is 64 h a day for Ann (and over)', loadOf(wd, 'Ann')[0], 64 + 32);
}

// ---- no hours column: each task is a full day ----------------------------------------------------------
{
  const rows = [
    { id: 1, Task: 'A', Start: d(0), End: d(2), Who: P(1) },
    { id: 2, Task: 'B', Start: d(1), End: d(1), Who: P(1) },
    { id: 3, Task: 'Sign-off', Start: d(3), End: d(3), Who: P(1), MS: true },
    { id: 4, Task: 'Phase', Start: d(0), End: d(4), Who: P(2) },
    { id: 5, Task: 'Child', Start: d(0), End: d(0), Who: P(2), Parent: ['R', 'Tasks', 4] },
    { id: 6, Task: 'Part-time', Start: d(0), End: d(0), Who: P(3) },
  ];
  const { tasks, col } = plan(
    [{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Who', type: 'Ref:People' }, { id: 'MS', type: 'Bool' }, { id: 'Parent', type: 'Ref:Tasks' }],
    rows, { title: 'Task', start: 'Start', end: 'End', assignee: 'Who', milestone: 'MS', parent: 'Parent' });
  const capacity = new Map([['r:3', W.capacityPerDay(20, 'hours', 8)]]);
  const wl = W.buildWorkload(tasks, rows, { personCol: col('Who'), labels: { Who: people }, isWork, from: MON, to: MON + 6, capacity });
  eq('Ann: a full day for A, two on Tuesday, nothing for the milestone', loadOf(wl, 'Ann'), [8, 16, 8, 0, 0, 0, 0]);
  eq('Ben: the parent asks nothing, its child a day', loadOf(wl, 'Ben'), [8, 0, 0, 0, 0, 0, 0]);
  eq('Dieter (20 h a week): his full day is 4 h', loadOf(wl, 'Dieter'), [4, 0, 0, 0, 0, 0, 0]);
  eq('…and he has 4 h a day', [...wl.people.find((p) => p.label === 'Dieter').cap].slice(0, 5), [4, 4, 4, 4, 4]);
  eq('only Ann’s Tuesday is over', wl.overs.map((o) => `${o.key} ${iso(o.day)}`), ['r:1 2026-11-03']);
}

// ---- capacity ----------------------------------------------------------------------------------------
eq('40 h a week is 8 a day', W.capacityPerDay(40, 'hours', 8), 8);
eq('a share of 0.5 is 4 h', W.capacityPerDay(0.5, 'share', 8), 4);
eq('a share of 50 (%) is 4 h', W.capacityPerDay(50, 'share', 8), 4);
eq('an empty cell is a full day', W.capacityPerDay(null, 'hours', 7.5), 7.5);
eq('0 is no time at all', W.capacityPerDay(0, 'hours', 8), 0);
{
  const cols = (list) => columnsFromFixture(list);
  eq('Hours per week on People', W.detectCapacity(cols([{ id: 'Name', type: 'Text' }, { id: 'Hours_per_week', type: 'Numeric' }])), { id: 'Hours_per_week', mode: 'hours' });
  eq('FTE is a share', W.detectCapacity(cols([{ id: 'Name', type: 'Text' }, { id: 'FTE', type: 'Numeric' }])), { id: 'FTE', mode: 'share' });
  eq('Wochenstunden', W.detectCapacity(cols([{ id: 'Name', type: 'Text' }, { id: 'Wochenstunden', type: 'Int' }])), { id: 'Wochenstunden', mode: 'hours' });
  eq('Quotité (FR) is a share', W.detectCapacity(cols([{ id: 'Nom', type: 'Text' }, { id: 'Quotite', type: 'Numeric', label: 'Quotité' }])), { id: 'Quotite', mode: 'share' });
  eq('a text column is never capacity', W.detectCapacity(cols([{ id: 'Capacity', type: 'Text' }])), null);
  eq('a Capacity column of 0.5s and 1s is a share', W.capacityMode({ id: 'Capacity', label: 'Capacity' }, [1, 0.5, 0.8]), 'share');
  eq('…of 40s and 20s, hours', W.capacityMode({ id: 'Capacity', label: 'Capacity' }, [40, 20]), 'hours');
}

// ---- holidays and days off -----------------------------------------------------------------------------
{
  const rows = [{ id: 1, Task: 'Week of work', Start: d(0), End: d(4), Who: P(1), Hours: 32 }];
  const { tasks, col } = plan(
    [{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Who', type: 'Ref:People' }, { id: 'Hours', type: 'Numeric' }],
    rows, { title: 'Task', start: 'Start', end: 'End', assignee: 'Who', effort: 'Hours' });
  const holiday = makeCalendar({ holidays: new Map([[MON + 2, 'Holiday']]) });
  const wl = W.buildWorkload(tasks, rows, { personCol: col('Who'), labels: { Who: people }, isWork: holiday.isWork, from: MON, to: MON + 6, effortCol: col('Hours'), effortUnit: 'hours',
    daysOff: new Map([['r:1', new Set([MON + 3])]]) });
  eq('32 h over the four working days, none on the public holiday', loadOf(wl, 'Ann'), [8, 8, 0, 8, 8, 0, 0]);
  eq('Ann has nothing on the holiday or her own day off', [...wl.people[0].cap].slice(0, 5), [8, 8, 0, 0, 8]);
  eq('work on her day off is over capacity', wl.overs.map((o) => iso(o.day)), ['2026-11-05']);
  eq('Ben keeps his Thursday', [...wl.people[1].cap].slice(0, 5), [8, 8, 0, 8, 8]);
}

// ---- levelling ----------------------------------------------------------------------------------------
const lv = (rows, extra = {}) => {
  const { tasks, col } = plan(
    [{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Who', type: 'Ref:People' }, { id: 'Hours', type: 'Numeric' }, { id: 'After', type: 'RefList:Tasks' }, { id: 'Due', type: 'Date' }],
    rows, { title: 'Task', start: 'Start', end: 'End', assignee: 'Who', effort: 'Hours', dependsOn: 'After' });
  const r = W.levelPlan(tasks, rows, {
    personCol: col('Who'), labels: { Who: people }, isWork, effortCol: col('Hours'), effortUnit: 'hours',
    links: linksOf(tasks), today: extra.today ?? MON, shiftEnd: (task, s) => s + (task.end - task.start), beforeDay: (x) => x - 1,
    canMove: extra.canMove || (() => true), dueOf: (task) => { const row = rows.find((x) => x.id === task.id); return row?.Due ? row.Due[1] / 86400 : null; },
  });
  return { ...r, said: r.moves.map((m) => `${tasks.find((x) => x.id === m.id).title} ${iso(m.start)}–${iso(m.end)}`) };
};
{
  // Ann: A Mon–Wed 24 h; B Tue–Wed 16 h (both full days), and a Friday task C that ends the plan.
  const base = [
    { id: 1, Task: 'A', Start: d(0), End: d(2), Who: P(1), Hours: 24 },
    { id: 2, Task: 'B', Start: d(1), End: d(2), Who: P(1), Hours: 16 },
    { id: 3, Task: 'C', Start: d(4), End: d(4), Who: P(2), Hours: 8 },
  ];
  const r = lv(base);
  eq('B gives way: Wed–Thu is still taken on Wed, so Thu–Fri', r.said, ['B 2026-11-05–2026-11-06']);
  eq('two days over before, none after', [r.before, r.after], [2, 0]);

  const linked = lv([...base, { id: 4, Task: 'D', Start: d(3), End: d(3), Who: P(2), Hours: 8, After: ['L', 2] }]);
  eq('a task waiting for B (Thursday) leaves it no room', [linked.said, linked.stuck.map((s) => s.reason)], [[], ['slack']]);
  eq('…so the overload stays', linked.after, 2);

  const due = lv(base.map((x) => (x.id === 2 ? { ...x, Due: d(3) } : x)));
  eq('B due on Thursday cannot end on Friday', [due.said, due.stuck.map((s) => s.reason)], [[], ['slack']]);

  const started = lv(base, { today: MON + 2 });
  eq('both have started by Wednesday: nothing moves', [started.said, started.before], [[], 1]);

  const locked = lv(base, { canMove: (task) => task.title !== 'B' });
  eq('a task whose dates are formulas stays, and A finds no room before the plan ends', locked.said, []);

  const big = lv([{ id: 1, Task: 'Marathon', Start: d(0), End: d(0), Who: P(1), Hours: 12 }, { id: 2, Task: 'Later', Start: d(4), End: d(4), Who: P(2), Hours: 1 }]);
  eq('12 h in one day for one person never fits', big.stuck.map((s) => s.reason), ['tooBig']);

  const nothing = lv([{ id: 1, Task: 'Calm', Start: d(0), End: d(1), Who: P(1), Hours: 8 }]);
  eq('nobody over: no moves', [nothing.moves.length, nothing.before], [0, 0]);
}

// ---- logged and remaining (from the time entries) ---------------------------------------------------
{
  // Today is Wednesday. Ann: Design Mon–Fri, 40 h, 16 logged. Ben: Review Mon–Tue, 8 h, 2 logged, not
  // done, so late. Ann and Ben: Pair Wed–Thu, 16 h (8 each); Ann logged 4 before it began, Dieter (not
  // on it) 2, and an entry naming nobody 2. Ben: Future next Monday. A done task with time on it, and
  // an hour on a task that is not in the plan.
  const rows = [
    { id: 1, Task: 'Design', Start: d(0), End: d(4), Who: P(1), Hours: 40 },
    { id: 2, Task: 'Review', Start: d(0), End: d(1), Who: P(2), Hours: 8 },
    { id: 3, Task: 'Pair', Start: d(2), End: d(3), Who: ['L', 1, 2], Hours: 16 },
    { id: 4, Task: 'Future', Start: d(7), End: d(7), Who: P(2), Hours: 8 },
    { id: 5, Task: 'Shipped', Start: d(1), End: d(1), Who: P(1), Hours: 3, Done: true },
  ];
  const logs = [
    { task: 1, key: 'r:1', day: MON, hours: 10 }, { task: 1, key: 'r:1', day: MON + 1, hours: 6 },
    { task: 2, key: 'r:2', day: MON, hours: 2 },
    { task: 3, key: 'r:1', day: MON + 1, hours: 4 }, { task: 3, key: 'r:3', day: MON + 2, hours: 2 }, { task: 3, key: null, day: MON + 2, hours: 2 },
    { task: 5, key: 'r:1', day: MON + 1, hours: 3 },
    { task: 99, key: 'r:2', day: MON + 1, hours: 1 },
  ];
  const cols = [{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Who', type: 'RefList:People' }, { id: 'Hours', type: 'Numeric' }, { id: 'Done', type: 'Bool' }];
  const roles = { title: 'Task', start: 'Start', end: 'End', assignee: 'Who', effort: 'Hours', done: 'Done' };
  const { tasks, col } = plan(cols, rows, roles);
  const ctx = { personCol: col('Who'), labels: { Who: people }, isWork, from: MON, to: MON + 13, effortCol: col('Hours'), effortUnit: 'hours', logs, today: MON + 2 };
  const said = (wl) => wl.overs.map((o) => o.key + ' ' + iso(o.day));
  const week = calendarPeriods('week', MON, MON + 6, 1)[0];

  const left = W.buildWorkload(tasks, rows, { ...ctx, measure: 'remaining' });
  eq('remaining, Ann: Design’s 24 h left over Wed–Fri, and 1 h a day of Pair (8 − her 4 − her half of 4)', loadOf(left, 'Ann'), [0, 0, 9, 9, 8, 0, 0]);
  eq('remaining, Ben: late Review’s 6 h today, and 3 h a day of Pair', loadOf(left, 'Ben'), [0, 0, 9, 3, 0, 0, 0]);
  eq('…and Future on its day', left.people.find((p) => p.label === 'Ben').load[7], 8);
  eq('no capacity before today', [...left.people.find((p) => p.label === 'Ann').cap].slice(0, 5), [0, 0, 8, 8, 8]);
  eq('over from today only: Ann Wed and Thu, Ben Wed', said(left), ['r:1 2026-11-04', 'r:1 2026-11-05', 'r:2 2026-11-04']);
  eq('the late task says so in its cell', W.tasksIn(left.people.find((p) => p.label === 'Ben'), week).map((x) => x.task.title + ' ' + x.hours + (x.late ? ' late' : '')), ['Review 6 late', 'Pair 6']);

  const more = W.buildWorkload(tasks, rows, { ...ctx, measure: 'remaining', logs: [...logs, { task: 1, key: 'r:1', day: MON + 1, hours: 30 }] });
  eq('more logged than planned: nothing left, never less than nothing', loadOf(more, 'Ann'), [0, 0, 1, 1, 0, 0, 0]);

  const done = W.buildWorkload(tasks, rows, { ...ctx, measure: 'logged' });
  eq('logged, Ann: her entries on their days, half the entry naming nobody', loadOf(done, 'Ann'), [10, 13, 1, 0, 0, 0, 0]);
  eq('logged, Ben: an hour on a task outside the plan counts too', loadOf(done, 'Ben'), [2, 1, 1, 0, 0, 0, 0]);
  eq('logged, Dieter has his 2 h though Pair is not his', loadOf(done, 'Dieter'), [0, 0, 2, 0, 0, 0, 0]);
  eq('logged over capacity: Ann on Mon and Tue', said(done), ['r:1 2026-11-02', 'r:1 2026-11-03']);
  eq('logged, Ann’s Tuesday by task (the done one too), a task once', W.tasksIn(done.people.find((p) => p.label === 'Ann'), { start: MON + 1, end: MON + 1 }).map((x) => x.task.title + ' ' + x.hours), ['Design 6', 'Pair 4', 'Shipped 3']);
  eq('the task outside the plan has no name to show, and comes last of equals', W.tasksIn(done.people.find((p) => p.label === 'Ben'), week).map((x) => x.task.title), ['Review', 'Pair', null]);
  eq('nothing missing in logged hours', done.missing, 0);

  const noHours = plan(cols, [rows[0]], { ...roles, effort: null });
  const plain = W.buildWorkload(noHours.tasks, [rows[0]], { ...ctx, effortCol: null, measure: 'remaining' });
  eq('without hours, what remains is the plan from today on: a full day each day', loadOf(plain, 'Ann'), [0, 0, 8, 8, 8, 0, 0]);

  const level = (extra) => W.levelPlan(tasks, rows, { ...ctx, ...extra, links: [], shiftEnd: (task, st) => st + (task.end - task.start), beforeDay: (x) => x - 1 });
  eq('levelling counts what remains (3 days over), not the plan (2)', [level({ measure: 'remaining' }).before, level({}).before], [3, 2]);

  // a text column of people: someone who logged time without a task of their own gets a row
  const textCols = [{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Who', type: 'Text' }, { id: 'Hours', type: 'Numeric' }];
  const tr = [{ id: 1, Task: 'Design', Start: d(0), End: d(4), Who: 'Ann', Hours: 40 }];
  const tp = plan(textCols, tr, { title: 'Task', start: 'Start', end: 'End', assignee: 'Who', effort: 'Hours' });
  const zoe = W.buildWorkload(tp.tasks, tr, { personCol: tp.col('Who'), isWork, from: MON, to: MON + 6, measure: 'logged', logs: [{ task: 1, key: 'v:Zoe', day: MON, hours: 3 }] });
  eq('a person with only time logged has a row', zoe.people.map((p) => p.label + ' ' + p.load[0]), ['Ann 0', 'Zoe 3']);
}

// ---- 500 tasks ---------------------------------------------------------------------------------------
{
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const rows = [];
  for (let i = 1; i <= 500; i++) {
    const s = rnd(120), len = 1 + rnd(8);
    rows.push({ id: i, Task: 'T' + i, Start: d(s), End: d(s + len - 1), Who: P(1 + rnd(3)), Hours: (1 + rnd(5)) * len, After: i > 20 && rnd(4) === 0 ? ['L', 1 + rnd(i - 1)] : null });
  }
  const t0 = performance.now();
  const r = lv(rows);
  const ms = performance.now() - t0;
  eq('500 tasks level in under a second', ms < 1000, true);
  eq('levelling never makes it worse', r.after <= r.before, true);
  eq('…and does move some', r.moves.length > 0, true);
  console.log(`  500 tasks: ${Math.round(ms)} ms, ${r.before} → ${r.after} days over, ${r.moves.length} moved, ${r.stuck.length} stuck`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
