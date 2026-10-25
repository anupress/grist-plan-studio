// Plan against actual (M18): the planned days of a task, the day it was really done, the words for the slip, which
// tasks a baseline is set for, and what a baseline and a finish write.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const P = await imp('src/model/plan.js');
const E = await imp('src/model/edits.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { detectRoles } = await imp('src/model/roles.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const D = (iso) => ['d', day(iso) * 86400];
const columns = columnsFromFixture([
  { id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Due', type: 'Date' },
  { id: 'Baseline_Start', type: 'Date' }, { id: 'Baseline_End', type: 'Date' }, { id: 'Done_On', type: 'Date' },
]);
const roles = { title: 'Task', start: 'Start', end: 'End', baselineStart: 'Baseline_Start', baselineEnd: 'Baseline_End', doneOn: 'Done_On' };
const build = (rows, over = {}) => buildTasks(rows, { roles: { ...roles, ...over }, columns });
const one = (row, over) => build([{ id: 1, ...row }], over).tasks[0];

// ---- tasks carry their plan
{
  const t = one({ Task: 'A', Start: D('2026-11-09'), End: D('2026-11-13'), Baseline_Start: D('2026-11-02'), Baseline_End: D('2026-11-06'), Done_On: D('2026-11-12') });
  eq('planned days and the finish are the task’s own facts', [t.baseStart, t.baseEnd, t.doneOn], [day('2026-11-02'), day('2026-11-06'), day('2026-11-12')]);
  const noPlan = one({ Task: 'B', Start: D('2026-11-09'), End: D('2026-11-13') });
  eq('no plan, no finish: nothing', [noPlan.baseStart, noPlan.baseEnd, noPlan.doneOn], [null, null, null]);
  const startOnly = one({ Task: 'C', Start: D('2026-11-09'), End: D('2026-11-13'), Baseline_Start: D('2026-11-02') });
  eq('a planned start alone keeps the task’s own length (5 days)', [startOnly.baseStart, startOnly.baseEnd], [day('2026-11-02'), day('2026-11-06')]);
  const endOnly = one({ Task: 'D', Start: D('2026-11-09'), End: D('2026-11-13'), Baseline_End: D('2026-11-06') });
  eq('a planned end alone does too', [endOnly.baseStart, endOnly.baseEnd], [day('2026-11-02'), day('2026-11-06')]);
  const backwards = one({ Task: 'E', Start: D('2026-11-09'), End: D('2026-11-13'), Baseline_Start: D('2026-11-10'), Baseline_End: D('2026-11-04') });
  eq('a plan that ends before it starts is one day long', [backwards.baseStart, backwards.baseEnd], [day('2026-11-10'), day('2026-11-10')]);
  const exclusive = buildTasks([{ id: 1, Task: 'F', Start: D('2026-11-09'), End: D('2026-11-14'), Baseline_Start: D('2026-11-02'), Baseline_End: D('2026-11-07') }], { roles, columns, settings: { endInclusive: false } }).tasks[0];
  eq('an end that is the day after counts the same way for the plan', [exclusive.end, exclusive.baseEnd], [day('2026-11-13'), day('2026-11-06')]);
  const undated = build([{ id: 1, Task: 'G', Baseline_Start: D('2026-11-02'), Baseline_End: D('2026-11-06') }]);
  eq('a task with no dates of its own is still undated; its plan is not drawn', [undated.tasks.length, undated.unscheduled.length, undated.unscheduled[0].baseStart], [0, 1, null]);
  const dueOnly = buildTasks([{ id: 1, Task: 'H', Due: D('2026-11-20'), Baseline_End: D('2026-11-16') }], { roles: { title: 'Task', due: 'Due', baselineEnd: 'Baseline_End' }, columns }).tasks[0];
  eq('a due-date milestone with a planned end: planned on that day', [dueOnly.kind, dueOnly.baseStart, dueOnly.baseEnd], ['milestone', day('2026-11-16'), day('2026-11-16')]);
  const a = one({ Task: 'A', Start: D('2026-11-09'), End: D('2026-11-13'), Baseline_End: D('2026-11-06') });
  const b = one({ Task: 'A', Start: D('2026-11-09'), End: D('2026-11-13'), Baseline_End: D('2026-11-07') });
  eq('a changed plan redraws (the hash differs)', a.hash !== b.hash, true);
}

// ---- the slip, in numbers and in words
{
  const t = (s, e, bs, be) => ({ start: day(s), end: day(e), baseStart: day(bs), baseEnd: day(be) });
  eq('no plan: no slip', [P.slipOf({ start: 1, end: 2, baseStart: null, baseEnd: null }), P.slipWords({ start: 1, end: 2 }), P.drifted({ start: 1, end: 2 })], [null, null, false]);
  eq('moved a week later: both ends 7', P.slipOf(t('2026-11-09', '2026-11-13', '2026-11-02', '2026-11-06')), { start: 7, end: 7 });
  eq('the finish decides the words: later', P.slipWords(t('2026-11-09', '2026-11-13', '2026-11-02', '2026-11-06')), { key: 'later', n: 7 });
  eq('earlier', P.slipWords(t('2026-11-02', '2026-11-04', '2026-11-02', '2026-11-06')), { key: 'earlier', n: 2 });
  eq('same finish, later start: the start is said', P.slipWords(t('2026-11-04', '2026-11-06', '2026-11-02', '2026-11-06')), { key: 'startsLater', n: 2 });
  eq('same finish, earlier start', P.slipWords(t('2026-11-01', '2026-11-06', '2026-11-02', '2026-11-06')), { key: 'startsEarlier', n: 1 });
  eq('exactly as planned', [P.slipWords(t('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06')), P.drifted(t('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06'))], [{ key: 'onPlan' }, false]);
  eq('a longer task that still ends on time has drifted', P.drifted(t('2026-11-01', '2026-11-06', '2026-11-02', '2026-11-06')), true);
  eq('the short form', [P.slipShort(t('2026-11-09', '2026-11-13', '2026-11-02', '2026-11-06')), P.slipShort(t('2026-11-02', '2026-11-04', '2026-11-02', '2026-11-06')), P.slipShort(t('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06')), P.slipShort({ start: 1, end: 2 })],
    [{ key: 'plus', n: 7 }, { key: 'minus', n: 2 }, { key: 'onPlan' }, null]);
  eq('finished against the end: after, before, null', [P.finishedVsEnd({ doneOn: 10, end: 7 }), P.finishedVsEnd({ doneOn: 5, end: 7 }), P.finishedVsEnd({ doneOn: null, end: 7 })], [3, -2, null]);
}

// ---- which tasks a baseline covers
{
  const tasks = [
    { id: 1, start: 10, end: 12, baseStart: 9, baseEnd: 11 },
    { id: 2, start: 20, end: 20, baseStart: null, baseEnd: null },
    { id: 3, start: null, end: null, baseStart: null, baseEnd: null },
  ];
  eq('all: every dated task, as it is now', P.baselineTargets(tasks, 'all'), [{ id: 1, start: 10, end: 12 }, { id: 2, start: 20, end: 20 }]);
  eq('missing: only the tasks with no plan yet', P.baselineTargets(tasks, 'missing'), [{ id: 2, start: 20, end: 20 }]);
  eq('the summary says how many it covers and how many already have a plan', P.baselineSummary(tasks), { dated: 2, planned: 1, missing: 1 });
}

// ---- what is written
{
  const mk = (cols, r, extra = {}) => ({ columns: columnsFromFixture(cols), roles: r, settings: {}, editable: true, ...extra });
  const ctx = mk([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'E', type: 'Date' }, { id: 'BS', type: 'Date' }, { id: 'BE', type: 'Date' }, { id: 'DO', type: 'Date' }],
    { title: 'T', start: 'S', end: 'E', baselineStart: 'BS', baselineEnd: 'BE', doneOn: 'DO' });
  const secs = (iso) => day(iso) * 86400;
  eq('a baseline writes both planned dates', E.baselineFields(ctx, day('2026-11-02'), day('2026-11-06')).fields, { BS: secs('2026-11-02'), BE: secs('2026-11-06') });
  eq('and the same shape for the widget’s own rows', E.baselineFields(ctx, day('2026-11-02'), day('2026-11-06')).patch, { BS: ['d', secs('2026-11-02')], BE: ['d', secs('2026-11-06')] });
  const exclusive = { ...ctx, settings: { endInclusive: false } };
  eq('an end that is the day after is written as such', E.baselineFields(exclusive, day('2026-11-02'), day('2026-11-06')).fields.BE, secs('2026-11-07'));
  eq('both columns are there and can be written', E.baselineColumns(ctx), { start: true, end: true });
  const formula = mk([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'BS', type: 'Date', isFormula: true }, { id: 'BE', type: 'Date' }], { title: 'T', start: 'S', baselineStart: 'BS', baselineEnd: 'BE' });
  eq('a formula column is never written', [E.baselineFields(formula, 1, 2).fields, E.baselineColumns(formula)], [{ BE: 2 * 86400 }, { start: false, end: true }]);
  eq('no planned columns: nothing to write', E.baselineFields(mk([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }], { title: 'T', start: 'S' }), 1, 2), { fields: {}, patch: {} });
  eq('the finish writes the day, or clears it', [E.doneOnFields(ctx, day('2026-11-12')).fields, E.doneOnFields(ctx, null).fields], [{ DO: secs('2026-11-12') }, { DO: null }]);
  eq('the marker can be dragged when the column can be written', [E.canMoveDoneOn(ctx), E.canMoveDoneOn({ ...ctx, editable: false }), E.canMoveDoneOn(formula)], [true, false, false]);
}

// ---- found by name
{
  const d = detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Baseline_Start', type: 'Date' }, { id: 'Baseline_End', type: 'Date' }, { id: 'Done_On', type: 'Date' }]));
  eq('English names', d.roles, { title: 'Task', start: 'Start', end: 'End', baselineStart: 'Baseline_Start', baselineEnd: 'Baseline_End', doneOn: 'Done_On' });
  const de = detectRoles(columnsFromFixture([{ id: 'Aufgabe', type: 'Text' }, { id: 'Beginn', type: 'Date' }, { id: 'Ende', type: 'Date' }, { id: 'Geplanter_Beginn', type: 'Date' }, { id: 'Geplantes_Ende', type: 'Date' }, { id: 'Erledigt_am', type: 'Date' }]));
  eq('German names', de.roles, { title: 'Aufgabe', start: 'Beginn', end: 'Ende', baselineStart: 'Geplanter_Beginn', baselineEnd: 'Geplantes_Ende', doneOn: 'Erledigt_am' });
  const fr = detectRoles(columnsFromFixture([{ id: 'Titre', type: 'Text' }, { id: 'Debut', type: 'Date' }, { id: 'Fin', type: 'Date' }, { id: 'Debut_prevu', type: 'Date' }, { id: 'Fin_prevue', type: 'Date' }, { id: 'Termine_le', type: 'Date' }]));
  eq('French names', fr.roles, { title: 'Titre', start: 'Debut', end: 'Fin', baselineStart: 'Debut_prevu', baselineEnd: 'Fin_prevue', doneOn: 'Termine_le' });
  const only = detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Planned_Start', type: 'Date' }, { id: 'Planned_End', type: 'Date' }]));
  eq('a table with only planned dates: those are its dates', only.roles, { title: 'Task', start: 'Planned_Start', end: 'Planned_End' });
  const mixed = detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Planned_Start', type: 'Date' }, { id: 'Due', type: 'Date' }]));
  eq('with a due date the planned start stays a plan', [mixed.roles.baselineStart, mixed.roles.due, mixed.roles.start], ['Planned_Start', 'Due', undefined]);
  const created = detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Created_At', type: 'Date' }]));
  eq('an ordinary table gains no plan roles', [created.roles.baselineStart, created.roles.baselineEnd, created.roles.doneOn], [undefined, undefined, undefined]);
}

// ---- a column added after the mapping was saved
{
  const { withPlanRoles, toStored } = await imp('src/model/roles.js');
  const cols = columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Planned_start', type: 'Date' }, { id: 'Planned_end', type: 'Date' }, { id: 'Done_on', type: 'Date' }, { id: 'Created', type: 'Date' }]);
  const saved = { title: 'Task', start: 'Start', end: 'End' };
  eq('the plan columns are found by name next to a saved mapping', withPlanRoles(saved, cols, 'T'), { title: 'Task', start: 'Start', end: 'End', baselineStart: 'Planned_start', baselineEnd: 'Planned_end', doneOn: 'Done_on' });
  eq('what was saved is kept as it is', withPlanRoles({ ...saved, baselineStart: 'Created' }, cols, 'T').baselineStart, 'Created');
  eq('a column the saved mapping already uses is not taken twice', withPlanRoles({ ...saved, due: 'Planned_end' }, cols, 'T').baselineEnd, undefined);
  eq('a table with none of them is left alone', withPlanRoles(saved, cols.slice(0, 3), 'T'), saved);
  eq('another saved role (set to none on purpose) is not searched for again', withPlanRoles({ title: 'Task', start: 'Start' }, cols, 'T').end, undefined);
}

// ---- the words, in the three languages
{
  const { setLanguage } = await imp('src/i18n/index.js');
  const W = await imp('src/ui/planwords.js');
  const task = (s, e, bs, be, doneOn = null) => ({ start: day(s), end: day(e), baseStart: day(bs), baseEnd: day(be), doneOn });
  const later = task('2026-11-09', '2026-11-13', '2026-11-08', '2026-11-12');
  const later4 = task('2026-11-09', '2026-11-13', '2026-11-05', '2026-11-09');
  setLanguage('en', { remember: false });
  eq('en: one day, several days, earlier, start only, on plan', [W.slipText(later), W.slipText(later4), W.slipText(task('2026-11-02', '2026-11-04', '2026-11-02', '2026-11-06')), W.slipText(task('2026-11-04', '2026-11-06', '2026-11-02', '2026-11-06')), W.slipText(task('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06')), W.slipText({ start: 1, end: 2 })],
    ['1 day later than planned', '4 days later than planned', '2 days earlier than planned', 'Starts 2 days later than planned', 'On plan', null]);
  eq('en: the short forms (a task on plan says nothing)', [W.slipShortText(later4), W.slipShortText(task('2026-11-02', '2026-11-04', '2026-11-02', '2026-11-06')), W.slipShortText(task('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06'))], ['+4 d', '−2 d', null]);
  const fmt = (d) => 'day ' + d;
  eq('en: done on, after, before, the same day, none', [W.doneText(task('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06', day('2026-11-09')), fmt).replace(/\d+/g, 'N'), W.doneText(task('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06', day('2026-11-05')), fmt).replace(/\d+/g, 'N'), W.doneText(task('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06', day('2026-11-06')), fmt).replace(/\d+/g, 'N'), W.doneText({ doneOn: null }, fmt)],
    ['Done on day N, N days after its end', 'Done on day N, N day before its end', 'Done on day N', null]);
  setLanguage('de', { remember: false });
  eq('de', [W.slipText(later), W.slipText(later4), W.slipShortText(later4), W.slipText(task('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06'))], ['1 Tag später als geplant', '4 Tage später als geplant', '+4 T', 'Im Plan']);
  setLanguage('fr', { remember: false });
  eq('fr', [W.slipText(later), W.slipText(later4), W.slipShortText(later4), W.slipText(task('2026-11-02', '2026-11-06', '2026-11-02', '2026-11-06'))], ['1 jour plus tard que prévu', '4 jours plus tard que prévu', '+4 j', 'Conforme au plan']);
  setLanguage('en', { remember: false });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
