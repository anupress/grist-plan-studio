// What the settings panel decides: which view reads which column, which options sit on which view's tab, the
// plain sentence that says what the mapping will do, and how a search matches.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const M = await imp('src/model/settingsmap.js');
const { ROLES } = await imp('src/model/roles.js');
const { VIEWS } = await imp('src/model/settings.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// every role with a field in the panel says who reads it, and only views that exist
eq('every role in the panel has an entry', ROLES.filter((r) => r.panel).every((r) => r.id in M.ROLE_VIEWS), true);
eq('…and names real views', Object.keys(M.ROLE_VIEWS).every((r) => M.viewsOfRole(r).every((v) => VIEWS.includes(v))), true);
eq('the views the panel knows are the views there are', [...M.VIEW_IDS].sort(), [...VIEWS].sort());
eq('every role reaches at least one view', Object.keys(M.ROLE_VIEWS).every((r) => M.viewsOfRole(r).length > 0), true);
eq('the name and the dates matter everywhere', ['title', 'start', 'end', 'due', 'duration'].every((r) => VIEWS.every((v) => M.usedBy(r, v))), true);
eq('the board’s order column is for the board alone', VIEWS.filter((v) => M.usedBy('order', v)), ['board']);
eq('the booking grid’s resource is read by the booking grid and the timeline', VIEWS.filter((v) => M.usedBy('resource', v)).sort(), ['booking', 'timeline']);
eq('a dependency column is for the Gantt chart and the workload', VIEWS.filter((v) => M.usedBy('dependsOn', v)).sort(), ['gantt', 'workload']);

// groups
eq('the Gantt chart’s own tab: colours, how dates are read, working days', M.groupsFor('gantt').here, ['colours', 'dates', 'working']);
eq('…the rest are under more, in order', M.groupsFor('gantt').more, ['board', 'booking', 'workload', 'time', 'reminders', 'browser']);
eq('the board’s tab has the board’s options and the colours', M.groupsFor('board').here, ['board', 'colours']);
eq('a group is in one place only, for every view', VIEWS.every((v) => { const g = M.groupsFor(v); return g.here.every((x) => !g.more.includes(x)) && [...g.here, ...g.more].sort().join() === [...M.GROUP_ORDER].sort().join(); }), true);
eq('every view has a tab of its own', VIEWS.every((v) => M.groupsFor(v).here.length > 0), true);

// the sentence
const name = (id) => id.replace(/^c_/, '');
const L = (roles) => M.previewLines(roles, name).map((x) => x.key.replace(/\{(\w+)\}/g, (_, k) => x.vars?.[k] ?? '?'));
eq('nothing mapped: asks for the name first', L({}), ['Pick the column that names each task.']);
eq('a name, a start and an end', L({ title: 'c_Task', start: 'c_Start', end: 'c_End' }), ['Each task is named by “Task” and drawn from “Start” to “End”.']);
eq('a start and a due date: the due date is the end', L({ title: 'c_Task', start: 'c_Start', due: 'c_Due' }), ['Each task is named by “Task” and drawn from “Start” to “Due”.']);
eq('an end wins over a due date when both are there', L({ title: 'c_Task', start: 'c_Start', end: 'c_End', due: 'c_Due' }), ['Each task is named by “Task” and drawn from “Start” to “End”.']);
eq('a start and a duration', L({ title: 'c_Task', start: 'c_Start', duration: 'c_Days' }), ['Each task is named by “Task” and drawn from “Start” for as many days as “Days” says.']);
eq('a start alone: that day', L({ title: 'c_Task', start: 'c_Start' }), ['Each task is named by “Task” and drawn on the day in “Start”.']);
eq('a due date alone: a milestone or a bar ending there', L({ title: 'c_Task', due: 'c_Due' }), ['Each task is named by “Task” and shown on the day in “Due”: a milestone, or a bar ending there.']);
eq('no dates: says what still works', L({ title: 'c_Task' }), ['Each task is named by “Task”. With no start or due date it can’t be drawn on a timeline: the board and the agenda still list it.']);
eq('colours follow the colour column, else the status, else the project', [L({ title: 'c_T', colour: 'c_Col', status: 'c_S' })[1], L({ title: 'c_T', status: 'c_S', project: 'c_P' })[1], L({ title: 'c_T', project: 'c_P' })[1]], ['Colours follow “Col”.', 'Colours follow “S”.', 'Colours follow “P”.']);
eq('people', L({ title: 'c_T', assignee: 'c_Who' })[1], 'People come from “Who”.');
eq('a name that is not a column of the table is shown as it is', L({ title: 'Gone' })[0], 'Each task is named by “Gone”. With no start or due date it can’t be drawn on a timeline: the board and the agenda still list it.');
eq('count of what is mapped', M.mappedCount({ title: 'a', start: 'b', end: undefined, due: '' }), 2);

// every sentence the model can say is in the list, and in German and French with the same placeholders
const { DE } = await imp('src/i18n/de.js');
const { FR } = await imp('src/i18n/fr.js');
const everyRole = ['title', 'start', 'end', 'due', 'duration', 'colour', 'status', 'project', 'assignee'];
const said = new Set();
for (let mask = 0; mask < 1 << everyRole.length; mask++) {
  const roles = {};
  everyRole.forEach((r, i) => { if (mask & (1 << i)) roles[r] = 'c_' + r; });
  for (const l of M.previewLines(roles, name)) said.add(l.key);
}
eq('the sentences said for every mix of columns are all in the list', [...said].every((k) => M.PREVIEW_KEYS.includes(k)) && [...M.PREVIEW_KEYS].every((k) => said.has(k)), true);
const holes = (T) => M.PREVIEW_KEYS.filter((k) => { const v = T[k]; const ph = (x) => (x.match(/{w+}/g) || []).sort().join(); return !v || ph(v) !== ph(k); });
eq('every sentence is in German, with its placeholders', holes(DE), []);
eq('…and in French', holes(FR), []);

// search
const w = M.queryWords;
eq('words: capitals and accents off', w('  Fällig  DATUM '), ['fallig', 'datum']);
eq('an empty search matches everything', M.matchesQuery(w(''), 'anything'), true);
eq('a word starts a word', M.matchesQuery(w('hol'), 'Public holidays'), true);
eq('every word must be found', M.matchesQuery(w('public tag'), 'Public holidays'), false);
eq('…in any order', M.matchesQuery(w('holidays public'), 'Public holidays'), true);
eq('three letters may sit inside a word', M.matchesQuery(w('ays'), 'Public holidays'), true);
eq('two letters must start a word', M.matchesQuery(w('ys'), 'Public holidays'), false);
eq('accents do not matter: tâche finds Tache', M.matchesQuery(w('tâche'), 'Name of each tache'), true);
eq('German: wochen finds weeks start text', M.matchesQuery(w('wochen'), 'Wochen beginnen am Montag'), true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
