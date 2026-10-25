// Time tracking (M10): the time-entries table, the timers in it, what each task has had against its
// plan, a week's timesheet, and CSV. Pure: tests/time.test.mjs.
//
// An entry is a row of the time-entries table: the task (a Reference to the task table), the person,
// the day, and either a start and an end (a timer) or just hours (time logged by hand). A timer that
// is running is an entry with a start and no end, so it survives a reload, a closed laptop and a
// second browser: the document holds it, not this page.
//
// An entry's hours: its Hours cell when that has a number above 0; else end − start; a running timer
// counts up to now. Grist puts 0 in a new row's Numeric cell, so 0 is read as "not typed". People are lane keys ('r:<id>' for a Reference, 'v:<text>' otherwise), as in the workload.

import { num, dayOf, refId, plain } from './values.js';
import { norm } from './roles.js';
import { freeName, colIdFor } from './templates.js';

export const TIME_PARTS = ['task', 'person', 'date', 'start', 'end', 'hours', 'note'];

const has = (c, words) => { const n = ` ${norm(c.id)} ${norm(c.label)} `; return words.some((w) => n.includes(` ${w} `)); };

/**
 * Which columns of a table hold an entry's parts, by type and name. Null when the table cannot hold
 * time entries for this task table: it needs a Reference to it, a day (a Date or a start), and hours
 * (a number, or a start and an end).
 * @returns {{task, person, date, start, end, hours, note} | null}  column ids, null for a part it lacks
 */
export function detectTimeColumns(columns, taskTable) {
  const task = columns.find((c) => c.kind === 'Ref' && c.refTable === taskTable);
  if (!task) return null;
  const nums = columns.filter((c) => c.kind === 'Numeric' || c.kind === 'Int');
  const hours = nums.find((c) => has(c, ['hours', 'hour', 'duration', 'time', 'spent', 'stunden', 'dauer', 'zeit', 'heures', 'duree', 'temps'])) || null;
  const stamps = columns.filter((c) => c.kind === 'DateTime');
  const start = stamps.find((c) => has(c, ['start', 'started', 'from', 'begin', 'beginn', 'von', 'debut'])) || stamps[0] || null;
  const end = stamps.find((c) => c !== start && has(c, ['end', 'ended', 'stop', 'stopped', 'to', 'until', 'ende', 'bis', 'fin'])) || stamps.find((c) => c !== start) || null;
  const date = columns.find((c) => c.kind === 'Date' && has(c, ['date', 'day', 'datum', 'tag', 'jour'])) || columns.find((c) => c.kind === 'Date') || null;
  if (!hours && !(start && end)) return null;
  if (!date && !start) return null;
  const others = columns.filter((c) => c !== task);
  const person = others.find((c) => ['Ref', 'Text', 'Choice'].includes(c.kind) && has(c, ['person', 'who', 'user', 'employee', 'member', 'owner', 'name',
    'mitarbeiter', 'mitarbeiterin', 'wer', 'personne', 'qui', 'utilisateur', 'employe', 'nom'])) || others.find((c) => c.kind === 'Ref') || null;
  const note = others.find((c) => c.kind === 'Text' && c !== person && has(c, ['note', 'notes', 'comment', 'description', 'what', 'notiz', 'kommentar',
    'beschreibung', 'taetigkeit', 'tatigkeit', 'remarque', 'commentaire'])) || null;
  return { task: task.id, person: person?.id ?? null, date: date?.id ?? null, start: start?.id ?? null, end: end?.id ?? null, hours: hours?.id ?? null, note: note?.id ?? null };
}

/** Of several tables ([{id, columns}]), the one that holds time entries for this task table: a telling name first. */
export function findTimeTable(tables, taskTable) {
  const named = (id) => /time|zeit|temps|timesheet|stunden|heures/i.test(id);
  const fits = tables.filter((tb) => tb.id !== taskTable).map((tb) => ({ id: tb.id, cols: detectTimeColumns(tb.columns, taskTable) })).filter((x) => x.cols);
  return fits.find((x) => named(x.id)) || fits[0] || null;
}

const secsOf = (cell) => {
  if (Array.isArray(cell)) return (cell[0] === 'D' || cell[0] === 'd') && typeof cell[1] === 'number' ? cell[1] : null;
  return typeof cell === 'number' && isFinite(cell) ? cell : null;
};
/** The day a moment falls on in a time zone (the document's), as a day number. */
export function dayInZone(secs, zone) {
  try {
    const s = new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(secs * 1000));
    return Math.round(Date.parse(s + 'T00:00:00Z') / 864e5);
  } catch { return Math.floor(secs / 86400); }
}

/**
 * Rows of the time-entries table -> entries.
 * @param ctx {cols: from detectTimeColumns, columns (of the time table), now: epoch seconds, zone}
 * @returns {Array<{id, task, person, day, start, end, hours, note, running}>}
 */
export function readEntries(rows, { cols, columns, now, zone = 'UTC' }) {
  const col = (part) => (cols[part] ? columns.find((c) => c.id === cols[part]) || null : null);
  const personCol = col('person'), dateCol = col('date');
  const out = [];
  for (const r of rows) {
    const task = refId(r[cols.task]);
    if (!task) continue;
    const start = cols.start ? secsOf(r[cols.start]) : null;
    const end = cols.end ? secsOf(r[cols.end]) : null;
    const cell = cols.hours ? num(r[cols.hours]) : null;
    const typed = cell > 0 ? cell : null;
    const running = start != null && end == null && typed == null;
    let hours = typed;
    if (hours == null && start != null && end != null) hours = Math.max(0, (end - start) / 3600);
    if (running) hours = Math.max(0, (now - start) / 3600);
    let day = dateCol ? dayOf(r[dateCol.id], dateCol.type) : null;
    if (day == null && start != null) day = dayInZone(start, zone);
    let person = null;
    if (personCol) {
      const v = r[personCol.id];
      if (personCol.kind === 'Ref') { const id = refId(v); person = id ? 'r:' + id : null; } else { const p = plain(v); person = p == null || p === '' ? null : 'v:' + String(p); }
    }
    out.push({ id: r.id, task, person, day, start, end, hours: hours ?? 0, note: cols.note ? String(plain(r[cols.note]) ?? '') : '', running });
  }
  return out;
}

/** Hours per task, running timers included. */
export function loggedByTask(entries) {
  const out = new Map();
  for (const e of entries) out.set(e.task, (out.get(e.task) || 0) + e.hours);
  return out;
}

/** This person's running timer (the latest, if a crash left two). */
export const runningOf = (entries, person) => entries.filter((e) => e.running && e.person === person).sort((a, b) => b.start - a.start)[0] || null;

const round2 = (h) => Math.round(h * 100) / 100;

/** What a person cell gets for a person key: a row id for a Reference, the text otherwise. */
function personValue(personCol, key) {
  if (!personCol || !key) return null;
  if (personCol.kind === 'Ref') return key.startsWith('r:') ? Number(key.slice(2)) : null;
  return key.startsWith('v:') ? key.slice(2) : null;
}
const encodedPerson = (personCol, v) => (personCol?.kind === 'Ref' && v ? ['R', personCol.refTable, v] : v);

/**
 * Start a timer on a task: a new entry with the day and the start, and the person's running timer
 * stopped in the same action, so switching tasks is one undo.
 * @returns {{add: {fields, patch}, stop: {id, fields, patch} | null}}
 */
export function planStart({ taskId, person, now, today, cols, columns, running = null }) {
  const personCol = cols.person ? columns.find((c) => c.id === cols.person) : null;
  const fields = { [cols.task]: taskId }, patch = { [cols.task]: ['R', columns.find((c) => c.id === cols.task)?.refTable, taskId] };
  const pv = personValue(personCol, person);
  if (personCol && pv != null) { fields[personCol.id] = pv; patch[personCol.id] = encodedPerson(personCol, pv); }
  if (cols.date) { fields[cols.date] = today * 86400; patch[cols.date] = ['d', today * 86400]; }
  if (cols.start) { fields[cols.start] = now; patch[cols.start] = now; }
  return { add: { fields, patch }, stop: running ? planStop(running, { now, cols }) : null };
}

/** Stop a running timer: its end, and its hours when the table has an Hours column. */
export function planStop(entry, { now, cols }) {
  // Started and stopped within a minute: a slip, not work. The entry goes, and nothing is logged.
  if (now - entry.start < 60) return { id: entry.id, remove: true };
  const fields = {}, patch = {};
  if (cols.end) { fields[cols.end] = now; patch[cols.end] = now; }
  if (cols.hours) { const h = round2(Math.max(0, (now - entry.start) / 3600)); fields[cols.hours] = h; patch[cols.hours] = h; }
  return { id: entry.id, fields, patch };
}

/** Time logged by hand: hours on a day, without a start or an end. Needs an Hours column. */
export function planLog({ taskId, person, day, hours, note = '', cols, columns }) {
  if (!cols.hours) return { error: 'noHours' };
  const personCol = cols.person ? columns.find((c) => c.id === cols.person) : null;
  const fields = { [cols.task]: taskId, [cols.hours]: round2(hours) };
  const patch = { [cols.task]: ['R', columns.find((c) => c.id === cols.task)?.refTable, taskId], [cols.hours]: round2(hours) };
  const pv = personValue(personCol, person);
  if (personCol && pv != null) { fields[personCol.id] = pv; patch[personCol.id] = encodedPerson(personCol, pv); }
  if (cols.date) { fields[cols.date] = day * 86400; patch[cols.date] = ['d', day * 86400]; }
  else if (cols.start) { fields[cols.start] = day * 86400 + 9 * 3600; patch[cols.start] = day * 86400 + 9 * 3600; }
  if (cols.note && note) { fields[cols.note] = note; patch[cols.note] = note; }
  return { fields, patch };
}

/**
 * One person's week (or everyone's, person null): a row per task with hours on each of the seven days.
 * @returns {{days: number[], rows: Array<{task, hours: number[], total}>, totals: number[], total}}
 */
export function timesheet(entries, { from, person = null }) {
  const days = Array.from({ length: 7 }, (_, i) => from + i);
  const byTask = new Map();
  for (const e of entries) {
    if (e.day == null || e.day < from || e.day > from + 6) continue;
    if (person && e.person !== person) continue;
    if (!byTask.has(e.task)) byTask.set(e.task, { task: e.task, hours: days.map(() => 0), total: 0 });
    const row = byTask.get(e.task);
    row.hours[e.day - from] += e.hours;
    row.total += e.hours;
  }
  const rows = [...byTask.values()];
  const totals = days.map((_, i) => rows.reduce((s, r) => s + r.hours[i], 0));
  return { days, rows, totals, total: totals.reduce((a, b) => a + b, 0) };
}

// ---- setting it up ---------------------------------------------------------------------------------

/**
 * A new time-entries table, asked for first: Task (a Reference to the task table), Person (a Reference
 * to the people table when the tasks have one, else text), Date, Started and Stopped (in the
 * document's time zone), Hours and Note. Names in the interface language.
 * @returns {{name, cols, actions}}  the AddTable, and the column ids as detectTimeColumns would give them
 */
export function timeTableSetup(t, { taskTable, peopleTable = null, tables = [], zone = 'UTC' }) {
  const name = freeName(colIdFor(t('Time entries')), tables);
  const id = (label) => colIdFor(t(label));
  const cols = { task: id('Task'), person: id('Person'), date: id('Date'), start: id('Started'), end: id('Stopped'), hours: id('Hours'), note: id('Note') };
  const columns = [
    { id: cols.task, type: 'Ref:' + taskTable, label: t('Task') },
    { id: cols.person, type: peopleTable ? 'Ref:' + peopleTable : 'Text', label: t('Person') },
    { id: cols.date, type: 'Date', label: t('Date') },
    { id: cols.start, type: 'DateTime:' + zone, label: t('Started') },
    { id: cols.end, type: 'DateTime:' + zone, label: t('Stopped') },
    { id: cols.hours, type: 'Numeric', label: t('Hours'), widgetOptions: JSON.stringify({ decimals: 2, maxDecimals: 2 }) },
    { id: cols.note, type: 'Text', label: t('Note') },
  ];
  return { name, cols, actions: [['AddTable', name, columns.map((c) => ({ id: c.id, type: c.type, label: c.label, ...(c.widgetOptions ? { widgetOptions: c.widgetOptions } : {}) }))]] };
}

/**
 * The second step: the Task column shows the task's name, and Person the person's, once Grist has
 * given the new columns their refs.
 * @param meta {colRef(tableId, colId) -> ref | null}
 */
export function timeTableShowActions({ name, cols, taskTable, taskTitle, peopleTable = null, peopleShow = null }, meta) {
  const out = [];
  const show = (colId, target, shown) => {
    const shownRef = shown && meta.colRef(target, shown), colRef = meta.colRef(name, colId);
    if (!shownRef || !colRef) return;
    out.push(['ModifyColumn', name, colId, { visibleCol: shownRef }], ['SetDisplayFormula', name, null, colRef, `$${colId}.${shown}`]);
  };
  show(cols.task, taskTable, taskTitle);
  if (peopleTable) show(cols.person, peopleTable, peopleShow);
  return out;
}

/**
 * CSV a spreadsheet opens as it should: a semicolon and decimal commas where the language writes
 * 7,5 (Excel in German or French expects that), a comma elsewhere; quotes where a cell needs them;
 * a byte-order mark so accents survive.
 */
export function toCsv(rows, locale = 'en') {
  const decimal = new Intl.NumberFormat(locale).format(1.5).includes(',') ? ',' : '.';
  const sep = decimal === ',' ? ';' : ',';
  const cell = (v) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', decimal) : String(v);
    return /["\r\n]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}
