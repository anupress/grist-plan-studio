// What each gesture writes. Every case here is a way a real table can be built: plain dates, an end
// that is a formula, a duration, only a due date, DateTime columns in a zone with daylight saving.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const E = await imp('src/model/edits.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { dayFromISO: day, isoFromDay: iso, dayOf } = await imp('src/model/values.js');
const { columnsFromFixture } = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const D = (s) => ['d', day(s) * 86400];
const secs = (s) => day(s) * 86400;
const setup = (spec, roles, extra = {}) => {
  const columns = columnsFromFixture(spec);
  return { columns, roles, settings: {}, editable: true, ...extra };
};
const taskOf = (row, ctx) => { const b = buildTasks([row], ctx); return b.tasks[0] || b.unscheduled[0]; };
const plan = (row, ctx, mode, a, b) => { const t = taskOf(row, ctx); return E.planDates(t, row, ctx, mode, day(a), day(b)); };

// ---- plain start and end ------------------------------------------------------------------------------
{
  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'E', type: 'Date' }], { title: 'T', start: 'S', end: 'E' });
  const row = { id: 1, T: 'a', S: D('2026-11-02'), E: D('2026-11-04') };
  eq('caps: everything', E.capabilities(taskOf(row, ctx), ctx), { move: true, start: true, end: true, draw: false });
  eq('move writes both, same length', plan(row, ctx, 'move', '2026-11-09', '2026-11-11').fields, { S: secs('2026-11-09'), E: secs('2026-11-11') });
  // a push or a levelling in working days: Mon–Wed moved to Thursday keeps three working days, Thu–Mon
  eq('move writes the end asked for, across a weekend', plan(row, ctx, 'move', '2026-11-05', '2026-11-09').fields, { S: secs('2026-11-05'), E: secs('2026-11-09') });
  eq('resize start', plan(row, ctx, 'start', '2026-11-01', '2026-11-04').fields, { S: secs('2026-11-01') });
  eq('resize end', plan(row, ctx, 'end', '2026-11-02', '2026-11-08').fields, { E: secs('2026-11-08') });
  eq('patch is the encoded cell', plan(row, ctx, 'end', '2026-11-02', '2026-11-08').patch, { E: ['d', secs('2026-11-08')] });
  eq('end before start is refused', plan(row, ctx, 'end', '2026-11-02', '2026-11-01'), { error: 'endBeforeStart' });
  const excl = { ...ctx, settings: { endInclusive: false } };
  const rowX = { id: 1, T: 'a', S: D('2026-11-02'), E: D('2026-11-05') };   // the day after the 4th
  eq('"end is the day after": the task still ends on the 4th', [iso(taskOf(rowX, excl).end)], ['2026-11-04']);
  eq('…and a resize writes the day after again', plan(rowX, excl, 'end', '2026-11-02', '2026-11-08').fields, { E: secs('2026-11-09') });
  eq('…a move shifts the stored day as it is', plan(rowX, excl, 'move', '2026-11-03', '2026-11-05').fields, { S: secs('2026-11-03'), E: secs('2026-11-06') });
  eq('…and across a weekend stores the day after the end asked for', plan(rowX, excl, 'move', '2026-11-05', '2026-11-09').fields, { S: secs('2026-11-05'), E: secs('2026-11-10') });
  eq('read-only widget: nothing', E.capabilities(taskOf(row, ctx), { ...ctx, editable: false }), { move: false, start: false, end: false, draw: false });
  eq('…and a plan is refused', E.planDates(taskOf(row, ctx), row, { ...ctx, editable: false }, 'move', 1, 2), { error: 'notAllowed' });
}

// ---- the end is a formula ----------------------------------------------------------------------------
{
  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'E', type: 'Date', isFormula: true }, { id: 'Days', type: 'Numeric' }],
    { title: 'T', start: 'S', end: 'E', duration: 'Days' });
  const row = { id: 1, T: 'a', S: D('2026-11-02'), E: D('2026-11-04'), Days: 3 };
  eq('caps: the start cannot move alone (the end would follow it)', E.capabilities(taskOf(row, ctx), ctx), { move: true, start: false, end: true, draw: false });
  eq('move writes only the start: the formula moves the end', plan(row, ctx, 'move', '2026-11-09', '2026-11-11').fields, { S: secs('2026-11-09') });
  eq('resizing the end writes the duration', plan(row, ctx, 'end', '2026-11-02', '2026-11-06').fields, { Days: 5 });
  const noDur = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'E', type: 'Date', isFormula: true }], { title: 'T', start: 'S', end: 'E' });
  eq('no duration column: the end cannot be dragged', E.capabilities(taskOf(row, noDur), noDur).end, false);
  const both = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date', isFormula: true }, { id: 'E', type: 'Date', isFormula: true }], { title: 'T', start: 'S', end: 'E' });
  eq('both formulas: read-only bar', E.capabilities(taskOf(row, both), both), { move: false, start: false, end: false, draw: false });
}

// ---- start and duration ---------------------------------------------------------------------------------
{
  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'Days', type: 'Int' }], { title: 'T', start: 'S', duration: 'Days' });
  const row = { id: 1, T: 'a', S: D('2026-11-02'), Days: 3 };
  eq('move: only the start', plan(row, ctx, 'move', '2026-11-05', '2026-11-07').fields, { S: secs('2026-11-05') });
  eq('resize start keeps the end: duration grows', plan(row, ctx, 'start', '2026-10-31', '2026-11-04').fields, { S: secs('2026-10-31'), Days: 5 });
  eq('resize end: duration', plan(row, ctx, 'end', '2026-11-02', '2026-11-03').fields, { Days: 2 });
}

// ---- start and due --------------------------------------------------------------------------------------
{
  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'Due', type: 'Date' }], { title: 'T', start: 'S', due: 'Due' });
  const row = { id: 1, T: 'a', S: D('2026-11-02'), Due: D('2026-11-06') };
  eq('move shifts the due date too', plan(row, ctx, 'move', '2026-11-03', '2026-11-07').fields, { S: secs('2026-11-03'), Due: secs('2026-11-07') });
  eq('resize end writes the due date', plan(row, ctx, 'end', '2026-11-02', '2026-11-10').fields, { Due: secs('2026-11-10') });
}

// ---- due date only (Grist's Project Management template) ------------------------------------------------
{
  const ctx = setup([{ id: 'Description', type: 'Text' }, { id: 'Due_Date', type: 'Date' }, { id: 'Start', type: 'Date' }], { title: 'Description', due: 'Due_Date', start: 'Start' });
  const row = { id: 1, Description: 'x', Due_Date: D('2026-11-20'), Start: null };
  const task = taskOf(row, ctx);
  eq('a due-date milestone can be moved, and given a start', E.capabilities(task, ctx), { move: true, start: true, end: false, draw: false });
  eq('moving it writes the due date', plan(row, ctx, 'move', '2026-11-23', '2026-11-23').fields, { Due_Date: secs('2026-11-23') });
  const noStart = setup([{ id: 'Description', type: 'Text' }, { id: 'Due_Date', type: 'Date' }], { title: 'Description', due: 'Due_Date' });
  eq('without a start column it can only move', E.capabilities(taskOf(row, noStart), noStart), { move: true, start: false, end: false, draw: false });
  const bars = { ...ctx, settings: { dueOnly: 'bar', defaultDays: 3 } };
  eq('as a bar: resizing the end moves the due date', plan(row, bars, 'end', '2026-11-18', '2026-11-25').fields, { Due_Date: secs('2026-11-25') });
}

// ---- milestones ---------------------------------------------------------------------------------------------
{
  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'E', type: 'Date' }, { id: 'M', type: 'Bool' }], { title: 'T', start: 'S', end: 'E', milestone: 'M' });
  const row = { id: 1, T: 'a', S: D('2026-11-02'), E: D('2026-11-02'), M: true };
  eq('a milestone only moves', E.capabilities(taskOf(row, ctx), ctx), { move: true, start: false, end: false, draw: false });
  eq('…and takes its end along', plan(row, ctx, 'move', '2026-11-05', '2026-11-05').fields, { S: secs('2026-11-05'), E: secs('2026-11-05') });
}

// ---- one-day tasks and drawing dates for tasks without any ------------------------------------------------
{
  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'E', type: 'Date' }], { title: 'T', start: 'S', end: 'E' });
  const oneDay = { id: 1, T: 'a', S: D('2026-11-02'), E: null };
  eq('a one-day task can be stretched into its empty end column', plan(oneDay, ctx, 'end', '2026-11-02', '2026-11-05').fields, { E: secs('2026-11-05') });
  const blank = { id: 2, T: 'b', S: null, E: null };
  eq('no dates: can be drawn', E.capabilities(taskOf(blank, ctx), ctx), { move: false, start: false, end: false, draw: true });
  eq('drawing writes start and end', plan(blank, ctx, 'draw', '2026-11-03', '2026-11-06').fields, { S: secs('2026-11-03'), E: secs('2026-11-06') });
  eq('a one-day draw writes only the start', plan(blank, ctx, 'draw', '2026-11-03', '2026-11-03').fields, { S: secs('2026-11-03') });
  const dueOnly = setup([{ id: 'T', type: 'Text' }, { id: 'Due', type: 'Date' }], { title: 'T', due: 'Due' });
  eq('only a due column: drawing writes the due date', plan({ id: 3, T: 'c', Due: null }, dueOnly, 'draw', '2026-11-03', '2026-11-06').fields, { Due: secs('2026-11-06') });
  const none = setup([{ id: 'T', type: 'Text' }, { id: 'Due', type: 'Date', isFormula: true }], { title: 'T', due: 'Due' });
  eq('only formula dates: nothing to draw', E.capabilities(taskOf({ id: 4, T: 'd', Due: null }, none), none).draw, false);
}

// ---- DateTime keeps its time of day, across a change of clocks --------------------------------------------
{
  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'DateTime:Europe/Berlin' }, { id: 'E', type: 'DateTime:Europe/Berlin' }], { title: 'T', start: 'S', end: 'E' });
  // 09:00 Berlin on Thu 22 Oct 2026 (summer time, UTC+2) -> 07:00 UTC
  const nine = Date.UTC(2026, 9, 22, 7, 0) / 1000;
  const row = { id: 1, T: 'meet', S: ['D', nine, 'Europe/Berlin'], E: ['D', nine + 3600, 'Europe/Berlin'] };
  const r = plan(row, ctx, 'move', '2026-10-29', '2026-10-29');
  // 29 Oct is after the clocks go back (UTC+1): 09:00 Berlin is 08:00 UTC.
  eq('a week later, still 09:00 in Berlin', r.fields.S, Date.UTC(2026, 9, 29, 8, 0) / 1000);
  eq('…and 10:00 for the end', r.fields.E, Date.UTC(2026, 9, 29, 9, 0) / 1000);
  eq('the patch keeps the zone', r.patch.S, ['D', Date.UTC(2026, 9, 29, 8, 0) / 1000, 'Europe/Berlin']);
  eq('a new DateTime day starts at midnight in its zone', E.encodeDay(day('2026-11-02'), ctx.columns[1], null)[0], Date.UTC(2026, 10, 1, 23, 0) / 1000);
  eq('and reads back as that day', iso(dayOf(E.encodeDay(day('2026-11-02'), ctx.columns[1], null)[1])), '2026-11-02');
}

// ---- quick edit values -------------------------------------------------------------------------------------
{
  const cols = Object.fromEntries(columnsFromFixture([
    { id: 'Ref', type: 'Ref:People' }, { id: 'RL', type: 'RefList:People' }, { id: 'CL', type: 'ChoiceList' },
    { id: 'N', type: 'Numeric' }, { id: 'I', type: 'Int' }, { id: 'B', type: 'Bool' }, { id: 'X', type: 'Text' }, { id: 'D', type: 'Date' },
  ]).map((c) => [c.id, c]));
  eq('Ref', E.encodeInput(cols.Ref, '3'), [3, ['R', 'People', 3]]);
  eq('empty Ref', E.encodeInput(cols.Ref, ''), [0, null]);
  eq('RefList', E.encodeInput(cols.RL, ['2', '4']), [['L', 2, 4], ['L', 2, 4]]);
  eq('empty RefList', E.encodeInput(cols.RL, []), [null, null]);
  eq('ChoiceList', E.encodeInput(cols.CL, ['a']), [['L', 'a'], ['L', 'a']]);
  eq('Numeric', E.encodeInput(cols.N, '0.5'), [0.5, 0.5]);
  eq('Int rounds', E.encodeInput(cols.I, '2.6'), [3, 3]);
  eq('empty number', E.encodeInput(cols.N, ''), [null, null]);
  eq('Bool', E.encodeInput(cols.B, true), [true, true]);
  eq('Text', E.encodeInput(cols.X, 'Hi'), ['Hi', 'Hi']);
  eq('Date', E.encodeInput(cols.D, day('2026-11-02')), [secs('2026-11-02'), ['d', secs('2026-11-02')]]);
  eq('cleared Date', E.encodeInput(cols.D, null), [null, null]);
}

// ---- Select-by prefill and new tasks ----------------------------------------------------------------------
{
  const cols = Object.fromEntries(columnsFromFixture([{ id: 'Project', type: 'Ref:Projects' }, { id: 'Who', type: 'RefList:People' }, { id: 'Kind', type: 'Choice' }]).map((c) => [c.id, c]));
  const rows = [{ id: 1, Project: ['R', 'Projects', 2], Who: ['L', 3, 4], Kind: 'A' }, { id: 2, Project: ['R', 'Projects', 2], Who: ['L', 4], Kind: 'A' }];
  eq('Ref link: the shared project', E.linkValue(rows, cols.Project)?.value, 2);
  eq('RefList link: the one shared person', E.linkValue(rows, cols.Who)?.value, ['L', 4]);
  eq('Choice link', E.linkValue(rows, cols.Kind)?.value, 'A');
  eq('no rows: unknown', E.linkValue([], cols.Project), null);
  eq('rows that disagree: unknown', E.linkValue([...rows, { id: 3, Project: ['R', 'Projects', 5] }], cols.Project), null);

  const ctx = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'Project', type: 'Ref:Projects' }], { title: 'T', start: 'S', project: 'Project' });
  const link = E.linkValue(rows, ctx.columns[2]);
  eq('a new task: name, start, and the link value', E.newTaskFields(ctx, { day: day('2026-11-02'), title: 'New task', link }).fields, { T: 'New task', S: secs('2026-11-02'), Project: 2 });
  const dueCtx = setup([{ id: 'T', type: 'Text' }, { id: 'Due', type: 'Date' }], { title: 'T', due: 'Due' });
  const whoCtx = setup([{ id: 'T', type: 'Text' }, { id: 'Due', type: 'Date' }, { id: 'Who', type: 'Ref:People' }, { id: 'Team', type: 'RefList:People' }, { id: 'Owner', type: 'Text' }], { title: 'T', due: 'Due', assignee: 'Who' });
  const col2 = (id) => whoCtx.columns.find((c) => c.id === id);
  eq('assigned to me: a Reference gets my row', E.newTaskFields(whoCtx, { day: day('2026-11-02'), title: 'x', assign: { col: col2('Who'), value: 3 } }).fields, { T: 'x', Due: secs('2026-11-02'), Who: 3 });
  eq('a list gets me as its one item', E.newTaskFields(whoCtx, { day: day('2026-11-02'), title: 'x', assign: { col: col2('Team'), value: [3] } }).fields.Team, ['L', 3]);
  eq('a text column gets my name', E.newTaskFields(whoCtx, { day: day('2026-11-02'), title: 'x', assign: { col: col2('Owner'), value: 'Ann' } }).fields.Owner, 'Ann');
  eq('the select-by link wins over the same column', E.newTaskFields(whoCtx, { day: day('2026-11-02'), title: 'x', link: { col: col2('Who'), value: 5, cell: ['R', 'People', 5] }, assign: { col: col2('Who'), value: 3 } }).fields.Who, 5);
  eq('nobody asked for: nothing about a person', 'Who' in E.newTaskFields(whoCtx, { day: day('2026-11-02'), title: 'x' }).fields, false);
  eq('a due-only table gets a due date', E.newTaskFields(dueCtx, { day: day('2026-11-02'), title: 'x' }).fields, { T: 'x', Due: secs('2026-11-02') });
}

// ---- working days and links (M3) -------------------------------------------------------------------
{
  const { makeCalendar } = await imp('src/model/calendar.js');
  const work = makeCalendar({ workdays: true });
  const ctx = { ...setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'Days', type: 'Int' }, { id: 'Dep', type: 'RefList:Tasks' }],
    { title: 'T', start: 'S', duration: 'Days', dependsOn: 'Dep' }), calendar: work };
  const row = { id: 1, T: 'a', S: D('2026-10-29'), Days: 3, Dep: ['L', 7] };
  const task = buildTasks([row], ctx).tasks[0];
  eq('3 working days from Thu 29 Oct end Mon 2 Nov', iso(task.end), '2026-11-02');
  eq('stretching to Wed 4 Nov writes 5 working days', E.planDates(task, row, ctx, 'end', task.start, day('2026-11-04')).fields, { Days: 5 });
  eq('links can be drawn', E.canLink(ctx), true);
  eq('link adds the predecessor', E.planLink(row, ctx, 9).fields, { Dep: ['L', 7, 9] });
  eq('an existing link is not added twice', E.planLink(row, ctx, 7), { error: 'already' });
  eq('unlink removes it', E.planUnlink(row, ctx, 7).fields, { Dep: null });
  const single = setup([{ id: 'T', type: 'Text' }, { id: 'S', type: 'Date' }, { id: 'After', type: 'Ref:Tasks' }], { title: 'T', start: 'S', dependsOn: 'After' });
  eq('a single Reference holds one predecessor: replaced', E.planLink({ id: 1, After: ['R', 'Tasks', 3] }, single, 9).fields, { After: 9 });
  const formula = setup([{ id: 'T', type: 'Text' }, { id: 'Dep', type: 'RefList:Tasks', isFormula: true }], { title: 'T', dependsOn: 'Dep' });
  eq('a formula column: no linking', E.canLink(formula), false);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
