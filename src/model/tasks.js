// Rows + roles -> tasks: the one shape every view draws from.
//
// A task's dates are day numbers (values.js) and its end is INCLUSIVE: a task from the 3rd to the
// 5th fills three days, because that is how people type it. The rules for odd rows:
//
//   start and end            a bar
//   start and due, no end    a bar ending on the due date (TaskFlow, many hand-made tables)
//   start and a duration     a bar of that many days
//   start only               a one-day bar
//   due only                 a milestone on the due date, or a bar of defaultDays ending on it
//   milestone ticked         a milestone on the start (or due) date
//   no date at all           unscheduled: counted, not drawn
//   end before start         drawn as one day at the start, and flagged
//
// Pure: tested in tests/tasks.test.mjs.

import { dayOf, refId, listOf, plain, num, progressScale } from './values.js';
import { makeCalendar } from './calendar.js';
import { getPalette } from '../core/theme/palettes.js';

// Colours handed out to values without one of their own: the shared core's colour-blind-safe set,
// so a bar coloured by owner or project stays tellable apart for every viewer.
export const PALETTE = getPalette('access').series;

const isHex = (s) => typeof s === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());

// A status that means finished, in English, German and French.
const DONE_WORDS = /^(done|complete|completed|closed|finished|shipped|resolved|erledigt|fertig|abgeschlossen|geschlossen|termine|terminee|fait|clos|cloture)$/;
export const isDoneStatus = (s) => DONE_WORDS.test(String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase());

/** Grist's default choice fill is white or unset: treat both as "no colour chosen". */
function choiceFill(col, value) {
  const f = col?.choiceOptions?.[value]?.fillColor;
  return isHex(f) && !/^#f{3}(?:f{3})?$/i.test(f) ? f : null;
}

// autoColour: hand out palette colours to statuses and projects that have none (off in the booking grid,
// where a colour that tells nothing apart is only noise)
export const DEFAULT_SETTINGS = Object.freeze({ endInclusive: true, dueOnly: 'milestone', defaultDays: 1, colourBy: null, groupBy: null, autoColour: true });
const PLAIN = makeCalendar();

/**
 * @param {Array<object>} rows     task rows as Grist sends them (encoded)
 * @param {{roles: object, columns: Array, labels?: Object<string, Map>, settings?: object, calendar?: object}} ctx
 *   labels: per Reference column id, rowId -> display text (built from the referenced table)
 *   settings.colourBy / settings.groupBy: a column id (any column) or null
 *   calendar: model/calendar.js; with working days on, a duration counts working days
 * @returns {{tasks: Array, unscheduled: Array, flagged: number}}
 */
export function buildTasks(rows, { roles, columns, labels = {}, settings = {}, calendar = PLAIN }) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const byId = (id) => (id ? columns.find((c) => c.id === id) || null : null);
  const col = (role) => byId(roles[role]);
  const C = Object.fromEntries(['title', 'start', 'end', 'due', 'duration', 'status', 'progress', 'done', 'milestone',
    'assignee', 'project', 'colour', 'parent', 'dependsOn'].map((r) => [r, col(r)]));
  const colourBy = byId(S.colourBy);
  const groupBy = byId(S.groupBy);
  const cell = (row, role) => (C[role] ? row[C[role].id] : undefined);
  const label = (c, id) => (id == null ? null : labels[c.id]?.get(id) ?? `${c.refTable}[${id}]`);

  // One word per value of a column, for the cases that need text: a Reference shows its label.
  const textOf = (row, c, firstOnly = false) => {
    if (!c) return null;
    const v = row[c.id];
    if (c.kind === 'Ref') return label(c, refId(v));
    if (c.kind === 'RefList' || c.kind === 'ChoiceList') {
      const items = listOf(v).map((x) => (c.kind === 'RefList' ? label(c, x) : String(x)));
      return (firstOnly ? items.slice(0, 1) : items).join(', ') || null;
    }
    const p = plain(v);
    if (p == null || p === '') return null;
    if (typeof p === 'boolean') return p ? '✓' : '✗';
    return String(p);
  };
  const text = (row, role) => textOf(row, C[role]);
  const people = (row) => {
    const c = C.assignee;
    if (!c) return [];
    const v = row[c.id];
    if (c.kind === 'Ref') { const id = refId(v); return id ? [label(c, id)] : []; }
    if (c.kind === 'RefList') return listOf(v).map((id) => label(c, id));
    if (c.kind === 'ChoiceList') return listOf(v).map(String);
    const p = plain(v);
    return p == null || p === '' ? [] : [String(p)];
  };

  const scale = C.progress ? progressScale(rows.map((r) => num(r[C.progress.id]))) : 1;
  // A colour per status (or project) value that has no colour of its own, stable within a load.
  const auto = new Map();
  const autoColour = (key) => {
    if (key == null || !S.autoColour) return null;
    if (!auto.has(key)) auto.set(key, PALETTE[auto.size % PALETTE.length]);
    return auto.get(key);
  };

  const tasks = [];
  const unscheduled = [];
  let flagged = 0;
  for (const row of rows) {
    const start = C.start ? dayOf(cell(row, 'start'), C.start.type) : null;
    let end = C.end ? dayOf(cell(row, 'end'), C.end.type) : null;
    const due = C.due ? dayOf(cell(row, 'due'), C.due.type) : null;
    if (end != null && !S.endInclusive) end -= 1;
    const dur = C.duration ? num(cell(row, 'duration')) : null;
    const isMilestone = C.milestone ? plain(cell(row, 'milestone')) === true : false;

    const statusKey = text(row, 'status');
    const statusFill = C.status && C.status.kind === 'Choice' ? choiceFill(C.status, statusKey) : null;
    const projectKey = text(row, 'project');
    let colour = null;
    if (C.colour) { const v = text(row, 'colour'); colour = C.colour.kind === 'Choice' ? choiceFill(C.colour, v) || autoColour('c:' + v) : (isHex(v) ? v.trim() : null); }
    if (!colour && colourBy) {
      // "Colour bars by" a column: its own choice colours where it has them, otherwise one per value
      const v = textOf(row, colourBy, true);
      colour = v == null ? null : (colourBy.kind === 'Choice' || colourBy.kind === 'ChoiceList' ? choiceFill(colourBy, v) : null) || autoColour('b:' + v);
    }
    if (!colourBy) colour = colour || statusFill || (statusKey != null ? autoColour('s:' + statusKey) : null) || (projectKey != null ? autoColour('p:' + projectKey) : null);

    const done = C.done ? plain(cell(row, 'done')) === true : false;
    let progress = C.progress ? num(cell(row, 'progress')) : null;
    if (progress != null) progress = Math.max(0, Math.min(1, progress / scale));
    if (done) progress = 1;

    const t = {
      id: row.id,
      index: tasks.length + unscheduled.length,
      parentId: C.parent ? refId(cell(row, 'parent')) : null,
      deps: C.dependsOn ? listOf(cell(row, 'dependsOn')).filter((x) => typeof x === 'number' && x > 0) : [],
      group: groupBy ? textOf(row, groupBy, true) : null,
      title: text(row, 'title') || '',
      start: null, end: null, kind: 'bar', fromDue: false, flag: null,
      // Which column the end came from, so an edit knows what to write: 'end' | 'due' | 'duration' | 'start'
      endFrom: null,
      status: statusKey, project: projectKey, people: people(row), colour, progress, done,
      // finished by any sign the table gives: Done ticked, full progress, or a status such as Done or Erledigt
      finished: done || (progress != null && progress >= 1) || isDoneStatus(statusKey),
    };

    if (start != null) {
      t.start = start;
      if (isMilestone) { t.end = start; t.kind = 'milestone'; t.endFrom = 'start'; }
      else {
        t.endFrom = end != null ? 'end' : due != null ? 'due' : dur != null && dur > 0 ? 'duration' : 'start';
        let e = end ?? due ?? (dur != null && dur > 0 ? calendar.endAfter(start, Math.round(dur)) : start);
        if (e < start) { t.flag = 'endBeforeStart'; e = start; flagged++; }
        t.end = e;
      }
    } else if (due != null || end != null) {
      const at = due ?? end;
      t.fromDue = true;
      t.endFrom = due != null ? 'due' : 'end';
      if (S.dueOnly === 'bar' && !isMilestone) { t.start = at - Math.max(1, S.defaultDays) + 1; t.end = at; }
      else { t.start = at; t.end = at; t.kind = 'milestone'; }
    } else {
      unscheduled.push(t);
      continue;
    }
    // What a redraw compares: the drawn facts of this task, nothing else.
    t.hash = [t.title, t.start, t.end, t.kind, t.flag, t.status, t.project, t.colour, t.progress, t.people.join('|'),
      t.parentId, t.deps.join(','), t.group].join('\u0001');
    tasks.push(t);
  }
  return { tasks, unscheduled, flagged };
}

/** The first and last day any task touches (null when there are none). */
export function spanOf(tasks) {
  if (!tasks.length) return null;
  let from = Infinity, to = -Infinity;
  for (const t of tasks) { if (t.start < from) from = t.start; if (t.end > to) to = t.end; }
  return { from, to };
}
