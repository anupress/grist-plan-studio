// Time tracking: finding a time-entries table, reading entries (typed hours, start and end, a running
// timer), starting and stopping (one action each, the running one stopped with the next), logging by
// hand, a week's timesheet, CSV, and the table a set-up creates.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { search: '' };
const T = await imp('src/model/time.js');
const I = await imp('src/i18n/index.js');
const { columnsFromFixture } = await imp('src/model/schema.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---- finding the table ------------------------------------------------------------------------------
const ours = columnsFromFixture([
  { id: 'Task', type: 'Ref:Tasks' }, { id: 'Person', type: 'Ref:People' }, { id: 'Date', type: 'Date' },
  { id: 'Started', type: 'DateTime:Europe/Berlin' }, { id: 'Stopped', type: 'DateTime:Europe/Berlin' }, { id: 'Hours', type: 'Numeric' }, { id: 'Note', type: 'Text' },
]);
eq('our own table: every part', T.detectTimeColumns(ours, 'Tasks'), { task: 'Task', person: 'Person', date: 'Date', start: 'Started', end: 'Stopped', hours: 'Hours', note: 'Note' });
const german = columnsFromFixture([{ id: 'Aufgabe', type: 'Ref:Aufgaben' }, { id: 'Mitarbeiter', type: 'Text' }, { id: 'Datum', type: 'Date' }, { id: 'Stunden', type: 'Numeric' }, { id: 'Taetigkeit', type: 'Text' }]);
eq('a hand-made German one: date and hours, no timer columns', T.detectTimeColumns(german, 'Aufgaben'), { task: 'Aufgabe', person: 'Mitarbeiter', date: 'Datum', start: null, end: null, hours: 'Stunden', note: 'Taetigkeit' });
eq('a table without a Reference to the tasks is not one', T.detectTimeColumns(ours, 'Projects'), null);
eq('nor one without hours or a start and an end', T.detectTimeColumns(columnsFromFixture([{ id: 'Task', type: 'Ref:Tasks' }, { id: 'Date', type: 'Date' }]), 'Tasks'), null);
eq('of several tables, the one whose name says time',
  T.findTimeTable([{ id: 'Comments', columns: columnsFromFixture([{ id: 'Task', type: 'Ref:Tasks' }, { id: 'Date', type: 'Date' }, { id: 'Minutes', type: 'Numeric', label: 'Time' }]) }, { id: 'Time_entries', columns: ours }], 'Tasks')?.id, 'Time_entries');

// ---- reading entries ------------------------------------------------------------------------------
const cols = T.detectTimeColumns(ours, 'Tasks');
const D = (iso) => ['d', day(iso) * 86400];
const at = (iso, hhmm) => Date.parse(`${iso}T${hhmm}:00Z`) / 1000;   // UTC moments
const NOW = at('2026-11-04', '15:00');
const rows = [
  { id: 1, Task: ['R', 'Tasks', 7], Person: ['R', 'People', 1], Date: D('2026-11-02'), Started: null, Stopped: null, Hours: 3.5, Note: 'by hand' },
  { id: 2, Task: ['R', 'Tasks', 7], Person: ['R', 'People', 1], Date: D('2026-11-03'), Started: ['D', at('2026-11-03', '08:00'), 'UTC'], Stopped: ['D', at('2026-11-03', '10:30'), 'UTC'], Hours: null, Note: '' },
  { id: 3, Task: ['R', 'Tasks', 9], Person: ['R', 'People', 2], Date: D('2026-11-04'), Started: ['D', at('2026-11-04', '13:00'), 'UTC'], Stopped: null, Hours: null, Note: '' },
  { id: 4, Task: ['R', 'Tasks', 9], Person: ['R', 'People', 1], Date: null, Started: ['D', at('2026-11-04', '23:30'), 'UTC'], Stopped: ['D', at('2026-11-05', '00:30'), 'UTC'], Hours: 1, Note: '' },
  { id: 5, Task: ['R', 'Tasks', 0], Person: null, Date: D('2026-11-04'), Hours: 2 },
];
const entries = T.readEntries(rows, { cols, columns: ours, now: NOW, zone: 'Europe/Berlin' });
eq('an entry without a task is left out', entries.length, 4);
eq('typed hours, start to end, and a running timer up to now', entries.map((e) => [e.id, e.hours, e.running]), [[1, 3.5, false], [2, 2.5, false], [3, 2, true], [4, 1, false]]);
eq('no Date: the day of its start in the document’s zone (23:30 UTC is 00:30 in Berlin)', entries.find((e) => e.id === 4).day, day('2026-11-05'));
eq('people as lane keys', entries.map((e) => e.person), ['r:1', 'r:1', 'r:2', 'r:1']);
eq('hours per task', [...T.loggedByTask(entries)], [[7, 6], [9, 3]]);
eq('Ben’s running timer', T.runningOf(entries, 'r:2')?.id, 3);
eq('Ann has none running', T.runningOf(entries, 'r:1'), null);

// ---- writing ------------------------------------------------------------------------------------
const today = day('2026-11-04');
const start = T.planStart({ taskId: 12, person: 'r:2', now: NOW, today, cols, columns: ours, running: T.runningOf(entries, 'r:2') });
eq('a timer starts with the task, the person, the day and now', start.add.fields, { Task: 12, Person: 2, Date: today * 86400, Started: NOW });
eq('…and stops the one running, in the same action: its end and its hours', start.stop, { id: 3, fields: { Stopped: NOW, Hours: 2 }, patch: { Stopped: NOW, Hours: 2 } });
eq('with nothing running, nothing to stop', T.planStart({ taskId: 12, person: 'r:1', now: NOW, today, cols, columns: ours }).stop, null);
eq('a new timer within a minute of the last one takes that one away', T.planStart({ taskId: 4, person: 'r:2', now: NOW, today: 20000, cols, columns: ours, running: { id: 9, start: NOW - 30 } }).stop, { id: 9, remove: true });
{
  // Grist fills a new row's Numeric cell with 0: a timer with Hours 0 still runs, and a stopped one counts end − start.
  const z = T.readEntries([{ id: 1, Task: ['R', 'Tasks', 3], Person: ['R', 'People', 2], Date: null, Started: NOW - 1800, Stopped: null, Hours: 0, Note: '' },
    { id: 2, Task: ['R', 'Tasks', 3], Person: ['R', 'People', 2], Date: null, Started: NOW - 9000, Stopped: NOW - 5400, Hours: 0, Note: '' }], { cols, columns: ours, now: NOW });
  eq('Hours 0 and no end: running', [z[0].running, z[0].hours], [true, 0.5]);
  eq('Hours 0 with a start and an end: end − start', [z[1].running, z[1].hours], [false, 1]);
}
eq('stopping within a minute removes the entry', T.planStop({ id: 9, start: NOW - 40 }, { now: NOW, cols }), { id: 9, remove: true });
eq('stopping 1 h 20 min writes 1.33 h', T.planStop({ id: 9, start: NOW - 4800 }, { now: NOW, cols }).fields, { Stopped: NOW, Hours: 1.33 });
eq('time by hand: hours on a day, with a note', T.planLog({ taskId: 7, person: 'r:1', day: today, hours: 1.5, note: 'review', cols, columns: ours }).fields,
  { Task: 7, Hours: 1.5, Person: 1, Date: today * 86400, Note: 'review' });
const textPeople = columnsFromFixture([{ id: 'Task', type: 'Ref:Tasks' }, { id: 'Who', type: 'Text' }, { id: 'Day', type: 'Date' }, { id: 'Hours', type: 'Numeric' }]);
const tc = T.detectTimeColumns(textPeople, 'Tasks');
eq('a text Person column gets the name', T.planLog({ taskId: 7, person: 'v:Chloé', day: today, hours: 2, cols: tc, columns: textPeople }).fields, { Task: 7, Hours: 2, Who: 'Chloé', Day: today * 86400 });
eq('a table with only start and end cannot take hours by hand', T.planLog({ taskId: 7, person: 'r:1', day: today, hours: 2, cols: { ...cols, hours: null }, columns: ours }), { error: 'noHours' });

// ---- the timesheet ------------------------------------------------------------------------------
const mon = day('2026-11-02');
const ann = T.timesheet(entries, { from: mon, person: 'r:1' });
eq('Ann’s week: a row per task, hours on each day', ann.rows.map((r) => [r.task, r.hours, r.total]), [[7, [3.5, 2.5, 0, 0, 0, 0, 0], 6], [9, [0, 0, 0, 1, 0, 0, 0], 1]]);
eq('…day totals and the week', [ann.totals, ann.total], [[3.5, 2.5, 0, 1, 0, 0, 0], 7]);
eq('everyone’s week includes Ben’s running timer', T.timesheet(entries, { from: mon }).total, 9);
eq('a week with nothing', T.timesheet(entries, { from: mon + 7, person: 'r:1' }).rows.length, 0);

// ---- CSV ---------------------------------------------------------------------------------------------
eq('English: commas, a decimal point, quotes where needed', T.toCsv([['Task', 'Hours'], ['Copywriting, part 2', 1.5], ['Say "hi"', 2]], 'en'),
  '﻿Task,Hours\r\n"Copywriting, part 2",1.5\r\n"Say ""hi""",2\r\n');
eq('German: semicolons and a decimal comma', T.toCsv([['Aufgabe', 'Stunden'], ['Texte', 7.25]], 'de'), '﻿Aufgabe;Stunden\r\nTexte;7,25\r\n');

// ---- set-up ----------------------------------------------------------------------------------------
I.setLanguage('en', { remember: false });
const setup = T.timeTableSetup(I.t, { taskTable: 'Tasks', peopleTable: 'People', tables: ['Tasks', 'People', 'Time_entries'], zone: 'Europe/Berlin' });
eq('a free name, and the columns', [setup.name, setup.actions[0][2].map((c) => c.id + ':' + c.type)], ['Time_entries2',
  ['Task:Ref:Tasks', 'Person:Ref:People', 'Date:Date', 'Started:DateTime:Europe/Berlin', 'Stopped:DateTime:Europe/Berlin', 'Hours:Numeric', 'Note:Text']]);
eq('what it makes is found again', T.detectTimeColumns(columnsFromFixture(setup.actions[0][2].map((c) => ({ id: c.id, type: c.type, label: c.label }))), 'Tasks'), setup.cols);
const refs = { 'Time_entries2.Task': 81, 'Tasks.Task': 11, 'Time_entries2.Person': 82, 'People.Name': 21 };
eq('then Task shows the task and Person the person', T.timeTableShowActions({ ...setup, taskTable: 'Tasks', taskTitle: 'Task', peopleTable: 'People', peopleShow: 'Name' }, { colRef: (tb, c) => refs[tb + '.' + c] || null }), [
  ['ModifyColumn', 'Time_entries2', 'Task', { visibleCol: 11 }], ['SetDisplayFormula', 'Time_entries2', null, 81, '$Task.Task'],
  ['ModifyColumn', 'Time_entries2', 'Person', { visibleCol: 21 }], ['SetDisplayFormula', 'Time_entries2', null, 82, '$Person.Name'],
]);
for (const lang of ['de', 'fr']) {
  I.setLanguage(lang, { remember: false });
  const s = T.timeTableSetup(I.t, { taskTable: 'Aufgaben', peopleTable: null, tables: [], zone: 'Europe/Paris' });
  eq(`${lang}: what it makes is found again`, T.detectTimeColumns(columnsFromFixture(s.actions[0][2].map((c) => ({ id: c.id, type: c.type, label: c.label }))), 'Aufgaben'), s.cols);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
