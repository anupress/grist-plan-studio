// What the settings panel decides without a screen (M13): which column roles matter to the view on show,
// which groups of options belong to which view, the plain sentence that says what the mapping will do, and
// how a search matches. Pure: tests/settingsmap.test.mjs.

import { norm } from './roles.js';

// ---- which view uses which column ----------------------------------------------------------------------------
const ALL = 'all';
/** The views that read each role. A role no view of the moment reads still has a field, in the "other views" part. */
export const ROLE_VIEWS = {
  title: ALL, start: ALL, end: ALL, due: ALL, duration: ALL, status: ALL, assignee: ALL, project: ALL,
  progress: ['gantt', 'timeline', 'board', 'calendar', 'agenda'],
  done: ['gantt', 'timeline', 'board', 'calendar', 'agenda', 'workload'],
  milestone: ['gantt', 'timeline', 'calendar', 'agenda'],
  colour: ['gantt', 'timeline', 'board', 'calendar'],
  parent: ['gantt', 'agenda', 'workload'],
  dependsOn: ['gantt', 'workload'],
  order: ['board'],
  resource: ['booking', 'timeline'],
  period: ['booking'],
  effort: ['workload'],
  baselineStart: ['gantt'], baselineEnd: ['gantt'], doneOn: ['gantt'],
};

/** The views that read a role, as a list of view ids ('all' resolved to every view). */
export const VIEW_IDS = ['gantt', 'timeline', 'board', 'calendar', 'booking', 'workload', 'agenda'];
export const viewsOfRole = (role) => (ROLE_VIEWS[role] === ALL ? VIEW_IDS : ROLE_VIEWS[role] || []);
/** True when the view on show reads this role. */
export const usedBy = (role, mode) => viewsOfRole(role).includes(mode);

// ---- which options belong to which view -----------------------------------------------------------------------
/** Every group of options, in the order the "more" part lists them. */
export const GROUP_ORDER = ['colours', 'dates', 'working', 'board', 'booking', 'workload', 'time', 'reminders', 'browser'];
/** The groups a view's own tab holds (the rest sit under "more"). */
export const VIEW_GROUPS = {
  gantt: ['colours', 'dates', 'working'],
  timeline: ['colours', 'dates', 'working'],
  calendar: ['colours', 'dates'],
  agenda: ['dates', 'reminders'],
  board: ['board', 'colours'],
  booking: ['booking'],
  workload: ['workload', 'working'],
};
/** @returns {{here: string[], more: string[]}} */
export function groupsFor(mode) {
  const here = VIEW_GROUPS[mode] || [];
  return { here, more: GROUP_ORDER.filter((g) => !here.includes(g)) };
}

// ---- the sentence ----------------------------------------------------------------------------------------------
/**
 * What the mapping will do, in plain words: whole sentences with {placeholders}, to be translated and filled
 * by the caller (t(key, vars)).
 * @param roles  role -> column id (unset roles absent or falsy)
 * @param name   column id -> the name to show
 * @returns {Array<{key: string, vars?: object}>}
 */
export function previewLines(roles, name) {
  const col = (r) => (roles[r] ? name(roles[r]) : null);
  const title = col('title'), start = col('start'), end = col('end'), due = col('due'), duration = col('duration');
  const out = [];
  if (!title) out.push({ key: 'Pick the column that names each task.' });
  else if (start && end) out.push({ key: 'Each task is named by “{name}” and drawn from “{start}” to “{end}”.', vars: { name: title, start, end } });
  else if (start && due) out.push({ key: 'Each task is named by “{name}” and drawn from “{start}” to “{end}”.', vars: { name: title, start, end: due } });
  else if (start && duration) out.push({ key: 'Each task is named by “{name}” and drawn from “{start}” for as many days as “{duration}” says.', vars: { name: title, start, duration } });
  else if (start) out.push({ key: 'Each task is named by “{name}” and drawn on the day in “{start}”.', vars: { name: title, start } });
  else if (due || end) out.push({ key: 'Each task is named by “{name}” and shown on the day in “{date}”: a milestone, or a bar ending there.', vars: { name: title, date: due || end } });
  else out.push({ key: 'Each task is named by “{name}”. With no start or due date it can’t be drawn on a timeline: the board and the agenda still list it.', vars: { name: title } });
  const colours = col('colour') || col('status') || col('project');
  if (colours) out.push({ key: 'Colours follow “{col}”.', vars: { col: colours } });
  const people = col('assignee');
  if (people) out.push({ key: 'People come from “{col}”.', vars: { col: people } });
  return out;
}

/** Every sentence previewLines can return (keys for t()): the translations are checked against this list. */
export const PREVIEW_KEYS = [
  'Pick the column that names each task.',
  'Each task is named by “{name}” and drawn from “{start}” to “{end}”.',
  'Each task is named by “{name}” and drawn from “{start}” for as many days as “{duration}” says.',
  'Each task is named by “{name}” and drawn on the day in “{start}”.',
  'Each task is named by “{name}” and shown on the day in “{date}”: a milestone, or a bar ending there.',
  'Each task is named by “{name}”. With no start or due date it can’t be drawn on a timeline: the board and the agenda still list it.',
  'Colours follow “{col}”.',
  'People come from “{col}”.',
];

/** How many roles have a column. */
export const mappedCount = (roles) => Object.values(roles).filter(Boolean).length;

// ---- search ------------------------------------------------------------------------------------------------------
/** The words of a query, accents and capitals off. */
export const queryWords = (q) => norm(q).split(' ').filter(Boolean);
/** True when every word of the query starts a word of the text (or sits inside one, from three letters). */
export function matchesQuery(words, text) {
  if (!words.length) return true;
  const hay = norm(text);
  const parts = hay.split(' ');
  return words.every((w) => parts.some((p) => p.startsWith(w)) || (w.length >= 3 && hay.includes(w)));
}
