// Plan Studio entry point: connect, work out the roles, build tasks, arrange them, draw them as a Gantt
// chart, a timeline, a board, a booking grid or a workload, and write edits back.
//
// Two sources feed the same code: a real Grist (rows pushed by onRecords, everything else read with
// full access) or the demo (src/demo/sample.js), used whenever no Grist answers. In the demo every
// edit stays in memory and has its own undo; in Grist an edit is one action, undone by Grist.

import { el, clear } from './core/util.js';
import { VERSION } from './version.js';
import {
  start, accessLevel, selectedTableId, gristCulture, getOptions, setOptions, moveCursor, apply, linkingInfo, docAddress,
  openRecordCard, undo as gristUndo, redo as gristRedo,
} from './grist/connect.js';
import { loadColumns, loadForeignMapping, loadLabels, loadOwnSection, loadHolidayDays, loadDaysOff, listDatedTables, loadTable, listTables, columnRefs, forgetMeta, listTablesWithColumns, docTimeZone } from './data/live.js';
import { templates, structureActions, dataActions, columnForRole } from './model/templates.js';
import { detectRoles, ganttReady, fromStored, toStored } from './model/roles.js';
import { buildTasks, spanOf } from './model/tasks.js';
import { arrange } from './model/tree.js';
import { linksOf, isLate, pushPlan, criticalPath, wouldLoop } from './model/schedule.js';
import { makeCalendar, holidaysBetween } from './model/calendar.js';
import { todayDay, dateFromDay, plain, dayOf, num, isoFromDay, dayFromISO, progressScale } from './model/values.js';
import { capabilities, planDates, linkValue, newTaskFields, canLink, planLink, planUnlink } from './model/edits.js';
import { readOptions, writeOptions, storedZoom, rememberZoom, storedView, rememberView, storedMode, rememberMode, storedMe, rememberMe, storedTab, rememberTab, GANTT_DEFAULTS, BOARD_DEFAULTS, BOOKING_DEFAULTS, WORKLOAD_DEFAULTS, TIME_DEFAULTS, VIEWS, snapshotView, withView, MAX_VIEWS } from './model/settings.js';
import { buildBoard, planCardMove, newCardFields, cellText, LANE_KINDS, FIELD_KINDS } from './model/board.js';
import { LANE_KINDS as TL_KINDS, planLaneChange, lanesOf } from './model/lanes.js';
import { buildTimeline } from './model/timeline.js';
import { buildBooking, calendarPeriods, tablePeriods, columnPeriods, bookingRange, suggestUnit, planBookingMove, newBookingFields, PERIOD_UNITS } from './model/booking.js';
import { buildWorkload, periodTotals, teamTotals, tasksIn, levelPlan, effortUnitOf, detectCapacity, capacityMode, capacityPerDay, WL_UNITS, WL_MEASURES } from './model/workload.js';
import { buildAgenda } from './model/agenda.js';
import { buildCalGrid, addMonths } from './model/calgrid.js';
import { toIcs, fileName } from './model/ics.js';
import { reminderScript, detectEmailColumn } from './model/reminders.js';
import { detectTimeColumns, findTimeTable, readEntries, loggedByTask, runningOf, planStart, planStop, planLog, toCsv, timeTableSetup, timeTableShowActions } from './model/time.js';
import { ZOOM_ORDER, ZOOMS, fitZoom, isoWeek, startOfUnit } from './views/gantt/layout.js';
import { renderTimePrint, renderBoardPrint, renderBookingPrint, renderWorkloadPrint, renderCalendarPrint, subtitleFor } from './print/render.js';
import { nodeToPng } from './print/png.js';
import { pageRule } from './print/layout.js';
import { openPrint } from './ui/printpanel.js';
import { openKeys } from './ui/keys.js';
import { createGantt } from './views/gantt/view.js';
import { createBoard } from './views/board/view.js';
import { createTimeline } from './views/timeline/view.js';
import { createBooking } from './views/booking/view.js';
import { createWorkload } from './views/workload/view.js';
import { createAgenda } from './views/agenda/view.js';
import { createCalendar } from './views/calendar/view.js';
import { renderToolbar } from './ui/toolbar.js';
import { openMapping } from './ui/mapping.js';
import { openQuickEdit } from './ui/quickedit.js';
import { confirmBox, numberBox, chooseBox, logBox } from './ui/dialog.js';
import { openTimesheet } from './ui/timesheet.js';
import { openReminders } from './ui/reminders.js';
import { openViews } from './ui/views.js';
import { t, tn, setLanguage, storedLanguage, dateLocale, weekStartOf } from './i18n/index.js';
import { SAMPLE_COLUMNS, SAMPLE_LABELS, SAMPLE_TABLE, SAMPLE_PEOPLE, SAMPLE_TIME_TABLE, SAMPLE_TIME_COLUMNS, sampleRows, sampleDaysOff, sampleTimeRows } from './demo/sample.js';
import { STORES_COLUMNS, STORES_LABELS, STORES_TABLE, STORES_RESOURCES, storesRows } from './demo/stores.js';
import { SPEED_COLUMNS, SPEED_LABELS, SPEED_TABLE, speedRows } from './demo/speed.js';

const S = {
  live: false, demo: false, ready: false,
  tableId: null, columns: [], roles: {}, source: { kind: 'names' },
  options: null, gantt: { ...GANTT_DEFAULTS }, board: { ...BOARD_DEFAULTS, wip: {} }, booking: { ...BOOKING_DEFAULTS }, workload: { ...WORKLOAD_DEFAULTS },
  periodTable: null, resourceTable: null,   // the booking grid's periods table and resources table, {columns, rows}
  peopleTable: null,                        // the workload's people with their capacity, {columns, rows}
  daysOff: { refTable: null, days: new Map() },   // people's own days off, from the holidays table
  time: { ...TIME_DEFAULTS },               // the time-entries table picked in Columns (settings)
  timeTableId: null, timeTable: null, timeCols: null, timeZone: 'UTC',   // the one in use, its rows and columns
  entries: [], logged: new Map(), me: null, // its entries, hours per task, and who this browser's timers are for
  opensAs: 'auto', mode: 'gantt',   // the view the widget opens in (saved), and the one shown now
  savedViews: [],                   // named views saved in the widget's options (settings.js), shared by everyone
  rows: [], labels: {}, holidayDays: new Map(), built: null, signature: '',
  zoom: null, fitNext: false, selectedId: null, firstDraw: true,
  view: { groupBy: null, critical: false, collapsed: new Set(), laneBy: null, tlLaneBy: null, bookRows: null, bookPeriods: null, bookFilter: null, wlRows: null, wlUnit: null, wlMeasure: null, agendaWho: null, calMode: null },   // this browser's view of this table
  calDay: null,        // a day in the month or week the calendar shows; null = today (not saved: looking around)
  example: 'plan',     // the demo's data: 'plan' (a website relaunch) or 'stores' (pop-up stores × weekends)
  pendingEdit: null,   // {id, note}: open quick edit once Grist sends this new row
};
const demoHistory = { undo: [], redo: [] };

// ---- the page --------------------------------------------------------------------------------------
const app = document.getElementById('app');
const toolbar = el('div', { class: 'ps-toolbar' });
const stage = el('div', { class: 'ps-stage' });
const toastBox = el('div', { class: 'ps-toast', role: 'status', 'aria-live': 'polite', hidden: true });
// What a screen reader says when the selection moves: the views draw a ring, this says which task.
const srBox = el('div', { class: 'ps-sr', role: 'status', 'aria-live': 'polite' });
const shell = el('div', { class: 'ps-app', dataset: { version: VERSION } }, [toolbar, stage, toastBox, srBox]);
function announce(text) {
  srBox.textContent = '';
  setTimeout(() => { srBox.textContent = text; }, 30);   // emptied first, so the same words are said again
}
clear(app).appendChild(shell);

let toastTimer = 0;
function toast(msg, action = null) {
  clear(toastBox).append(el('span', { text: msg }));
  if (action) toastBox.append(el('button', { type: 'button', class: 'ps-toast__btn', text: action.label, onclick: () => { toastBox.hidden = true; action.run(); } }));
  toastBox.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastBox.hidden = true; }, action ? 7000 : 4500);
}
const errText = (e) => String(e?.message || e || '').replace(/^Error:\s*/, '').slice(0, 180);

let view = null;        // the Gantt chart, when it is the view shown
let boardView = null;   // the board, when it is
let timelineView = null;
let bookingView = null;
let workloadView = null;
let agendaView = null;
let calendarView = null;
const current = () => view || boardView || timelineView || bookingView || workloadView || agendaView || calendarView;
/** Take down every view but `keep` ('gantt', 'board', 'timeline', 'booking', 'workload', 'agenda', 'calendar'; null for all). */
function dropOthers(keep) {
  if (keep !== 'gantt') dropView();
  if (keep !== 'board') dropBoard();
  if (keep !== 'timeline' && timelineView) { timelineView.destroy(); timelineView = null; S.signature = ''; S.firstDraw = true; }
  if (keep !== 'booking' && bookingView) { bookingView.destroy(); bookingView = null; S.signature = ''; S.firstDraw = true; }
  if (keep !== 'workload' && workloadView) { workloadView.destroy(); workloadView = null; S.signature = ''; S.firstDraw = true; }
  if (keep !== 'agenda' && agendaView) { agendaView.destroy(); agendaView = null; S.signature = ''; S.firstDraw = true; }
  if (keep !== 'calendar' && calendarView) { calendarView.destroy(); calendarView = null; S.signature = ''; S.firstDraw = true; }
}
function ensureView() {
  if (view) return view;
  dropOthers('gantt');
  clear(stage);
  view = createGantt(stage, {
    onSelect: (id) => select(id, { tellGrist: true }),
    onOpen: (id) => openCard(id),
    onQuickEdit: (id) => openQuick(id),
    onEdit: (e) => editDates(e),
    onLink: (l) => addLink(l),
    onArrow: (l) => removeLink(l),
    onToggle: (key) => toggleFold(key),
    onZoomStep: (dir) => setZoom(ZOOM_ORDER[Math.max(0, Math.min(ZOOM_ORDER.length - 1, ZOOM_ORDER.indexOf(S.zoom) + dir))]),
    onToday: () => view.scrollToToday(),
    onUndo: () => undo(),
    onRedo: () => redo(),
  });
  return view;
}
function dropView() { if (view) { view.destroy(); view = null; S.signature = ''; S.firstDraw = true; } }
function ensureBoard() {
  if (boardView) return boardView;
  dropOthers('board');
  clear(stage);
  boardView = createBoard(stage, {
    onSelect: (id) => select(id, { tellGrist: true }),
    onOpen: (id) => openCard(id),
    onQuickEdit: (id) => openQuick(id),
    onMove: (m) => moveCard(m),
    onAdd: (a) => addCard(a),
    onLimit: (key) => setLimit(key),
    onUndo: () => undo(),
    onRedo: () => redo(),
  });
  return boardView;
}
function dropBoard() { if (boardView) { boardView.destroy(); boardView = null; S.signature = ''; } }
function ensureTimeline() {
  if (timelineView) return timelineView;
  dropOthers('timeline');
  clear(stage);
  timelineView = createTimeline(stage, {
    onSelect: (id) => select(id, { tellGrist: true }),
    onOpen: (id) => openCard(id),
    onQuickEdit: (id) => openQuick(id),
    onEdit: (e) => editTimeline(e),
    onUndo: () => undo(),
    onRedo: () => redo(),
  });
  return timelineView;
}
function ensureBooking() {
  if (bookingView) return bookingView;
  dropOthers('booking');
  clear(stage);
  bookingView = createBooking(stage, {
    onSelect: (id) => select(id, { tellGrist: true }),
    onOpen: (id) => openCard(id),
    onQuickEdit: (id) => openQuick(id),
    onMove: (m) => moveBooking(m),
    onBook: (b) => bookCell(b),
    onAnnounce: (text) => announce(text),
    onUndo: () => undo(),
    onRedo: () => redo(),
  });
  return bookingView;
}
function ensureWorkload() {
  if (workloadView) return workloadView;
  dropOthers('workload');
  clear(stage);
  workloadView = createWorkload(stage, {
    onSelect: (id) => select(id, { tellGrist: true, reveal: false }),
    onQuickEdit: (id) => openQuick(id),
    onAnnounce: (text) => announce(text),
    onUndo: () => undo(),
    onRedo: () => redo(),
  });
  return workloadView;
}

function ensureCalendar() {
  if (calendarView) return calendarView;
  dropOthers('calendar');
  clear(stage);
  calendarView = createCalendar(stage, {
    onSelect: (id) => select(id, { tellGrist: true, reveal: false }),
    onQuickEdit: (id) => openQuick(id),
    onMove: (m) => moveCalendar(m),
    onNav: (dir) => calNav(dir),
    onToday: () => { S.calDay = null; S.signature = ''; recompute(); },
    onMode: (m) => { S.view.calMode = m; saveView(); S.signature = ''; recompute(); },
    onDay: (day) => { S.calDay = day; S.view.calMode = 'week'; saveView(); S.signature = ''; recompute(); },
    onFind: (id) => { const x = taskById(id); if (x?.start != null) { S.calDay = x.start; S.signature = ''; recompute(); } },
    onAnnounce: (text) => announce(text),
    onUndo: () => undo(),
    onRedo: () => redo(),
  });
  return calendarView;
}

function ensureAgenda() {
  if (agendaView) return agendaView;
  dropOthers('agenda');
  clear(stage);
  agendaView = createAgenda(stage, {
    onQuickEdit: (id) => openQuick(id),
    onAnnounce: (text) => announce(text),
  });
  return agendaView;
}

/** A message in place of the view; `actions` are [label, run] buttons, the first one the main one. */
function emptyState(title, body, actions = [[t('Choose columns'), () => openColumns('columns')]]) {
  dropOthers(null);
  clear(stage).appendChild(el('div', { class: 'ps-empty' }, [
    el('h2', { text: title }),
    el('p', { text: body }),
    actions.length ? el('div', { class: 'ps-empty__actions' }, actions.map(([label, run], i) =>
      el('button', { type: 'button', class: 'ps-btn' + (i ? '' : ' ps-btn--primary'), text: label, onclick: run }))) : null,
  ]));
}

// ---- who may write -----------------------------------------------------------------------------------
function readOnlyWhy() {
  if (S.demo) return null;
  if (!S.live) return t('Not connected to Grist.');
  try { if (new URLSearchParams(location.search).get('readonly') === 'true') return t('You can view this document but not edit it.'); } catch { /* no URL */ }
  if (accessLevel() !== 'full') return t('This widget needs full document access to edit. Set it in the widget panel on the right.');
  return null;
}
const canEdit = () => readOnlyWhy() == null;

// ---- the calendar -----------------------------------------------------------------------------------
// Public holidays for ten years around today, plus the days of a Holidays table. Ten years of rules is
// about 150 days: cheap, and no task in a real plan reaches outside it.
let calendarCache = { key: '', cal: makeCalendar() };
function calendar() {
  const g = S.gantt;
  const key = [g.durationUnit, g.holidays, S.holidayDays.size, [...S.holidayDays.keys()].slice(0, 3).join(',')].join('|');
  if (key === calendarCache.key) return calendarCache.cal;
  const today = todayDay();
  const holidays = (g.holidays || S.holidayDays.size) ? holidaysBetween(g.holidays, today - 365 * 5, today + 365 * 5, S.holidayDays) : new Map();
  calendarCache = { key, cal: makeCalendar({ workdays: g.durationUnit === 'workdays', holidays }) };
  return calendarCache.cal;
}
const ctx = () => ({ roles: S.roles, columns: S.columns, settings: S.gantt, editable: canEdit(), calendar: calendar() });

// ---- drawing ------------------------------------------------------------------------------------------
const weekStart = () => (S.gantt.weekStart === 'auto' ? weekStartOf(dateLocale(gristCulture())) : S.gantt.weekStart);
// Date formatters are costly to make (a board of 5,000 cards spent most of its time on them), so one
// is made per locale and shape and kept.
const formats = new Map();
const dateFormat = (withYear) => {
  const key = dateLocale(gristCulture()) + (withYear ? '|y' : '');
  if (!formats.has(key)) formats.set(key, new Intl.DateTimeFormat(dateLocale(gristCulture()), { timeZone: 'UTC', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }));
  return formats.get(key);
};
const dayFormat = () => dateFormat(true);
const fmtDay = (d) => dayFormat().format(dateFromDay(d));
/** "15–26 Oct 2026" where the browser can shorten a range, "15 Oct 2026 – 26 Oct 2026" where not. */
const fmtRange = (a, b) => {
  if (a === b) return fmtDay(a);
  const f = dayFormat();
  return typeof f.formatRange === 'function' ? f.formatRange(dateFromDay(a), dateFromDay(b)) : `${fmtDay(a)} – ${fmtDay(b)}`;
};
// The board's shorter dates: no year for this year's days.
const shortFormat = (withYear) => dateFormat(withYear);
const thisYear = (d) => dateFromDay(d).getUTCFullYear() === new Date().getFullYear();
const fmtShort = (d) => shortFormat(!thisYear(d)).format(dateFromDay(d));
const fmtShortRange = (a, b) => {
  if (a === b) return fmtShort(a);
  const f = shortFormat(!thisYear(a) || !thisYear(b));
  return typeof f.formatRange === 'function' ? f.formatRange(dateFromDay(a), dateFromDay(b)) : `${fmtShort(a)} – ${fmtShort(b)}`;
};
const colourByCol = () => (S.gantt.colourBy ? S.columns.find((c) => c.ref === S.gantt.colourBy.ref) || S.columns.find((c) => c.id === S.gantt.colourBy.id) || null : null);
const GROUP_KINDS = ['Choice', 'ChoiceList', 'Ref', 'RefList', 'Text', 'Bool'];
const groupable = (c) => GROUP_KINDS.includes(c.kind) && c.refTable !== S.tableId && c.id !== S.roles.title;
const groupCol = () => (S.view.groupBy ? S.columns.find((c) => c.id === S.view.groupBy && groupable(c)) || null : null);

// ---- the board's columns ----------------------------------------------------------------------------
const colById = (id) => (id ? S.columns.find((c) => c.id === id) || null : null);
const laneable = (c) => LANE_KINDS.includes(c.kind) && c.refTable !== S.tableId && c.id !== S.roles.title;
/** The lane column: this browser's choice, else the Status column, else the first choice column. */
function laneCol() {
  const picked = colById(S.view.laneBy);
  if (picked && laneable(picked)) return picked;
  const status = colById(S.roles.status);
  if (status && laneable(status)) return status;
  return S.columns.find((c) => c.kind === 'Choice' && laneable(c)) || null;
}
const orderCol = () => { const c = colById(S.roles.order); return c && (c.kind === 'Numeric' || c.kind === 'Int') ? c : null; };
/** The columns a card shows besides its name, dates and people: picked in Columns, or the project. */
function fieldCols(lane = laneCol()) {
  if (Array.isArray(S.board.fields)) {
    return S.board.fields.map((f) => S.columns.find((c) => c.ref === f.ref) || colById(f.id)).filter((c) => c && FIELD_KINDS.includes(c.kind) && c.id !== lane?.id);
  }
  const project = colById(S.roles.project);
  return project && project.id !== lane?.id ? [project] : [];
}
// ---- the timeline's and the booking grid's columns ------------------------------------------------------
const tlLaneable = (c) => TL_KINDS.includes(c.kind) && c.refTable !== S.tableId && c.id !== S.roles.title;
/** The timeline's lanes: this browser's choice, else rooms (a booking table), people, projects or the status. */
function tlLaneCol() {
  const picked = colById(S.view.tlLaneBy);
  if (picked && tlLaneable(picked)) return picked;
  for (const role of ['resource', 'assignee', 'project', 'status']) { const c = colById(S.roles[role]); if (c && tlLaneable(c)) return c; }
  return S.columns.find((c) => (c.kind === 'Choice' || c.kind === 'Ref') && tlLaneable(c)) || null;
}
const ROW_KINDS = ['Ref', 'RefList', 'Choice', 'Text'];
const rowable = (c) => ROW_KINDS.includes(c.kind) && c.refTable !== S.tableId && c.id !== S.roles.title;
/** The booking grid's rows: this browser's choice, else the resource, else people or projects. */
function bookResCol() {
  const picked = colById(S.view.bookRows);
  if (picked && rowable(picked)) return picked;
  for (const role of ['resource', 'assignee', 'project']) { const c = colById(S.roles[role]); if (c && rowable(c)) return c; }
  return S.columns.find((c) => c.kind === 'Ref' && rowable(c)) || null;
}
const periodable = (c, res = bookResCol()) => ['Ref', 'Choice', 'Text'].includes(c.kind) && c.refTable !== S.tableId && c.id !== S.roles.title && c.id !== res?.id;
const datedTasks = () => (S.built?.tasks || []).filter((x) => x.start != null);
/**
 * The grid's columns: 'day' | 'week' | 'month' | 'col:<column id>' | 'table:<table id>'. This browser's
 * choice, else the period column (a Weekend column), else the periods table, else the unit that fits the
 * bookings' lengths.
 */
function bookPeriodsBy() {
  const v = S.view.bookPeriods;
  const res = bookResCol();
  if (PERIOD_UNITS.includes(v)) return v;
  if (v?.startsWith('col:')) { const c = colById(v.slice(4)); if (c && periodable(c, res)) return v; }
  if (v?.startsWith('table:') && v.slice(6) === S.booking.periodTable) return v;
  const p = colById(S.roles.period);
  if (p && periodable(p, res)) return 'col:' + p.id;
  if (S.booking.periodTable) return 'table:' + S.booking.periodTable;
  return suggestUnit(datedTasks());
}
const bookLabelCol = () => (S.booking.labelBy ? S.columns.find((c) => c.ref === S.booking.labelBy.ref) || colById(S.booking.labelBy.id) : null);
/** The resources table's rows the filter keeps, as lane keys; null = all. */
function bookKeep() {
  const f = S.view.bookFilter;
  const res = bookResCol();
  if (!f || !res?.refTable || !S.resourceTable) return null;
  const i = f.indexOf('=');
  const colId = f.slice(0, i), value = f.slice(i + 1);
  if (!S.resourceTable.columns.some((c) => c.id === colId)) return null;
  return new Set(S.resourceTable.rows.filter((r) => String(plain(r[colId]) ?? '') === value).map((r) => 'r:' + r.id));
}
/** The filter's choices: every value of the resources table's choice, text and yes/no columns, when there are few. */
function bookFilterOptions() {
  if (!S.resourceTable || !bookResCol()?.refTable) return [];
  const out = [];
  for (const c of S.resourceTable.columns.filter((x) => ['Choice', 'Text', 'Bool', 'Int'].includes(x.kind))) {
    const values = [...new Set(S.resourceTable.rows.map((r) => plain(r[c.id])).filter((v) => v != null && v !== ''))].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    if (values.length < 2 || values.length > 12 || values.length >= S.resourceTable.rows.length) continue;
    // a Type or a number of Bedrooms, not a description or an area: short text only, whole numbers only when few
    if (c.kind === 'Text' && values.some((v) => String(v).length > 24)) continue;
    if (c.kind === 'Int' && values.length > 8) continue;
    for (const v of values) out.push({ id: `${c.id}=${v}`, label: `${c.label}: ${typeof v === 'boolean' ? (v ? '✓' : '✗') : v}` });
  }
  return out;
}

// ---- the workload's columns -------------------------------------------------------------------------------
const wlRowable = (c) => TL_KINDS.includes(c.kind) && c.refTable !== S.tableId && c.id !== S.roles.title;
/** The workload's rows: this browser's choice, else the people the tasks are assigned to. */
function wlRowCol() {
  const picked = colById(S.view.wlRows);
  if (picked && wlRowable(picked)) return picked;
  const who = colById(S.roles.assignee);
  return who && wlRowable(who) ? who : null;
}
const wlUnit = () => (WL_UNITS.includes(S.view.wlUnit) ? S.view.wlUnit : 'week');
/** Planned, logged or remaining hours: logged and remaining only with a time-entries table. */
const wlMeasure = () => (hasTime() && WL_MEASURES.includes(S.view.wlMeasure) ? S.view.wlMeasure : 'planned');
const effortCol = () => { const c = colById(S.roles.effort); return c && (c.kind === 'Numeric' || c.kind === 'Int') ? c : null; };
/** The people table's capacity column: the one saved in Columns, else one whose name says so. */
function capacityCol() {
  const cols = S.peopleTable?.columns || [];
  const saved = S.workload.capacity ? cols.find((c) => c.ref === S.workload.capacity.ref) || cols.find((c) => c.id === S.workload.capacity.id) : null;
  if (saved && (saved.kind === 'Numeric' || saved.kind === 'Int')) return saved;
  const guess = detectCapacity(cols);
  return guess ? cols.find((c) => c.id === guess.id) : null;
}
/** Each person's hours on a working day, by row key, from the capacity column. */
function capacityMap(personCol) {
  const out = new Map();
  const col = personCol?.refTable && S.peopleTable ? capacityCol() : null;
  if (!col) return out;
  const mode = capacityMode(col, S.peopleTable.rows.map((r) => r[col.id]));
  for (const r of S.peopleTable.rows) out.set('r:' + r.id, capacityPerDay(r[col.id], mode, S.workload.hoursPerDay));
  return out;
}
/** What the workload model needs, for these rows and this measure. */
function wlContext(personCol, measure = 'planned') {
  const cal = calendar();
  const eff = effortCol();
  return {
    personCol, labels: S.labels, isWork: cal.isWork, hoursPerDay: S.workload.hoursPerDay,
    effortCol: eff, effortUnit: effortUnitOf(eff, S.workload.effortUnit), capacity: capacityMap(personCol),
    daysOff: personCol.refTable && S.daysOff.refTable === personCol.refTable ? S.daysOff.days : new Map(),
    measure, today: todayDay(), logs: measure === 'planned' ? [] : wlLogs(personCol),
  };
}
/**
 * The time entries with their person as a key of the workload's rows. Rows of the same people table, or
 * a person found by name, keep their person; rows of something else (a department) can't name one, so
 * the entry counts for the task's row, as an entry naming nobody does.
 */
function wlLogs(personCol) {
  if (!hasTime()) return [];
  const isRef = personCol.kind === 'Ref' || personCol.kind === 'RefList';
  const tcol = S.timeCols.person ? S.timeTable.columns.find((c) => c.id === S.timeCols.person) : null;
  const sameTable = tcol?.kind === 'Ref' && isRef && tcol.refTable === personCol.refTable;
  const byName = new Map(lanesOf(personCol, S.rows, S.labels).filter((l) => !l.none).map((l) => [String(l.label ?? ''), l.key]));
  const people = personCol.id === S.roles.assignee;
  const keys = new Map();
  const keyOf = (p) => {
    if (!p || sameTable) return p || null;
    if (!keys.has(p)) {
      const name = p.startsWith('v:') ? p.slice(2) : personName(p);
      // someone not on any task, in a column of names, still gets a row of their own
      keys.set(p, byName.get(name) ?? (people && name && !isRef ? 'v:' + name : null));
    }
    return keys.get(p);
  };
  return S.entries.map((e) => ({ task: e.task, key: keyOf(e.person), day: e.day, hours: e.hours }));
}

/** Every column whose References need labels: the roles' and those of the view on show. */
function labelRoles() {
  const lane = laneCol();
  const extra = { ...(lane ? { _lane: lane.id } : {}), ...Object.fromEntries(fieldCols(lane).map((c, i) => ['_f' + i, c.id])) };
  const tl = tlLaneCol(), res = bookResCol(), lab = bookLabelCol();
  const per = bookPeriodsBy();
  if (tl) extra._tl = tl.id;
  if (res) extra._res = res.id;
  if (lab) extra._lab = lab.id;
  if (per.startsWith('col:')) extra._per = per.slice(4);
  const wl = wlRowCol();
  if (wl) extra._wl = wl.id;
  return { ...S.roles, ...extra };
}
/** The lane limits for one lane column, by lane key. */
function wipFor(col) {
  const out = {};
  const prefix = col.ref + '|';
  for (const [k, n] of Object.entries(S.board.wip || {})) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = n;
  return out;
}
const boardPossible = () => !!(S.roles.title && laneCol());

/** The view to open in: what this browser last switched to, else the widget's setting, else whatever fits the table. */
function resolveMode() {
  const stored = storedMode(S.tableId, S.opensAs);
  if (stored) return fitsScreen(stored);
  if (VIEWS.includes(S.opensAs)) return fitsScreen(S.opensAs);
  // On a phone the list is what reads: the agenda, for any table that has task names.
  if (S.roles.title && typeof window !== 'undefined' && window.innerWidth < PHONE) return 'agenda';
  if (ganttReady(S.roles)) return 'gantt';
  // No dates: bookings by a period column (stores × weekends) open as the grid, the rest as a board.
  const res = colById(S.roles.resource), per = colById(S.roles.period);
  if (res && per && rowable(res) && periodable(per, res)) return 'booking';
  return boardPossible() ? 'board' : 'gantt';
}
const PHONE = 600;   // px: under this the widget is a phone's, and the agenda its first view
const narrow = () => typeof window !== 'undefined' && window.innerWidth < PHONE;
/** The calendar has seven columns to fill: on a phone its place is the agenda's. */
const fitsScreen = (mode) => (mode === 'calendar' && narrow() ? 'agenda' : mode);
function setMode(mode) {
  if (mode === S.mode) return;
  S.mode = mode;
  rememberMode(S.tableId, S.opensAs, mode);
  S.signature = '';
  reload('labels');
}

const EXAMPLE_LABELS = { plan: 'Website relaunch', stores: 'Pop-up stores' };
const PERIOD_LABELS = { day: 'Days', week: 'Weeks', month: 'Months' };

function drawToolbar(model = null, level = 'full') {
  const b = S.built;
  const gantt = S.mode === 'gantt';
  const bm = S.mode === 'booking' ? S.bookModel : null;
  const wm = S.mode === 'workload' ? S.wlModel : null;
  const res = bookResCol();
  const asOptions = (cols) => cols.map((c) => ({ id: c.id, label: c.label }));
  renderToolbar(toolbar, {
    level, mode: S.mode, zoom: S.zoom, demo: S.demo, editable: canEdit(), readOnlyWhy: readOnlyWhy(),
    canAdd: canEdit() && ganttReady(S.roles),
    // A parent without dates of its own still has a bar (its children's span): only tasks with neither count as undated.
    // The timeline draws the children rather than the parent, but counts the same way, so both views give one number.
    counts: {
      tasks: b ? b.tasks.length + b.unscheduled.length : 0,
      cards: b ? b.tasks.length + b.unscheduled.length : 0,
      unscheduled: gantt && model ? model.entries.filter((e) => e.kind === 'task' && e.undated).length
        : S.mode === 'timeline' && b ? arrange([...b.tasks, ...b.unscheduled]).entries.filter((e) => e.undated).length
        : S.mode === 'calendar' && b ? b.unscheduled.length : 0,
      flagged: b ? b.flagged : 0,
      bookings: b ? b.tasks.length + b.unscheduled.length : 0, clashes: bm ? bm.clashes.size : 0, outside: bm ? bm.outside : 0,
      overloads: wm ? wm.ahead.length : 0, noHours: wm ? wm.missing : 0,
      open: S.mode === 'agenda' && S.agendaModel ? S.agendaModel.ag.open : 0,
      late: S.mode === 'agenda' ? S.agendaModel?.ag.groups.find((g) => g.id === 'late')?.items.length || 0 : 0,
      // logged hours are history: the bar says how many, not whether anyone is over
      logged: wm?.measure === 'logged' ? fmtHours(wm.people.reduce((s, p) => s + p.totals.reduce((a, x) => a + x.load, 0), 0)) : null,
    },
    groupOptions: asOptions(S.columns.filter(groupable)),
    groupBy: groupCol()?.id || null,
    hasLinks: !!(model && gantt && model.links.length), critical: S.view.critical,
    laneOptions: asOptions(S.columns.filter(laneable)), laneBy: laneCol()?.id || null,
    tlLaneOptions: asOptions(S.columns.filter(tlLaneable)), tlLaneBy: tlLaneCol()?.id || null,
    rowOptions: asOptions(S.columns.filter(rowable)), rowsBy: res?.id || null,
    periodOptions: [
      ...PERIOD_UNITS.map((u) => ({ id: u, label: t(PERIOD_LABELS[u]) })),
      ...S.columns.filter((c) => periodable(c, res) && (c.kind === 'Choice' || c.id === S.roles.period)).map((c) => ({ id: 'col:' + c.id, label: c.label })),
      ...(S.booking.periodTable ? [{ id: 'table:' + S.booking.periodTable, label: S.booking.periodTable }] : []),
    ],
    periodsBy: bookPeriodsBy(),
    filterOptions: bookFilterOptions(), filterBy: S.view.bookFilter,
    wlRowOptions: asOptions(S.columns.filter(wlRowable)), wlRowsBy: wlRowCol()?.id || null, wlUnit: wlUnit(),
    wlMeasure: hasTime() ? wlMeasure() : null,
    canLevel: !!(wm && wm.ahead.length && (canEdit() || S.demo)),
    agendaWho: S.mode === 'agenda' ? agendaWho() : null, agendaDoable: !!S.agendaModel?.doable, narrow: narrow(),
    canCalendar: S.mode === 'agenda' && !!S.agendaModel?.ag.groups.some((g) => g.id !== 'late' && g.id !== 'undated'),
    timer: (() => { const r = myTimer(); return r ? { title: taskById(r.task)?.title || t('(no name)'), since: r.start, elapsed: elapsedText(r.start) } : null; })(),
    hasTime: hasTime(),
    examples: Object.entries(EXAMPLE_LABELS).map(([id, label]) => ({ id, label: t(label) })), example: S.example,
  }, {
    onMode: setMode,
    onZoom: (z) => setZoom(z), onFit: fit, onToday: () => current()?.scrollToToday?.(), onColumns: openColumns,
    onNew: newTask, onUndated: () => view?.scrollToUndated(),
    onGroup: (id) => { S.view.groupBy = id || null; saveView(); S.signature = ''; recompute(); },
    onCritical: () => { S.view.critical = !S.view.critical; saveView(); S.signature = ''; recompute(); },
    onLanes: (id) => { S.view.laneBy = id || null; saveView(); S.signature = ''; reload('labels'); },
    onTlLanes: (id) => { S.view.tlLaneBy = id || null; saveView(); S.signature = ''; reload('labels'); },
    onRows: (id) => { S.view.bookRows = id || null; S.view.bookFilter = null; saveView(); S.signature = ''; reload('tables'); },
    onPeriods: (id) => { S.view.bookPeriods = id || null; saveView(); S.signature = ''; S.firstDraw = true; reload('tables'); },
    onFilter: (id) => { S.view.bookFilter = id || null; saveView(); S.signature = ''; recompute(); },
    onClash: () => { const id = [...(S.bookModel?.clashes || [])][0]; if (id != null) select(id, { tellGrist: true }); },
    onWlRows: (id) => { S.view.wlRows = id || null; saveView(); S.signature = ''; reload('tables'); },
    onWlUnit: (u) => { S.view.wlUnit = u; saveView(); S.signature = ''; S.firstDraw = true; recompute(); },
    onWlMeasure: (m) => { S.view.wlMeasure = m; saveView(); S.signature = ''; recompute(); },
    onLevel: () => levelNow(),
    onAgendaWho: (v) => setAgendaWho(v),
    onCalendar: () => exportCalendar(null),
    onReminders: () => openRemindersPanel(),
    onViews: () => openViewsPanel(),
    onOverload: () => { const o = S.wlModel?.ahead[0]; if (o) workloadView?.scrollToCell(S.wlModel.cellOf(o)); },
    onStopTimer: () => stopTimer(),
    onTimesheet: () => openTimesheetPanel(),
    onExample: (id) => bootDemo(id),
    onPrint: () => startPrint(),
    onKeys: () => openKeys(shell, S.mode),
  });
}
const saveView = () => rememberView(S.tableId, {
  groupBy: S.view.groupBy, critical: S.view.critical, collapsed: [...S.view.collapsed], laneBy: S.view.laneBy,
  tlLaneBy: S.view.tlLaneBy, bookRows: S.view.bookRows, bookPeriods: S.view.bookPeriods, bookFilter: S.view.bookFilter,
  wlRows: S.view.wlRows, wlUnit: S.view.wlUnit, wlMeasure: S.view.wlMeasure, agendaWho: S.view.agendaWho, calMode: S.view.calMode,
});

/** Everything the chart needs, from the rows. */
function buildModel() {
  const cal = calendar();
  const gc = groupCol();
  S.built = buildTasks(S.rows, {
    roles: S.roles, columns: S.columns, labels: S.labels, calendar: cal,
    settings: { ...S.gantt, colourBy: colourByCol()?.id || null, groupBy: gc?.id || null },
  });
  const all = [...S.built.tasks, ...S.built.unscheduled];
  const group = gc ? {
    key: (task) => task.group,
    label: (k) => k || t('(none)'),
    order: gc.kind === 'Choice' || gc.kind === 'ChoiceList' ? gc.choices : null,
  } : null;
  const { entries, summaries } = arrange(all, { group, collapsed: S.view.collapsed });
  // Links between dated tasks; a parent counts with the span of its children.
  const dated = all.map((x) => (summaries.has(x.id) ? { ...x, start: summaries.get(x.id).start, end: summaries.get(x.id).end, summary: true } : x)).filter((x) => x.start != null);
  const byId = new Map(dated.map((x) => [x.id, x]));
  const links = linksOf(dated).map((l) => ({ ...l, late: isLate(l, byId, cal) }));
  const crit = S.view.critical ? criticalPath(dated.filter((x) => !x.summary), links, cal) : { tasks: new Set(), links: new Set() };
  return { entries, summaries, dated, links, crit, cal, span: spanOf(dated) };
}

function recompute() {
  if (!S.ready) return;
  showDueHint(false);
  showHoursHint(false);
  showNoTimeHint(false);
  // A new, empty table (Grist's Table1 with A, B, C): offer to set it up.
  if (S.live && canEdit() && !S.rows.length && !S.columns.some((c) => !(c.type === 'Any' && !c.isFormula && /^[A-Z]$/.test(c.id)))) { starterState(); return; }
  if (S.mode === 'board') { recomputeBoard(); return; }
  if (S.mode === 'timeline') { recomputeTimeline(); return; }
  if (S.mode === 'booking') { recomputeBooking(); return; }
  if (S.mode === 'workload') { recomputeWorkload(); return; }
  if (S.mode === 'agenda') { recomputeAgenda(); return; }
  if (S.mode === 'calendar') { recomputeCalendar(); return; }
  if (!ganttReady(S.roles)) {
    S.built = null;
    drawToolbar(null, 'switch');
    const hasDates = S.columns.some((c) => c.kind === 'Date' || c.kind === 'DateTime');
    const toBoard = boardPossible() ? [[t('Show the board'), () => setMode('board')]] : [];
    emptyState(t('Which columns hold the dates?'), hasDates
      ? t('Plan Studio draws each task from a name and a date. Pick the columns in Settings.')
      : t('This table has no Date column yet. Add one (a start date, an end or a due date), or show another table in this widget.')
        + (toBoard.length ? ' ' + t('The board needs no dates.') : ''),
    hasDates ? [[t('Choose columns'), () => openColumns('columns')], ...toBoard] : toBoard);
    return;
  }
  const m = buildModel();
  S.model = m;
  if (!S.built.tasks.length && !S.built.unscheduled.length) {
    drawToolbar(m);
    emptyState(t('No tasks to show'), t('The table is empty, or Grist’s filters or a linked widget’s selection leave nothing to show.'), []);
    return;
  }
  const v = ensureView();
  // Grist's own task templates have a due date and no start: their tasks are
  // milestones until there is a start date to draw a bar from.
  showDueHint(!!(S.roles.due && !S.roles.start && S.live && canEdit()));
  let fitNow = S.fitNext;
  // No zoom chosen in this browser yet: the one at which the whole plan fits.
  if (S.zoom == null) { S.zoom = fitZoom(m.span, v.chartWidth() || 800); fitNow = true; }
  S.fitNext = false;
  drawToolbar(m);
  const editable = canEdit();
  const titleCol = S.columns.find((c) => c.id === S.roles.title);
  const sig = [S.zoom, weekStart(), S.selectedId, titleCol?.label, editable, S.view.critical, S.gantt.holidays, S.gantt.durationUnit,
    [...S.view.collapsed].join(','), groupCol()?.id,
    ...m.entries.map((e) => (e.kind === 'group' ? 'g' + e.key + e.collapsed : e.task.id + '\u0002' + e.task.hash + (e.summary ? `${e.summary.start}-${e.summary.end}` : ''))),
    ...m.links.map((l) => `${l.from}>${l.to}${l.late ? '!' : ''}`), ...m.crit.tasks].join('\n');
  if (sig === S.signature && !fitNow) return;
  S.signature = sig;
  const c = ctx();
  v.update({
    entries: m.entries, span: m.span, links: m.links, critical: m.crit.tasks, criticalLinks: m.crit.links,
    holidays: m.cal.holidays, length: m.cal.length, workdays: m.cal.workdays,
    caps: (task) => capabilities(task, c), linkable: canLink(c), editable, showCritical: S.view.critical,
    today: todayDay(), zoom: S.zoom, weekStart: weekStart(), locale: dateLocale(gristCulture()), selectedId: S.selectedId,
    titleLabel: titleCol ? titleCol.label : t('Task'),
    timeText: (task) => timeText(task),
  }, { first: S.firstDraw, fit: fitNow });
  S.firstDraw = false;
}

/** The board's lanes and cards, from the rows. Cards need no dates. */
function buildBoardModel() {
  const lane = laneCol();
  // With lanes by status, a stripe in the status colour would only repeat the lane: the stripe then
  // shows the project, unless a colour column or "Colour the bars by" says otherwise.
  const status = colById(S.roles.status);
  const stripeBy = colourByCol()?.id || (!S.roles.colour && lane && status && lane.id === status.id ? colById(S.roles.project)?.id || null : null);
  S.built = buildTasks(S.rows, {
    roles: S.roles, columns: S.columns, labels: S.labels, calendar: calendar(),
    settings: { ...S.gantt, colourBy: stripeBy, groupBy: null },
  });
  const tasks = [...S.built.tasks, ...S.built.unscheduled].sort((a, b) => a.index - b.index);
  return buildBoard(tasks, S.rows, {
    laneCol: lane, orderCol: orderCol(), labels: S.labels, fields: fieldCols(lane), hideEmpty: S.board.hideEmpty,
    wip: wipFor(lane), today: todayDay(), cellText: (row, col) => cellText(row, col, S.labels, fmtShort), timeOf: (id) => timeOf(id),
  });
}

function recomputeBoard() {
  const lane = laneCol();
  if (!S.roles.title || !lane) {
    S.built = null;
    drawToolbar(null, 'switch');
    emptyState(t('Which column makes the lanes?'),
      t('The board puts each row in a lane by the value of a Choice, Reference or Text column, such as Status. Pick it in Settings, or add a Status column to the table.'));
    return;
  }
  const b = buildBoardModel();
  S.boardModel = b;
  drawToolbar();
  const editable = canEdit();
  const order = orderCol();
  const sig = ['b', lane.id, S.selectedId, editable, order?.id, S.board.hideEmpty, todayDay(),
    ...b.lanes.map((l) => `${l.key}|${l.label}|${l.colour}|${l.limit}|${l.over}|` + l.cards.map((c) => c.id + '\u0002' + c.hash).join('\u0003'))].join('\n');
  const v = ensureBoard();
  if (sig === S.signature) return;
  S.signature = sig;
  v.update({
    lanes: b.lanes, editable, laneLocked: lane.isFormula, canAdd: editable && !!colById(S.roles.title) && !colById(S.roles.title).isFormula,
    canLimit: editable || S.demo, selectedId: S.selectedId, laneLabel: lane.label, today: todayDay(), fmtDay: fmtShort, fmtRange: fmtShortRange, fmtHours,
  });
}

// ---- the timeline -----------------------------------------------------------------------------------------
function recomputeTimeline() {
  const lane = tlLaneCol();
  if (!ganttReady(S.roles) || !lane) {
    S.built = null;
    drawToolbar(null, 'switch');
    if (!lane) emptyState(t('Which column makes the lanes?'), t('The timeline draws a band for each person, room or project: a Reference, Choice or Text column. Pick it in Settings.'));
    else emptyState(t('Which columns hold the dates?'), t('Plan Studio draws each task from a name and a date. Pick the columns in Settings.'));
    return;
  }
  const cal = calendar();
  S.built = buildTasks(S.rows, { roles: S.roles, columns: S.columns, labels: S.labels, calendar: cal, settings: { ...S.gantt, colourBy: colourByCol()?.id || null } });
  // A room or a desk cannot be in two places at once; a person can be on two tasks.
  const tl = buildTimeline(S.built.tasks, S.rows, { laneCol: lane, labels: S.labels, clashes: lane.id === S.roles.resource });
  S.tlModel = tl;
  const span = spanOf(S.built.tasks);
  const v = ensureTimeline();
  let fitNow = S.fitNext;
  if (S.zoom == null) { S.zoom = fitZoom(span, v.chartWidth() || 800); fitNow = true; }
  S.fitNext = false;
  drawToolbar();
  const editable = canEdit();
  const sig = ['t', lane.id, S.zoom, weekStart(), S.selectedId, editable, S.gantt.holidays, todayDay(),
    ...tl.lanes.map((l) => `${l.key}|${l.label}|${l.tracks}|` + l.bars.map((b) => b.task.id + '@' + b.track + (b.clash ? '!' : '') + '\u0002' + b.task.hash).join('\u0003'))].join('\n');
  if (sig === S.signature && !fitNow) return;
  S.signature = sig;
  const c = ctx();
  v.update({
    lanes: tl.lanes, tracks: tl.tracks, span, holidays: cal.holidays, length: cal.length, workdays: cal.workdays,
    caps: (task) => capabilities(task, c), editable, laneMovable: editable && !lane.isFormula,
    today: todayDay(), zoom: S.zoom, weekStart: weekStart(), locale: dateLocale(gristCulture()), selectedId: S.selectedId,
    laneLabel: lane.label, noneLabel: t('No {col}', { col: lane.label }),
  }, { first: S.firstDraw, fit: fitNow });
  S.firstDraw = false;
}

/** A bar dragged in the timeline: new dates, another lane, or both, as one row and one undo step. */
async function editTimeline({ id, mode, start, end, from, to }) {
  const task = taskById(id), row = rowById(id);
  const lane = tlLaneCol();
  if (!task || !row || !lane || !S.tlModel) return;
  const out = { fields: {}, patch: {} };
  const dated = start !== task.start || end !== task.end;
  if (dated) {
    const p = planDates(task, row, ctx(), mode, start, end);
    if (p.error) { toast(p.error === 'endBeforeStart' ? t('The end can’t be before the start.') : t('These dates come from formulas, so they can’t be changed here.')); S.signature = ''; recompute(); return; }
    Object.assign(out.fields, p.fields); Object.assign(out.patch, p.patch);
  }
  const toLane = S.tlModel.lanes.find((l) => l.key === to);
  if (from !== to && toLane) {
    const p = planLaneChange(row, lane, S.tlModel.lanes.find((l) => l.key === from), toLane);
    if (p.error) { toast(t('“{col}” is a formula, so tasks can’t change lanes here.', { col: lane.label })); S.signature = ''; recompute(); return; }
    Object.assign(out.fields, p.fields); Object.assign(out.patch, p.patch);
  }
  if (!Object.keys(out.fields).length) return;
  if (id !== S.selectedId) { S.selectedId = id; if (S.live) moveCursor(id).catch(() => {}); }
  const name = task.title || t('(no name)');
  const laneText = toLane ? (toLane.none ? t('No {col}', { col: lane.label }) : String(toLane.label)) : '';
  const when = mode === 'start' ? fmtDay(start) : mode === 'end' ? fmtDay(end) : fmtRange(start, end);
  const parts = [from !== to && toLane && dated && mode === 'move' ? t('Moved “{name}” to {lane}, {when}.', { name, lane: laneText, when })
    : from !== to && toLane ? t('Moved “{name}” to {lane}.', { name, lane: laneText }) : t(EDIT_MESSAGES[mode], { name, when })];
  // Successors move along as in the Gantt chart, asked once.
  let extra = [];
  if (dated) { S.model = buildModel(); extra = await pushedAlong({ id, start, end }); }
  writeMany([{ id, plan: out }, ...extra], parts.join(' ') + (extra.length ? ' ' + tn(extra.length, '{n} task moved along.', '{n} tasks moved along.') : ''));
}

// ---- the booking grid --------------------------------------------------------------------------------------
/** The grid's columns, and the period column when they come from one. */
function bookPeriods() {
  const by = bookPeriodsBy();
  if (by.startsWith('col:')) { const col = colById(by.slice(4)); return { periods: columnPeriods(col, S.rows, S.labels), periodCol: col, unit: 'column' }; }
  if (by.startsWith('table:')) return { periods: S.periodTable ? tablePeriods(S.periodTable.rows, S.periodTable.columns) : [], periodCol: null, unit: 'table' };
  const r = bookingRange(datedTasks(), by, todayDay());
  return { periods: calendarPeriods(by, r.from, r.to, weekStart()), periodCol: null, unit: by };
}

function recomputeBooking() {
  const res = bookResCol();
  S.built = buildTasks(S.rows, { roles: S.roles, columns: S.columns, labels: S.labels, calendar: calendar(), settings: { ...S.gantt, colourBy: colourByCol()?.id || null, autoColour: false } });
  const { periods, periodCol, unit } = res ? bookPeriods() : { periods: [] };
  if (!res || !S.roles.title || (!periodCol && !ganttReady(S.roles))) {
    S.built = null;
    drawToolbar(null, 'switch');
    emptyState(!res ? t('Which column holds the resource?') : t('Which column says when?'), !res
      ? t('The booking grid has a row for each room, store, flat or person: a Reference, Choice or Text column such as Room. Pick it in Settings.')
      : t('Each booking needs dates, or a column naming its period (a Weekend column with Weekend 1, 2, 3). Pick them in Settings.'));
    return;
  }
  const all = [...S.built.tasks, ...S.built.unscheduled];
  // People on a plan overlap all the time; a room, a store or a flat cannot be let twice.
  const g = buildBooking(all, S.rows, { resourceCol: res, periods, periodCol, labels: S.labels, keep: bookKeep(), clashes: res.id !== S.roles.assignee });
  S.bookModel = { ...g, periods, periodCol, unit };
  drawToolbar();
  const v = ensureBooking();
  const editable = canEdit();
  const lab = bookLabelCol();
  const labelOf = (task) => (lab ? cellText(rowById(task.id) || {}, lab, S.labels, fmtShort) : task.title) || '';
  const sig = ['k', res.id, unit, periods.length && periods[0].key, periods.length, S.selectedId, editable, lab?.id, todayDay(), S.view.bookFilter,
    g.free.join(','), ...g.resources.map((r) => `${r.key}|${r.label}|${r.tracks}|` + r.items.map((it) => `${it.task.id}@${it.first}-${it.last}/${it.track}${it.clash ? '!' : ''}\u0002${it.task.hash}`).join('\u0003'))].join('\n');
  if (sig === S.signature) return;
  S.signature = sig;
  v.update({
    resources: g.resources, periods, free: g.free, unit, mode: periodCol ? 'column' : 'dates', today: todayDay(),
    editable: editable && !res.isFormula, canBook: editable && !res.isFormula && (periodCol ? !periodCol.isFormula : true),
    selectedId: S.selectedId, resourceLabel: res.label, noneLabel: t('No {col}', { col: res.label }), locale: dateLocale(gristCulture()), labelOf,
  }, { first: S.firstDraw, startAt: startPeriod(g, periods) });
  S.firstDraw = false;
}

/**
 * The column the grid opens at: today's, when bookings lie near it; otherwise the start of the latest
 * booking (an archive of leases that ended years ago opens where they are, not on empty months).
 */
function startPeriod(g, periods) {
  const today = todayDay();
  const ti = periods.findIndex((p) => p.start != null && today >= p.start && today <= p.end);
  const firsts = g.resources.flatMap((r) => r.items.map((it) => it.first));
  if (!firsts.length) return Math.max(0, ti);
  if (ti >= 0 && g.resources.some((r) => r.items.some((it) => it.last >= ti - 6 && it.first <= ti + 6))) return ti;
  return ti >= 0 ? Math.max(...firsts) : 0;
}

/** A booking dragged to another cell. */
function moveBooking({ id, from, to, first, period }) {
  const m = S.bookModel;
  const task = taskById(id), row = rowById(id);
  if (!m || !task || !row || !canEdit()) return;
  const fromRes = m.resources.find((r) => r.key === from), toRes = m.resources.find((r) => r.key === to);
  const item = fromRes?.items.find((it) => it.task.id === id && it.first === first);
  if (!item || !toRes) return;
  const plan = planBookingMove(task, row, { item, from: fromRes, to: toRes, period }, { resourceCol: bookResCol(), periods: m.periods, periodCol: m.periodCol, edit: ctx() });
  if (plan.error) {
    S.signature = '';
    recompute();
    toast(plan.error === 'datesFormula' ? t('These dates come from formulas, so they can’t be changed here.') : t('That column is a formula, so the booking can’t be moved there.'));
    return;
  }
  if (!Object.keys(plan.fields).length) return;
  if (id !== S.selectedId) { S.selectedId = id; if (S.live) moveCursor(id).catch(() => {}); }
  const p = m.periods[period];
  const where = m.periodCol ? String(p.label) : fmtRange(p.start, p.end);
  writeMany([{ id, plan }], t('Moved “{name}” to {res}, {period}.', { name: task.title || t('(no name)'), res: toRes.none ? t('No {col}', { col: bookResCol().label }) : String(toRes.label), period: where }));
}

/** A free cell clicked: a new booking there, then its quick edit to fill in who. */
async function bookCell({ resource, period }) {
  const m = S.bookModel;
  const res = m?.resources.find((r) => r.key === resource);
  const p = m?.periods[period];
  if (!res || !p || !canEdit()) return;
  const link = await linkForNewTask();
  const plan = newBookingFields(res, p, {
    resourceCol: bookResCol(), periodCol: m.periodCol, edit: ctx(), titleCol: colById(S.roles.title), title: t('New booking'),
    link: link && !link.unknown ? link : null,
  });
  const note = link?.unknown ? t('This task will show here once its {col} matches the row selected in the linked widget.', { col: link.unknown.label }) : null;
  if (S.demo) {
    const id = Math.max(0, ...S.rows.map((r) => r.id)) + 1;
    S.rows = [...S.rows, { id, ...Object.fromEntries(S.columns.map((c) => [c.id, null])), ...plan.patch }];
    S.signature = '';
    S.selectedId = id;
    recompute();
    openQuick(id, note);
    return;
  }
  try {
    const r = await apply([['AddRecord', S.tableId, null, plan.fields]]);
    const id = r?.retValues?.[0];
    if (!id) return;
    S.selectedId = id;
    S.pendingEdit = { id, note };
    moveCursor(id).catch(() => {});
    if (rowById(id)) openPending();
  } catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); }
}

// ---- the workload ------------------------------------------------------------------------------------------
function recomputeWorkload() {
  const person = wlRowCol();
  if (!ganttReady(S.roles) || !person) {
    S.built = null;
    drawToolbar(null, 'switch');
    if (!person) emptyState(t('Whose work is it?'), t('The workload has a row for each person: the column that says who a task is assigned to, such as Owner. Pick it as “Assigned to” in Settings.'));
    else emptyState(t('Which columns hold the dates?'), t('Plan Studio draws each task from a name and a date. Pick the columns in Settings.'));
    return;
  }
  const cal = calendar();
  S.built = buildTasks(S.rows, { roles: S.roles, columns: S.columns, labels: S.labels, calendar: cal, settings: { ...S.gantt, colourBy: colourByCol()?.id || null } });
  const unit = wlUnit();
  const today = todayDay();
  const r = bookingRange(datedTasks(), unit, today);
  const periods = calendarPeriods(unit, r.from, r.to, weekStart());
  const measure = wlMeasure();
  const range = { from: periods[0].start, to: periods[periods.length - 1].end };
  // time is logged on undated tasks too, so the logged hours look at every task
  const wl = buildWorkload(measure === 'logged' ? [...S.built.tasks, ...S.built.unscheduled] : S.built.tasks, S.rows, { ...wlContext(person, measure), ...range });
  const plan = measure === 'logged' ? buildWorkload(S.built.tasks, S.rows, { ...wlContext(person), ...range }) : null;
  const rowOf = new Map(wl.people.map((p, i) => [p.key, i]));
  const periodOf = (day) => periods.findIndex((p) => day >= p.start && day <= p.end);
  // Overloads ahead are what Level acts on: in the plan, or in what remains. Logged hours are history.
  const ahead = measure === 'logged' ? [] : wl.overs.filter((o) => o.day >= today);
  const totals = wl.people.map((p) => periodTotals(p, periods, wl.from));
  // What remains has nothing before today: a period with no working hours left (last week, this week on
  // a Sunday) is left blank, not marked as days off.
  const gone = periods.map((p, i) => measure === 'remaining' && p.start < today && totals.every((x) => !x[i].cap && x[i].load <= 0.004));
  const people = wl.people.map((p, ri) => {
    const planned = plan?.people.find((x) => x.key === p.key);
    return {
      key: p.key, label: p.label, colour: p.colour, none: p.none, perDay: p.perDay,
      totals: totals[ri].map((x, i) => (gone[i] ? { ...x, off: false } : x)),
      planned: planned ? periodTotals(planned, periods, plan.from).map((x) => x.load) : null,
      overDays: ahead.filter((o) => o.key === p.key).length, src: p,
    };
  });
  S.wlModel = { wl, measure, periods, unit, people, ahead, missing: wl.missing, cellOf: (o) => ({ ri: rowOf.get(o.key), pi: periodOf(o.day) }) };
  drawToolbar();
  const v = ensureWorkload();
  showHoursHint(measure !== 'logged' && !effortCol());
  showNoTimeHint(measure === 'logged' && !people.some((p) => p.totals.some((x) => x.load > 0.004)));
  const sig = ['w', person.id, unit, measure, periods[0].key, periods.length, S.selectedId, S.workload.hoursPerDay, todayDay(), dateLocale(gristCulture()),
    ...people.map((p) => `${p.key}|${p.label}|${p.perDay}|` + p.totals.map((x) => `${Math.round(x.load * 10)}/${x.cap == null ? '-' : Math.round(x.cap * 10)}`).join(','))].join('\n');
  if (sig === S.signature) return;
  S.signature = sig;
  const team = teamTotals(wl.people.filter((p) => !p.none), periods, wl.from);
  v.update({
    people, periods, unit, team, today, measure, gone, selectedId: S.selectedId, rowLabel: person.label, noneLabel: t('Not assigned'), locale: dateLocale(gristCulture()),
    workdays: unit === 'day' ? periods.map((p) => cal.isWork(p.start)) : null,
    tasksAt: (ri, pi) => tasksIn(people[ri].src, periods[pi]),
    locate: (id) => {
      for (let ri = 0; ri < people.length; ri++) {
        const it = people[ri].src.items.find((x) => x.task.id === id);
        if (it) { const pi = periodOf(it.days.find((d) => d >= today) ?? it.days[0]); if (pi >= 0) return { ri, pi }; }
      }
      return null;
    },
  }, { first: S.firstDraw, startAt: Math.max(0, periodOf(today)) });
  S.firstDraw = false;
}

// ---- the calendar (M12) ------------------------------------------------------------------------------------
// A month or a week of the table's dates, on the same mapping as the Gantt chart. A bar dragged to another day
// moves the task there through the same planDates, so a due-only task, a duration and a formula behave as in the
// Gantt chart; what waits for it is asked about as the Gantt chart asks.
const MONTH_TRACKS = 3;    // bars a month's day has room for; the rest are counted, and a click opens the week
const calMode = () => (S.view.calMode === 'week' ? 'week' : 'month');
const calFormats = new Map();
function calFormat(kind) {
  const loc = dateLocale(gristCulture());
  const key = loc + '|' + kind;
  if (!calFormats.has(key)) {
    const shape = { month: { month: 'long', year: 'numeric' }, wd: { weekday: 'short' }, long: { weekday: 'long', day: 'numeric', month: 'long' }, num: { day: 'numeric' }, first: { day: 'numeric', month: 'short' }, range: { day: 'numeric', month: 'short', year: 'numeric' } }[kind];
    calFormats.set(key, new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...shape }));
  }
  return calFormats.get(key);
}
const rangeText = (a, b) => (a === b ? fmtShort(a) : fmtShortRange(a, b));
function calNav(dir) {
  const here = S.calDay ?? todayDay();
  S.calDay = calMode() === 'month' ? addMonths(here, dir) : here + 7 * dir;
  S.signature = '';
  recompute();
}
const calTitle = (mode, grid) => (mode === 'month' ? calFormat('month').format(dateFromDay(grid.month.first))
  : typeof calFormat('range').formatRange === 'function' ? calFormat('range').formatRange(dateFromDay(grid.from), dateFromDay(grid.to)) : fmtShortRange(grid.from, grid.to));
function recomputeCalendar() {
  if (!ganttReady(S.roles)) {
    S.built = null;
    drawToolbar(null, 'switch');
    emptyState(t('Which columns hold the dates?'), t('Plan Studio draws each task from a name and a date. Pick the columns in Settings.'));
    return;
  }
  const cal = calendar();
  S.built = buildTasks(S.rows, { roles: S.roles, columns: S.columns, labels: S.labels, calendar: cal, settings: { ...S.gantt, colourBy: colourByCol()?.id || null } });
  const mode = calMode(), today = todayDay(), anchor = S.calDay ?? today;
  const grid = buildCalGrid(S.built.tasks, { mode, anchor, weekStart: weekStart(), maxTracks: mode === 'month' ? MONTH_TRACKS : Infinity });
  S.calModel = { grid, mode, anchor };
  drawToolbar();
  const v = ensureCalendar();
  const editable = canEdit();
  const sig = ['k', mode, grid.from, S.selectedId, today, dateLocale(gristCulture()), editable, S.holidayDays.size, S.gantt.holidays,
    ...grid.weeks.map((w) => w.segments.map((s) => s.task.id + '|' + s.task.hash + '|' + s.task.finished + '|' + s.col0 + '|' + s.col1 + '|' + s.track).join(',') + '/' + w.more.join(''))].join('\n');
  if (sig === S.signature) return;
  S.signature = sig;
  const c = ctx();
  v.update({
    grid, mode, maxTracks: MONTH_TRACKS, today, selectedId: S.selectedId,
    title: calTitle(mode, grid),
    weekdays: grid.weeks[0].days.map((d) => calFormat('wd').format(dateFromDay(d))),
    canDrag: (task) => editable && capabilities(task, c).move,
    isOff: (d) => !cal.isWork(d),
    dayText: (d, first) => (first ? calFormat('first') : calFormat('num')).format(dateFromDay(d)),
    dayLabel: (d) => calFormat('long').format(dateFromDay(d)),
    describe: (task) => describeTask(task.id),
    meta: (task) => [task.people.join(', '), task.status].filter(Boolean).join(' · '),
    fmtRange: rangeText, fmtDay: fmtShort,
  });
}
/** A bar dragged to another day (or moved with Alt + arrows): the task keeps its length and moves `delta` days. */
async function moveCalendar({ id, delta }) {
  const task = taskById(id);
  if (!task || !delta || task.start == null) return;
  const why = readOnlyWhy();
  if (why) { toast(why); S.signature = ''; recompute(); return; }
  // what waits for the task is found on the Gantt chart's model, as the booking grid does it
  S.model = buildModel();
  await editDates({ id, mode: 'move', start: task.start + delta, end: task.end + delta });
}

// ---- the agenda (M11) --------------------------------------------------------------------------------------
// Open tasks (or bookings) by the day they next need someone. "Mine" is the person this browser said it
// is, the same answer the timer uses; a table without people has no such choice.
const isDoable = () => !!(S.roles.done || S.roles.status || S.roles.progress);
const knowsMe = () => !!(S.me && timePeople().some((p) => p.value === S.me));
/** Mine or Everyone: what this browser chose, else Mine once it knows who it is; null when the tasks have no people. */
function agendaWho() {
  if (!timePeople().length) return null;
  if (S.view.agendaWho) return S.view.agendaWho === 'mine' && !knowsMe() ? 'all' : S.view.agendaWho;
  return knowsMe() ? 'mine' : 'all';
}
async function setAgendaWho(v) {
  if (v === 'mine' && !knowsMe()) {
    const me = await chooseMe(null, t('Whose tasks?'), t('Plan Studio remembers this in this browser, so Mine shows your tasks and the timer is yours.'));
    if (!me) return;
  }
  S.view.agendaWho = v;
  saveView();
  S.signature = '';
  recompute();
}
const wdFormats = new Map();
/** "Fri 6 Nov" */
function fmtDayWd(d) {
  const loc = dateLocale(gristCulture());
  if (!wdFormats.has(loc)) wdFormats.set(loc, new Intl.DateTimeFormat(loc, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }));
  return wdFormats.get(loc).format(dateFromDay(d));
}
function recomputeAgenda() {
  if (!S.roles.title) {
    S.built = null;
    drawToolbar(null, 'switch');
    emptyState(t('Which column holds the task names?'), t('The agenda lists each task by name and date. Pick the columns in Settings.'));
    return;
  }
  const cal = calendar();
  S.built = buildTasks(S.rows, { roles: S.roles, columns: S.columns, labels: S.labels, calendar: cal, settings: { ...S.gantt, colourBy: colourByCol()?.id || null } });
  const today = todayDay();
  const who = agendaWho();
  const me = who === 'mine' ? timePeople().find((p) => p.value === S.me)?.label ?? null : null;
  const doable = isDoable();
  const ag = buildAgenda(S.built.tasks, S.built.unscheduled, { today, weekStart: weekStart(), doable, keep: me != null ? (x) => x.people.includes(me) : null });
  S.agendaModel = { ag, today, who, doable };
  drawToolbar();
  const v = ensureAgenda();
  const empty = ag.open ? null : me != null
    ? { title: t('Nothing for {name}', { name: me }), body: t('No open task is assigned to {name}. Switch to Everyone to see the rest.', { name: me }) }
    : { title: t('Nothing to do'), body: t('Tasks that are not done show up here, under the day they need someone.') };
  const sig = ['a', who, me, doable, S.selectedId, today, dateLocale(gristCulture()),
    ...ag.groups.map((g) => g.id + ':' + g.items.map((i) => i.task.id + '|' + i.task.hash + '|' + i.day + '|' + i.late).join(','))].join('\n');
  if (sig === S.signature) return;
  S.signature = sig;
  v.update({ groups: ag.groups, selectedId: S.selectedId, fmtDay: fmtDayWd, empty });
}

// ---- add to calendar (M11) -----------------------------------------------------------------------------------
// A calendar file for one task, or for the dates the agenda shows. A task that can be finished goes in as its
// deadline (the day it must be done); a booking, which cannot, as the days it runs. The reminder is chosen
// first, and is timed from the start of that first day.
const ALARMS = [['eve', 'At 9:00 the day before', 900], ['day', 'At 9:00 on the day', -540], ['three', 'At 9:00, three days before', 3780], ['none', 'No reminder', null]];
async function exportCalendar(ids = null) {
  const doable = isDoable();
  const list = ids
    ? ids.map((id) => taskById(id)).filter((x) => x && x.start != null)
    : (S.agendaModel?.ag.groups || []).filter((g) => g.id !== 'late' && g.id !== 'undated').flatMap((g) => g.items.map((i) => i.task));
  if (!list.length) { toast(t('There is no dated task to add.')); return; }
  const day = (x) => (doable ? x.end : x.start);
  const choice = await chooseBox(shell, {
    title: t('Add to calendar'),
    body: list.length === 1
      ? t('A calendar file with “{name}”, {date}. Open it and your calendar app adds it.', { name: list[0].title || t('(no name)'), date: fmtShort(day(list[0])) })
      : tn(list.length, 'A calendar file with this date. Open it and your calendar app adds it.', 'A calendar file with these {n} dates. Open it and your calendar app adds them.'),
    label: t('Remind me'), options: ALARMS.map(([value, label]) => ({ value, label: t(label) })), value: 'eve', ok: t('Download'),
  });
  if (!choice) return;
  const alarm = ALARMS.find((a) => a[0] === choice)[2];
  const events = list.map((x) => ({
    uid: `${S.tableId || 'demo'}-${x.id}@plan-studio.anupress.com`, title: x.title || t('(no name)'), start: day(x), end: x.end,
    description: [doable && x.start !== x.end ? t('Planned {range}', { range: fmtShortRange(x.start, x.end) }) : null, x.status, x.people.join(', ') || null].filter(Boolean).join('\n'),
    alarm,
  }));
  const title = printTitle();
  const url = URL.createObjectURL(new Blob([toIcs(events, { now: nowSecs(), name: title || null })], { type: 'text/calendar;charset=utf-8' }));
  const a = el('a', { href: url, download: fileName([title, t('Calendar')].filter(Boolean).join(' ')) + '.ics' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(tn(events.length, 'Calendar file with {n} event downloaded.', 'Calendar file with {n} events downloaded.'));
}

// ---- email reminders (M11) -----------------------------------------------------------------------------------
async function openRemindersPanel() {
  if (dialogOpen) return;
  dialogOpen = true;
  const who = colById(S.roles.assignee);
  const peopleTable = who && (who.kind === 'Ref' || who.kind === 'RefList') ? who.refTable : null;
  let table = null;
  if (peopleTable) table = S.live ? await loadTable(peopleTable).catch(() => null) : S.peopleTable;
  const email = table ? detectEmailColumn(table.columns, table.rows) : null;
  const nameCol = who?.visibleColId || table?.columns.find((c) => c.kind === 'Text' && c.id !== email?.id)?.id || null;
  const api = (await docAddress().catch(() => null)) || 'https://docs.getgrist.com/api/docs/YOUR-DOCUMENT-ID';
  const loc = dateLocale(gristCulture());
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', month: 'short' }).format(new Date(Date.UTC(2026, i, 1))));
  const cols = (id) => (id && colById(id) ? id : null);
  const progressCol = colById(S.roles.progress);
  const words = {
    subjectOne: t('{n} task needs your attention'), subjectMany: t('{n} tasks need your attention'),
    hello: t('Hello {name},'), helloAll: t('Hello,'),
    late: t('Late:'), today: t('Due today:'), tomorrow: t('Due tomorrow:'), soon: t('Due in the next {n} days:'),
    lateBy: t('{n} days late'), lateByOne: t('1 day late'), due: t('due {date}'),
    open: t('Open the plan: {url}'), footer: t('Sent every morning at {hour}:00 by your Plan Studio reminder script.'),
  };
  const tasks = {
    table: S.tableId || SAMPLE_TABLE, title: cols(S.roles.title), start: cols(S.roles.start), end: cols(S.roles.end), due: cols(S.roles.due),
    done: colById(S.roles.done)?.kind === 'Bool' ? S.roles.done : null, status: cols(S.roles.status), progress: progressCol ? S.roles.progress : null,
    person: cols(S.roles.assignee), endInclusive: S.gantt.endInclusive !== false,
    progressFull: progressCol ? progressScale(S.rows.map((r) => num(r[progressCol.id]))) : 1,
  };
  openReminders(shell, {
    people: email ? { table: peopleTable } : null, peopleTable, days: 3, hour: 7,
    build: ({ sendTo, days, hour }) => reminderScript({
      api, docUrl: api.replace('/api/docs/', '/doc/'), docName: printTitle(), tasks,
      people: table ? { table: peopleTable, name: nameCol, email: email?.id || null } : null,
      sendTo, daysAhead: days, hour, months, dayPattern: /^de\b/i.test(loc) ? '{d}. {m}' : '{d} {m}', words,
    }),
  }, { onClose: () => { dialogOpen = false; } });
}

// ---- saved views (M12) -------------------------------------------------------------------------------------
// A name for how the widget is set up now: the view, the zoom and this browser's choices for it (grouping,
// lane column, rows and periods, Mine…). Saved in the widget's options, so everyone who opens the page sees
// them; applying one changes only this browser's state, as the toolbar would.
let viewsPanel = null;
const viewsState = () => ({ views: S.savedViews, canSave: canEdit() || S.demo, full: S.savedViews.length >= MAX_VIEWS });
const currentSnapshot = () => snapshotView({ mode: S.mode, zoom: S.zoom, view: S.view });
const modeName = (mode) => t(VIEW_NAMES[mode] || 'Gantt chart');

/** Change the list of saved views with `op` (views -> {views, replaced} | null), on the latest the document has. */
async function editViews(op, message) {
  let raw = null, base = S.savedViews;
  if (S.live) { raw = await getOptions().catch(() => S.options); base = readOptions(raw).views; }
  const out = op(base);
  if (!out) return false;
  if (S.live) {
    if (!canEdit()) { toast(t('Only people who can edit this document can save views.')); return false; }
    try {
      const next = writeOptions(raw, { views: out.views });
      await setOptions(next);
      S.options = next;
    } catch (e) { toast(t('Could not save: {msg}', { msg: errText(e) })); return false; }
  }
  S.savedViews = out.views;
  viewsPanel?.refresh(viewsState());
  drawToolbar(S.mode === 'gantt' ? S.model : null);
  toast(typeof message === 'function' ? message(out) : message, base.length && out.views.length < base.length ? { label: t('Undo'), run: () => editViews(() => ({ views: base }), t('Brought the view back.')) } : null);
  return true;
}
const viewId = () => 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

function openViewsPanel() {
  if (dialogOpen) return;
  dialogOpen = true;
  viewsPanel = openViews(shell, { ...viewsState(), modeLabel: modeName }, {
    onApply: (id) => applySavedView(id),
    onSave: async (name) => {
      if (S.savedViews.length >= MAX_VIEWS && !S.savedViews.some((v) => v.name.toLowerCase() === name.trim().toLowerCase())) { toast(t('That is as many views as fit. Delete one to save another.')); return false; }
      return editViews((views) => withView(views, name, currentSnapshot(), viewId), (out) => (out.replaced ? t('Replaced the view “{name}”.', { name: name.trim() }) : t('Saved the view “{name}”.', { name: name.trim() })));
    },
    onUpdate: (id) => editViews((views) => ({ views: views.map((v) => (v.id === id ? { ...v, ...currentSnapshot() } : v)) }), t('Updated the view with how it is now.')),
    onDelete: (id) => editViews((views) => ({ views: views.filter((v) => v.id !== id) }), t('Deleted the view.')),
    onClose: () => { viewsPanel = null; dialogOpen = false; },
  });
}

function applySavedView(id) {
  const v = S.savedViews.find((x) => x.id === id);
  if (!v) return;
  const keep = S.view.collapsed;
  S.view = { ...S.view, ...Object.fromEntries(Object.entries(v.view)), collapsed: keep, critical: v.view.critical === true };
  if (v.zoom) { S.zoom = v.zoom; rememberZoom(S.tableId, v.zoom); }
  saveView();
  S.mode = fitsScreen(v.mode);
  rememberMode(S.tableId, S.opensAs, S.mode);
  S.signature = '';
  S.firstDraw = true;
  reload('tables');
  toast(S.mode !== v.mode ? t('View “{name}”. The calendar needs a wider screen, so this is the agenda.', { name: v.name }) : t('View “{name}”.', { name: v.name }));
}

/** Level: the moves that take people under capacity, shown first, written as one action. */
async function levelNow() {
  const person = wlRowCol();
  if (!S.wlModel || !person || !(canEdit() || S.demo)) return;
  const cal = calendar();
  const c = ctx();
  const dueCol = colById(S.roles.due);
  const r = levelPlan(S.built.tasks, S.rows, {
    ...wlContext(person, S.wlModel.measure === 'remaining' ? 'remaining' : 'planned'), links: linksOf(S.built.tasks), today: todayDay(),
    shiftEnd: (task, start) => (cal.workdays ? cal.endAfter(start, cal.length(task.start, task.end)) : start + (task.end - task.start)),
    beforeDay: (day) => cal.shift(day, -1),
    canMove: (task) => capabilities(task, c).move,
    dueOf: (task) => (dueCol && task.endFrom === 'end' ? dayOf(rowById(task.id)?.[dueCol.id], dueCol.type) : null),
  });
  const items = [];
  for (const m of r.moves) {
    const task = taskById(m.id), row = rowById(m.id);
    const plan = task && row ? planDates(task, row, c, 'move', m.start, m.end) : { error: 'gone' };
    if (!plan.error) items.push({ id: m.id, plan, m, task });
  }
  const stuckNote = r.stuck.length ? tn(r.stuck.length, '{n} task can’t move without moving others or the end of the plan.', '{n} tasks can’t move without moving others or the end of the plan.') : null;
  if (!items.length) {
    toast(t('Nothing can move inside its slack: every overloaded task has started, is fixed, or has a task waiting for it.') + (stuckNote ? ' ' + stuckNote : ''));
    return;
  }
  const shown = items.slice(0, 40).map(({ task, m }) => [task.title || t('(no name)'), `${fmtShortRange(m.was.start, m.was.end)} → ${fmtShortRange(m.start, m.end)}`]);
  const yes = await confirmBox(shell, {
    title: tn(items.length, 'Move {n} task later?', 'Move {n} tasks later?'),
    body: r.after
      ? t('Days over capacity from today on: {before} now, {after} after these moves.', { before: r.before, after: r.after })
      : t('Days over capacity from today on: {before} now, none after these moves.', { before: r.before }),
    items: shown,
    note: [items.length > shown.length ? tn(items.length - shown.length, 'And {n} more.', 'And {n} more.') : null,
      t('Each task keeps its length and stays before anything that waits for it. One Undo takes it all back.'), stuckNote].filter(Boolean).join(' '),
    ok: tn(items.length, 'Move {n} task', 'Move {n} tasks'),
  });
  if (!yes) return;
  writeMany(items.map(({ id, plan }) => ({ id, plan })), tn(items.length, 'Moved {n} task later to level the workload.', 'Moved {n} tasks later to level the workload.'));
}

let pending = 0;
const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; recompute(); }); };

// ---- selection, zoom, folding --------------------------------------------------------------------------
function select(id, { tellGrist = false, reveal = true } = {}) {
  if (id === S.selectedId) { if (reveal) current()?.reveal(id); return; }
  S.selectedId = id;
  recompute();
  if (reveal) current()?.reveal(id);
  if (tellGrist && S.live) moveCursor(id).catch(() => {});
  announce(describeTask(id));
}

/** "Copywriting, 6 – 21 Oct, Doing, Chloé": what a screen reader hears for a selected task. */
function describeTask(id) {
  const x = taskById(id);
  if (!x) return '';
  const when = x.start == null ? t('No dates') : x.start === x.end ? fmtShort(x.start) : fmtShortRange(x.start, x.end);
  return [x.title || t('(no name)'), when, x.status, x.people?.join(', '), x.done ? t('done') : null].filter(Boolean).join(', ');
}

function setZoom(z, { fit: fitAfter = false } = {}) {
  if (!z) return;
  if (z === S.zoom && !fitAfter) return;
  S.zoom = z;
  S.fitNext = fitAfter;
  rememberZoom(S.tableId, z);
  recompute();
}
function fit() {
  if (S.mode === 'timeline' && timelineView && S.built?.tasks.length) { setZoom(fitZoom(spanOf(S.built.tasks), timelineView.chartWidth()), { fit: true }); return; }
  if (!S.model?.span || !view) return;
  setZoom(fitZoom(S.model.span, view.chartWidth()), { fit: true });
}
function toggleFold(key) {
  if (S.view.collapsed.has(key)) S.view.collapsed.delete(key); else S.view.collapsed.add(key);
  saveView();
  S.signature = '';
  recompute();
}

// ---- writing -----------------------------------------------------------------------------------------------
const rowById = (id) => S.rows.find((r) => r.id === id) || null;
const taskById = (id) => S.built?.tasks.find((x) => x.id === id) || S.built?.unscheduled.find((x) => x.id === id) || null;
function replaceRow(id, next) { S.rows = S.rows.map((r) => (r.id === id ? next : r)); S.signature = ''; }

/**
 * Write changes to one or more rows as ONE action, so Grist undoes them together. The bars move at
 * once (the rows are patched here) and Grist's own rows replace the patch about 300 ms later; if
 * Grist refuses, every row goes back and the reason is shown.
 * @param items [{id, plan: {fields, patch}}]
 */
async function writeMany(items, message) {
  const steps = [];
  for (const { id, plan } of items) {
    const row = rowById(id);
    if (!row || !Object.keys(plan.fields).length) continue;
    steps.push({ id, fields: plan.fields, before: Object.fromEntries(Object.keys(plan.patch).map((k) => [k, row[k] ?? null])), after: plan.patch });
    replaceRow(id, { ...row, ...plan.patch });
  }
  if (!steps.length) return;
  recompute();
  if (S.demo) {
    demoHistory.undo.push(steps);
    demoHistory.redo.length = 0;
    toast(message, { label: t('Undo'), run: undo });
    return;
  }
  try {
    await apply(steps.map((s) => ['UpdateRecord', S.tableId, s.id, s.fields]));
    toast(message, { label: t('Undo'), run: undo });
  } catch (e) {
    for (const s of steps) { const now = rowById(s.id); if (now) replaceRow(s.id, { ...now, ...s.before }); }
    recompute();
    toast(t('Grist did not accept the change: {msg}', { msg: errText(e) }));
  }
}
const write = (id, plan, message) => writeMany([{ id, plan }], message);

/**
 * The successors a change pushes along (M3): every task that would now start before a task it
 * depends on ends. Asked once, then written with the change itself as one action.
 * @returns {Promise<Array<{id, plan}>>} the extra writes ([] when nothing has to move or the answer is no)
 */
async function pushedAlong(changed, extraLinks = []) {
  const m = S.model;
  if (!m || (!m.links.length && !extraLinks.length)) return [];
  const links = [...m.links, ...extraLinks];
  const tasks = m.dated.filter((x) => !x.summary);
  const push = pushPlan(tasks, links, changed, m.cal);
  if (!push.length) return [];
  const c = ctx();
  const items = [], stuck = [];
  for (const p of push) {
    const task = taskById(p.id), row = rowById(p.id);
    const plan = task && row ? planDates(task, row, c, 'move', p.start, p.end) : { error: 'gone' };
    if (plan.error) stuck.push(task?.title || p.id); else items.push({ id: p.id, plan });
  }
  const name = taskById(changed.id)?.title || t('(no name)');
  const yes = await confirmBox(shell, {
    title: tn(push.length, 'Move the task that depends on “{name}”?', 'Move the {n} tasks that depend on “{name}”?').replace('{name}', name),
    body: (push.length === 1 ? t('It would start before “{name}” ends. Moving it keeps its length.', { name })
      : t('They would start before the work they wait for ends. Moving them keeps their lengths.'))
      + (stuck.length ? ' ' + t('Not movable (their dates are formulas): {list}.', { list: stuck.join(', ') }) : ''),
    ok: push.length === 1 ? t('Move it too') : t('Move them too'),
    cancel: t('Only this one'),
  });
  return yes ? items : [];
}

const EDIT_MESSAGES = {
  move: 'Moved “{name}” to {when}.',
  start: '“{name}” now starts {when}.',
  end: '“{name}” now ends {when}.',
  draw: '“{name}” now runs {when}.',
};
async function editDates({ id, mode, start, end }) {
  const task = taskById(id);
  const row = rowById(id);
  if (!task || !row) return;
  const plan = planDates(task, row, ctx(), mode, start, end);
  if (plan.error) { toast(plan.error === 'endBeforeStart' ? t('The end can’t be before the start.') : t('These dates come from formulas, so they can’t be changed here.')); S.signature = ''; recompute(); return; }
  const when = mode === 'start' ? fmtDay(start) : mode === 'end' ? fmtDay(end) : fmtRange(start, end);
  // The task just edited becomes the selected one, in Grist too: Grist re-sends its own cursor row
  // after every change, and an old cursor would take the selection back (found in M2).
  if (id !== S.selectedId) { S.selectedId = id; if (S.live) moveCursor(id).catch(() => {}); }
  const extra = mode === 'draw' ? [] : await pushedAlong({ id, start, end });
  const message = t(EDIT_MESSAGES[mode], { name: task.title || t('(no name)'), when })
    + (extra.length ? ' ' + tn(extra.length, '{n} task moved along.', '{n} tasks moved along.') : '');
  writeMany([{ id, plan }, ...extra], message);
}

/** A link drawn from one bar to another: `to` starts after `from` ends. */
async function addLink({ from, to }) {
  const m = S.model;
  const a = taskById(from), b = taskById(to);
  if (!a || !b) return;
  if (wouldLoop(m.links, from, to)) { toast(t('That link would make a loop: “{a}” already waits for “{b}”.', { a: a.title, b: b.title })); return; }
  const plan = planLink(rowById(to), ctx(), from);
  if (plan.error === 'already') { toast(t('“{b}” already waits for “{a}”.', { a: a.title, b: b.title })); return; }
  if (plan.error) { toast(t('The “Depends on” column can’t be written here.')); return; }
  const span = (x) => { const s = m.summaries.get(x.id); return s ? { start: s.start, end: s.end } : { start: x.start, end: x.end }; };
  const extra = await pushedAlong({ id: from, ...span(a) }, [{ from, to }]);
  const message = t('“{b}” now starts after “{a}” ends.', { a: a.title, b: b.title })
    + (extra.length ? ' ' + tn(extra.length, '{n} task moved along.', '{n} tasks moved along.') : '');
  writeMany([{ id: to, plan }, ...extra], message);
}

async function removeLink({ from, to }) {
  const a = taskById(from), b = taskById(to);
  if (!a || !b || !canEdit()) return;
  const yes = await confirmBox(shell, {
    title: t('Remove this link?'), body: t('“{b}” will no longer wait for “{a}”. No dates change.', { a: a.title, b: b.title }), ok: t('Remove link'),
  });
  if (!yes) return;
  const plan = planUnlink(rowById(to), ctx(), from);
  if (plan.error) { toast(t('The “Depends on” column can’t be written here.')); return; }
  write(to, plan, t('“{b}” no longer waits for “{a}”.', { a: a.title, b: b.title }));
}

// ---- the board's gestures -------------------------------------------------------------------------------
const laneName = (lane) => (lane.none ? t('No {col}', { col: laneCol()?.label || '' }) : String(lane.label));
let orderHintShown = false;

/** A card dropped at `index` in the lane `toKey` (or moved there with Alt + arrows). */
function moveCard({ id, toKey, index }) {
  const b = S.boardModel;
  const lane = laneCol();
  if (!b || !lane || !canEdit()) { S.signature = ''; recompute(); return; }
  const plan = planCardMove(b, { id, toKey, index }, { laneCol: lane, orderCol: orderCol(), rows: S.rows });
  if (plan.error) {
    S.signature = '';
    recompute();
    if (plan.error === 'noOrder') {
      if (!orderHintShown) toast(t('Cards keep the table’s order. To sort them by hand, choose a number column as “Order in a lane” in Settings.'), { label: t('Settings'), run: () => openColumns('columns') });
      orderHintShown = true;
    } else if (plan.error === 'orderFormula') toast(t('The order column is a formula, so cards can’t be moved up or down here.'));
    else if (plan.error === 'laneFormula') toast(t('“{col}” is a formula, so cards can’t change lanes here.', { col: lane.label }));
    return;
  }
  if (!plan.items.length) return;
  if (id !== S.selectedId) { S.selectedId = id; if (S.live) moveCursor(id).catch(() => {}); }
  const name = taskById(id)?.title || t('(no name)');
  const to = b.lanes.find((l) => l.key === toKey);
  const message = plan.sameLane ? t('Moved “{name}” within {lane}.', { name, lane: laneName(to) })
    : t('Moved “{name}” to {lane}.', { name, lane: laneName(to) })
      + (plan.items.length > 1 ? ' ' + tn(plan.items.length - 1, 'The lane’s order was renumbered ({n} card).', 'The lane’s order was renumbered ({n} cards).') : '');
  writeMany(plan.items, message);
}

/** A card typed into the box at the bottom of a lane. */
async function addCard({ laneKey, title }) {
  const b = S.boardModel;
  const lane = b?.lanes.find((l) => l.key === laneKey);
  if (!lane || !canEdit()) return;
  const link = await linkForNewTask();
  const plan = newCardFields(lane, title, { laneCol: laneCol(), orderCol: orderCol(), titleCol: colById(S.roles.title), link: link && !link.unknown ? link : null });
  if (link?.unknown) toast(t('This task will show here once its {col} matches the row selected in the linked widget.', { col: link.unknown.label }));
  if (S.demo) {
    const id = Math.max(0, ...S.rows.map((r) => r.id)) + 1;
    S.rows = [...S.rows, { id, ...Object.fromEntries(S.columns.map((c) => [c.id, null])), ...plan.patch }];
    S.signature = '';
    recompute();
    return;
  }
  try { await apply([['AddRecord', S.tableId, null, plan.fields]]); }
  catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); }
}

/** The most open cards a lane should hold. Saved with the widget, for everyone. */
async function setLimit(laneKey) {
  const lane = S.boardModel?.lanes.find((l) => l.key === laneKey);
  const col = laneCol();
  if (!lane || !col) return;
  const v = await numberBox(shell, {
    title: t('Limit for {lane}', { lane: laneName(lane) }),
    body: t('When more open cards than this sit in the lane, it says so. Leave the box empty for no limit.'),
    label: t('open cards at most'), value: lane.limit,
  });
  if (v === null) return;
  const wip = { ...S.board.wip };
  const k = col.ref + '|' + laneKey;
  if (v === '') delete wip[k]; else wip[k] = v;
  S.board = { ...S.board, wip };
  S.signature = '';
  recompute();
  if (S.live && canEdit()) {
    const next = writeOptions(S.options, { board: S.board });
    try { await setOptions(next); S.options = next; } catch (e) { toast(t('Could not save: {msg}', { msg: errText(e) })); }
  }
}

// ---- time tracking (M10) ----------------------------------------------------------------------------------
// The time-entries table is found by its columns (a Reference to this task table, a day, and hours or a
// start and an end), or picked in Columns. Its rows are read like the other tables beside the task
// table: on load, after each write, and every 15 seconds, so another person's timer shows up too.
let timeLookedFor = false;
const hasTime = () => !!(S.timeTable && S.timeCols);
const nowSecs = () => Math.floor(Date.now() / 1000);
async function loadTime({ lookAgain = false } = {}) {
  if (S.demo) return;
  if (lookAgain) timeLookedFor = false;
  if (!timeLookedFor) {
    timeLookedFor = true;
    S.timeZone = await docTimeZone();
    if (S.time.table) S.timeTableId = S.time.table;
    else S.timeTableId = findTimeTable(await listTablesWithColumns().catch(() => []), S.tableId)?.id || null;
  }
  S.timeTable = S.timeTableId ? await loadTable(S.timeTableId).catch(() => null) : null;
  S.timeCols = S.timeTable ? (S.time.table === S.timeTableId && S.time.cols) || detectTimeColumns(S.timeTable.columns, S.tableId) : null;
  refreshEntries();
}
function refreshEntries() {
  S.entries = hasTime() ? readEntries(S.timeTable.rows, { cols: S.timeCols, columns: S.timeTable.columns, now: nowSecs(), zone: S.timeZone }) : [];
  S.logged = loggedByTask(S.entries);
}
/** A task's planned hours: its Hours of work (person-days times a working day), or null. */
function plannedOf(id) {
  const c = effortCol(), row = rowById(id);
  const v = c && row ? num(row[c.id]) : null;
  if (v == null || v <= 0) return null;
  return effortUnitOf(c, S.workload.effortUnit) === 'days' ? v * S.workload.hoursPerDay : v;
}
const timeOf = (id) => (hasTime() ? { logged: S.logged.get(id) || 0, planned: plannedOf(id) } : null);
// Logged hours to two decimals, as the entries keep them: a quarter hour is 0.25, and sums add up.
const hourFormats = new Map();
const fmtHours = (h) => {
  const locale = dateLocale(gristCulture());
  if (!hourFormats.has(locale)) hourFormats.set(locale, new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }));
  return hourFormats.get(locale).format(Math.round(h * 100) / 100);
};
/** "12 of 20 hours logged, 8 left": the tooltip's line, or null when nothing is logged. */
function timeText(task) {
  const tm = timeOf(task.id);
  if (!tm || !(tm.logged > 0.004)) return null;
  const H = fmtHours;
  if (!tm.planned) return t('{logged} hours logged', { logged: H(tm.logged) });
  return tm.logged > tm.planned + 0.004
    ? t('{logged} of {planned} hours logged, {over} over the plan', { logged: H(tm.logged), planned: H(tm.planned), over: H(tm.logged - tm.planned) })
    : t('{logged} of {planned} hours logged, {left} left', { logged: H(tm.logged), planned: H(tm.planned), left: H(tm.planned - tm.logged) });
}
/** "1:05": hours and minutes since a start. */
function elapsedText(since) {
  const m = Math.max(0, Math.floor((nowSecs() - since) / 60));
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
}
let tick = 0;
function startTimerTick() {
  if (tick) return;
  // The bar's running time, every 15 s: minutes are what a timesheet counts, so no ticking seconds.
  tick = setInterval(() => { for (const n of toolbar.querySelectorAll('.ps-timer__time')) n.textContent = elapsedText(Number(n.dataset.since)); }, 15000);
}

/** The people a timer can be for: those the tasks are assigned to. */
function timePeople() {
  const who = colById(S.roles.assignee);
  return who ? lanesOf(who, S.rows, S.labels).filter((l) => !l.none).map((l) => ({ value: l.key, label: String(l.label ?? '') })) : [];
}
/** A person (a key of the tasks' people) as the time table's Person cell holds them, or null. */
function entryPerson(key) {
  const col = S.timeCols?.person ? S.timeTable.columns.find((c) => c.id === S.timeCols.person) : null;
  if (!col || !key) return null;
  if (col.kind === 'Ref') { const who = colById(S.roles.assignee); return key.startsWith('r:') && who?.refTable === col.refTable ? key : null; }
  const label = timePeople().find((p) => p.value === key)?.label;
  return label ? 'v:' + label : key.startsWith('v:') ? key : null;
}
const personName = (entryKey) => timePeople().find((p) => entryPerson(p.value) === entryKey)?.label || (entryKey?.startsWith('v:') ? entryKey.slice(2) : '');
const myTimer = () => (hasTime() && S.me !== null ? runningOf(S.entries, entryPerson(S.me)) : null);
/**
 * Who this browser's timers are for: asked the first time, then remembered here (Grist does not tell a
 * widget who is signed in). A table without people, or a Person column it cannot fill, times for no one.
 * @returns {Promise<{ok: boolean, key: string|null}>}
 */
async function whoAmI(taskId) {
  const people = timePeople();
  if (!S.timeCols?.person || !people.length) return { ok: true, key: null };
  if (S.me && people.some((p) => p.value === S.me)) return { ok: true, key: S.me };
  const v = await chooseMe(taskId, t('Who is timing?'), t('Plan Studio remembers this in this browser, so the timer and the timesheet are yours.'));
  return v ? { ok: true, key: v } : { ok: false, key: null };
}
/** Ask which of the people this browser is, and remember it here; null when the question is cancelled. */
async function chooseMe(taskId, title, body) {
  const people = timePeople();
  if (!people.length) return null;
  const task = taskById(taskId);
  const guess = people.find((p) => task?.people?.includes(p.label))?.value || people[0].value;
  const v = await chooseBox(shell, { title, body, label: t('I am'), options: people, value: guess, ok: t('That’s me') });
  if (!v) return null;
  S.me = v;
  rememberMe(S.tableId, v);
  return v;
}

/** Writes to the time table as one action, so one Undo takes them back; the demo keeps them in memory. */
async function writeTime(actions, message) {
  if (S.demo) {
    const steps = [];
    for (const [kind, , id, fields] of actions) {
      if (kind === 'AddRecord') {
        // A new row as Grist makes it: 0 in a Numeric cell, '' in a Text one.
        const blank = (c) => (c.kind === 'Numeric' || c.kind === 'Int' ? 0 : c.kind === 'Text' ? '' : null);
        const row = { id: Math.max(0, ...S.timeTable.rows.map((r) => r.id)) + 1, ...Object.fromEntries(S.timeTable.columns.map((c) => [c.id, blank(c)])), ...fields };
        S.timeTable.rows.push(row);
        steps.push({ table: 'time', add: row });
      } else if (kind === 'RemoveRecord') {
        const row = S.timeTable.rows.find((r) => r.id === id);
        if (!row) continue;
        S.timeTable.rows = S.timeTable.rows.filter((r) => r !== row);
        steps.push({ table: 'time', remove: row });
      } else {
        const row = S.timeTable.rows.find((r) => r.id === id);
        if (!row) continue;
        steps.push({ table: 'time', id, before: Object.fromEntries(Object.keys(fields).map((k) => [k, row[k] ?? null])), after: { ...fields } });
        Object.assign(row, fields);
      }
    }
    demoHistory.undo.push(steps);
    demoHistory.redo.length = 0;
  } else {
    try { await apply(actions); } catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); return false; }
    await loadTime();
  }
  refreshEntries();
  timesheetPanel?.refresh(S.entries);
  S.signature = '';
  recompute();
  toast(message, { label: t('Undo'), run: undo });
  return true;
}
function undoTimeStep(s) {
  if (s.add) S.timeTable.rows = S.timeTable.rows.filter((r) => r.id !== s.add.id);
  else if (s.remove) S.timeTable.rows.push(s.remove);
  else { const row = S.timeTable.rows.find((r) => r.id === s.id); if (row) Object.assign(row, s.before); }
}
function redoTimeStep(s) {
  if (s.add) S.timeTable.rows.push(s.add);
  else if (s.remove) S.timeTable.rows = S.timeTable.rows.filter((r) => r.id !== s.remove.id);
  else { const row = S.timeTable.rows.find((r) => r.id === s.id); if (row) Object.assign(row, s.after); }
}
/** Grist's undo of a time write changes another table, which sends nothing: read it again. */
function timeAfterUndo() {
  if (!S.live || !hasTime()) return;
  setTimeout(() => loadTime().then(() => { timesheetPanel?.refresh(S.entries); S.signature = ''; recompute(); }), 700);
}

async function startTimer(taskId) {
  if (!hasTime() || !(canEdit() || S.demo)) return;
  if (!S.timeCols.start) { toast(t('This time table has no start column, so time can only be logged by hand.')); return; }
  const me = await whoAmI(taskId);
  if (!me.ok) return;
  const person = entryPerson(me.key);
  const running = runningOf(S.entries, person);
  const name = taskById(taskId)?.title || t('(no name)');
  if (running?.task === taskId) { toast(t('Your timer is already running on “{name}”.', { name })); return; }
  const plan = planStart({ taskId, person, now: nowSecs(), today: todayDay(), cols: S.timeCols, columns: S.timeTable.columns, running });
  // The running timer stops in the same action; one started within the minute is taken away instead.
  const stop = !plan.stop ? [] : plan.stop.remove ? [['RemoveRecord', S.timeTableId, plan.stop.id]] : [['UpdateRecord', S.timeTableId, plan.stop.id, plan.stop.fields]];
  const actions = [...stop, ['AddRecord', S.timeTableId, null, plan.add.fields]];
  const was = plan.stop ? taskById(running.task)?.title || t('(no name)') : null;
  await writeTime(actions, was ? t('Timer moved from “{from}” to “{to}”.', { from: was, to: name }) : t('Timer started on “{name}”.', { name }));
}
async function stopTimer() {
  const running = myTimer();
  if (!running) return;
  const plan = planStop(running, { now: nowSecs(), cols: S.timeCols });
  if (plan.remove) { await writeTime([['RemoveRecord', S.timeTableId, running.id]], t('Stopped within a minute, so nothing was logged.')); return; }
  if (!Object.keys(plan.fields).length) return;
  const name = taskById(running.task)?.title || t('(no name)');
  await writeTime([['UpdateRecord', S.timeTableId, running.id, plan.fields]], t('Logged {time} on “{name}”.', { time: elapsedText(running.start), name }));
}
/** Time logged by hand on a task; `entryKey` is the person when the timesheet says who, else this browser's. */
async function logTime(taskId, day = todayDay(), entryKey = undefined) {
  if (!hasTime() || !(canEdit() || S.demo)) return;
  if (!S.timeCols.hours) { toast(t('This time table has no Hours column, so time can only be logged with the timer.')); return; }
  let person = entryKey;
  if (person === undefined) { const me = await whoAmI(taskId); if (!me.ok) return; person = entryPerson(me.key); }
  const name = taskById(taskId)?.title || t('(no name)');
  const who = personName(person);
  const v = await logBox(shell, { title: t('Log time on “{name}”', { name }), body: who ? t('For {who}.', { who }) : t('Hours worked on this task on one day.'), day, isoOf: isoFromDay, dayOf: dayFromISO });
  if (!v) return;
  const plan = planLog({ taskId, person, day: v.day, hours: v.hours, note: v.note, cols: S.timeCols, columns: S.timeTable.columns });
  if (plan.error) return;
  await writeTime([['AddRecord', S.timeTableId, null, plan.fields]], t('Logged {h} h on “{name}”.', { h: fmtHours(v.hours), name }));
}

let timesheetPanel = null;
async function openTimesheetPanel() {
  if (!hasTime() || timesheetPanel) return;
  const assignee = colById(S.roles.assignee);
  // The people table gives each person's hours a week; outside the workload view it is not read yet.
  if (S.live && !S.peopleTable && assignee?.refTable) S.peopleTable = await loadTable(assignee.refTable).catch(() => null);
  if (timesheetPanel) return;
  const locale = dateLocale(gristCulture());
  const F = (o) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o });
  const wd = F({ weekday: 'short' }), dm = F({ day: 'numeric', month: 'short' }), dn = F({ day: 'numeric' });
  const people = timePeople().map((p) => ({ value: entryPerson(p.value), label: p.label })).filter((p) => p.value);
  const cal = calendar();
  const caps = capacityMap(assignee);
  timesheetPanel = openTimesheet(shell, {
    people, person: S.me ? entryPerson(S.me) || '' : '', from: startOfUnit(todayDay(), 'week', weekStart()), entries: S.entries,
    taskTitle: (id) => taskById(id)?.title || '', today: todayDay(), canLog: (canEdit() || S.demo) && !!S.timeCols.hours,
    weekLabel: (from) => t('W{n}', { n: isoWeek(from + 3).week }) + ' · ' + fmtRange(from, from + 6),
    dayLabel: (d) => [wd.format(dateFromDay(d)), dm.format(dateFromDay(d)), dn.format(dateFromDay(d))], hours: fmtHours,
    capacityOf: (key, from) => {
      const perDay = (key?.startsWith('r:') ? caps.get(key) : null) ?? S.workload.hoursPerDay;
      let days = 0;
      for (let d = from; d < from + 7; d++) if (cal.isWork(d)) days++;
      return perDay * days;
    },
  }, {
    onClose: () => { timesheetPanel = null; },
    onLog: async ({ task, day, person }) => {
      let id = task;
      if (id == null) {
        const all = [...(S.built?.tasks || []), ...(S.built?.unscheduled || [])].filter((x) => x.title).sort((a, b) => a.title.localeCompare(b.title));
        const v = await chooseBox(shell, { title: t('Log time on which task?'), body: t('For {who}.', { who: personName(person) }), label: t('Task'),
          options: all.map((x) => ({ value: String(x.id), label: x.title })), ok: t('Next') });
        if (!v) return;
        id = Number(v);
      }
      await logTime(id, day, person);
    },
    onCsv: ({ from, person }) => downloadCsv(from, person),
  });
}

/** The week's entries as CSV, for a spreadsheet: one row per entry, the person's or everyone's. */
function downloadCsv(from, person) {
  const locale = dateLocale(gristCulture());
  const stamp = (secs) => (secs == null ? '' : new Date(secs * 1000).toLocaleString('sv-SE', { timeZone: S.timeZone || 'UTC' }).slice(0, 16));
  const list = S.entries.filter((e) => e.day != null && e.day >= from && e.day <= from + 6 && (!person || e.person === person))
    .sort((a, b) => a.day - b.day || (a.start ?? 0) - (b.start ?? 0));
  const rows = [[t('Date'), t('Person'), t('Task'), t('Hours'), t('Started'), t('Stopped'), t('Note')],
    ...list.map((e) => [isoFromDay(e.day), personName(e.person), taskById(e.task)?.title || '', Math.round(e.hours * 100) / 100, stamp(e.start), e.running ? '' : stamp(e.end), e.note])];
  const url = URL.createObjectURL(new Blob([toCsv(rows, locale)], { type: 'text/csv;charset=utf-8' }));
  const name = [t('Timesheet'), isoFromDay(from), person ? personName(person) : null].filter(Boolean).join(' ');
  const a = el('a', { href: url, download: name + '.csv' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(tn(list.length, 'Downloaded {n} entry.', 'Downloaded {n} entries.'));
}

/** A new time-entries table, after asking: two actions (the table, then what its References show). */
async function setupTime() {
  if (!S.live || !canEdit()) return;
  const who = colById(S.roles.assignee);
  const peopleTable = who && (who.kind === 'Ref' || who.kind === 'RefList') ? who.refTable : null;
  const zone = await docTimeZone();
  const setup = timeTableSetup(t, { taskTable: S.tableId, peopleTable, tables: await listTables().catch(() => []), zone });
  const yes = await confirmBox(shell, {
    title: t('Track time on tasks?'),
    body: t('Plan Studio adds a table {table} with Task, Person, Date, Started, Stopped, Hours and Note: timers and logged hours go there. Grist’s Undo takes it back in two steps.', { table: setup.name }),
    ok: t('Add the table'),
  });
  if (!yes) return;
  try {
    await apply(setup.actions);
    const colRef = await columnRefs();
    const show = timeTableShowActions({ ...setup, taskTable: S.tableId, taskTitle: S.roles.title, peopleTable, peopleShow: who?.visibleColId || null }, { colRef });
    if (show.length) await apply(show);
    await loadTime({ lookAgain: true });
    S.signature = '';
    recompute();
    toast(t('Time tracking is set up. Start a timer from a task’s quick edit (Enter).'));
  } catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); }
}

async function undo() {
  if (S.demo) {
    const steps = demoHistory.undo.pop();
    if (!steps) return;
    for (const s of steps) {
      if (s.table === 'time') { undoTimeStep(s); continue; }
      const row = rowById(s.id); if (row) replaceRow(s.id, { ...row, ...s.before });
    }
    if (steps.some((s) => s.table === 'time')) { refreshEntries(); timesheetPanel?.refresh(S.entries); S.signature = ''; }
    demoHistory.redo.push(steps);
    recompute();
    return;
  }
  if (S.live) await gristUndo().catch((e) => toast(errText(e)));
  timeAfterUndo();
}
async function redo() {
  if (S.demo) {
    const steps = demoHistory.redo.pop();
    if (!steps) return;
    for (const s of steps) {
      if (s.table === 'time') { redoTimeStep(s); continue; }
      const row = rowById(s.id); if (row) replaceRow(s.id, { ...row, ...s.after });
    }
    if (steps.some((s) => s.table === 'time')) { refreshEntries(); timesheetPanel?.refresh(S.entries); S.signature = ''; }
    demoHistory.undo.push(steps);
    recompute();
    return;
  }
  if (S.live) await gristRedo().catch((e) => toast(errText(e)));
  timeAfterUndo();
}

// ---- starter templates and the add-column assistant --------------------------------------------------------
function starterState() {
  S.built = null;
  drawToolbar(null, 'bare');
  dropOthers(null);
  const list = templates(t);
  const hints = { plan: t('Tasks with dates, owners and dependencies: the Gantt chart.'), events: t('Stores by weekend for a market: the booking grid.'), rooms: t('Rooms by day: the booking grid.') };
  clear(stage).appendChild(el('div', { class: 'ps-empty ps-starter' }, [
    el('h2', { text: t('Start a plan') }),
    el('p', { text: t('This table is empty. Plan Studio can set it up as one of these, with a few sample rows you can change or delete.') }),
    el('div', { class: 'ps-starter__list' }, list.map((tpl) => el('button', { type: 'button', class: 'ps-starter__item', onclick: () => applyTemplate(tpl) }, [
      el('span', { class: 'ps-starter__name', text: tpl.label }), el('span', { class: 'ps-starter__hint', text: hints[tpl.id] }),
    ]))),
    el('p', { class: 'ps-starter__or' }, [el('button', { type: 'button', class: 'ps-link', text: t('Or choose the columns yourself'), onclick: () => openColumns('columns') })]),
  ]));
}

async function applyTemplate(tpl) {
  if (!canEdit()) return;
  const tables = await listTables().catch(() => []);
  const { actions, names } = structureActions(tpl, { tableId: S.tableId, columns: S.columns, tables });
  const yes = await confirmBox(shell, {
    title: t('Set up “{name}”?', { name: tpl.label }),
    body: t('This adds {n} columns to {table} and the tables {list}, with a few sample rows. Grist’s Undo takes it back in two steps.',
      { n: tpl.columns.length, table: S.tableId, list: Object.values(names).join(', ') }),
    ok: t('Set it up'),
  });
  if (!yes) return;
  try {
    await apply(actions);
    const colRef = await columnRefs();
    const today = todayDay();
    await apply(dataActions(tpl, { tableId: S.tableId }, names, { colRef }, (n) => (today + n) * 86400));
    // The view it opens in is remembered in this browser, not saved in the widget: saving would be a
    // third undo step, and the confirmation said two.
    S.mode = tpl.opensAs;
    rememberMode(S.tableId, S.opensAs, tpl.opensAs);
    toast(t('“{name}” is set up. Change the sample rows or delete them.', { name: tpl.label }));
    reload('schema');
  } catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); }
}

/** The Columns panel's "Add a column for it": one column of the right type, mapped to the role at once. */
async function addColumnFor(role) {
  const col = columnForRole(role, t, S.tableId);
  if (!col || !canEdit()) return;
  const yes = await confirmBox(shell, {
    title: t('Add the column “{col}”?', { col: col.label }), body: t('Plan Studio adds it to {table} and uses it as {role}. Existing rows stay as they are.', { table: S.tableId, role: col.label }),
    ok: t('Add column'),
  });
  if (!yes) return;
  try {
    const res = await apply([['AddColumn', S.tableId, col.id, { type: col.type, label: col.label, ...(col.widgetOptions ? { widgetOptions: col.widgetOptions } : {}) }]]);
    const made = res?.retValues?.[0] || {};
    const roles = { ...S.roles, [role]: made.colId || col.id };
    const stored = { ...toStored(S.roles, S.columns), [role]: { ref: made.colRef || 0, id: made.colId || col.id } };
    const next = writeOptions(S.options, { storedRoles: stored, gantt: S.gantt });
    await setOptions(next).catch(() => {});
    S.options = next;
    S.roles = roles;
    S.source = { kind: 'saved' };
    toast(t('Added the column “{col}”.', { col: col.label }));
    reload('schema');
  } catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); }
}

// A note above the view, dismissed per table in this browser: the due-date note over the Gantt chart, and the
// workload's note that, with no hours to go on, it counts each task as a full day.
function showBanner(name, on, text, action) {
  const key = 'planStudio.' + name + '.' + (S.tableId || 'demo');
  let bar = stage.querySelector(':scope > .ps-banner');
  let off = false;
  try { off = localStorage.getItem(key) === 'off'; } catch { /* private window */ }
  if (!on || off) { if (bar?.dataset.name === name) { bar.remove(); stage.classList.remove('has-banner'); } return; }
  if (bar?.dataset.name === name) return;
  bar?.remove();
  bar = el('div', { class: 'ps-banner', role: 'note', dataset: { name } }, [
    el('span', { text }),
    action ? el('button', { type: 'button', class: 'ps-btn ps-btn--sm', text: action.label, onclick: action.run }) : null,
    el('button', { type: 'button', class: 'ps-icon-btn ps-banner__close', 'aria-label': t('Close'), text: '×', onclick: () => { try { localStorage.setItem(key, 'off'); } catch { /* fine */ } showBanner(name, false); } }),
  ]);
  stage.prepend(bar);
  stage.classList.add('has-banner');
}
const showDueHint = (on) => showBanner('dueHint', on, t('These tasks have only a due date, so they show as milestones. With a start date they become bars.'),
  { label: t('Add a Start column'), run: () => addColumnFor('start') });
const showHoursHint = (on) => showBanner('hoursHint', on, t('No Hours of work column, so each task counts as a full working day of each of its people.'),
  S.live && canEdit() ? { label: t('Add an Hours column'), run: () => addColumnFor('effort') } : null);
// Logged hours with nothing logged yet: an empty grid would look broken, so it says where time comes from.
const showNoTimeHint = (on) => showBanner('noTimeHint', on, t('Nothing logged in these dates yet. Start a timer from a task’s quick edit (Enter), or log time in the timesheet.'),
  { label: t('Timesheet'), run: () => openTimesheetPanel() });

// ---- print -----------------------------------------------------------------------------------------------
// The printout is built from the model on screen, for paper (print/render.js), into #ps-print, which
// only shows when printing. In a Grist iframe, print() prints this widget alone.
const VIEW_NAMES = { gantt: 'Gantt chart', timeline: 'Timeline', board: 'Board', booking: 'Booking grid', workload: 'Workload', agenda: 'Agenda', calendar: 'Calendar' };
let printing = false;
function startPrint() {
  if (printing || !S.ready) return;
  if (S.mode === 'agenda') { toast(t('The agenda does not print. Switch to the Gantt chart, the board or the workload to print.')); return; }
  printing = true;
  openPrint(shell, { canPages: S.mode === 'gantt' || S.mode === 'timeline' }, {
    onClose: () => { printing = false; },
    onPrint: (o) => printNow(o),
  });
}

const printTitle = () => String(S.tableId || '').replace(/_/g, ' ');

/** The printout of the view on show, or null. */
function printNode({ paper, fit }) {
  const locale = dateLocale(gristCulture());
  const today = todayDay();
  const view = t(VIEW_NAMES[S.mode]);
  const count = (one, many) => tn(S.built.tasks.length + S.built.unscheduled.length, one, many);
  if (S.mode === 'gantt' && S.model) {
    const m = S.model;
    const rows = m.entries.map((e) => {
      if (e.kind === 'group') return { label: e.label || t('(none)'), kind: 'group', bars: Number.isFinite(e.start) ? [{ kind: 'summary', start: e.start, end: e.end, title: '' }] : [] };
      const x = e.task;
      const span = e.summary || x;
      const bars = e.undated ? [] : [{
        kind: e.summary ? 'summary' : x.kind, start: span.start, end: span.end, colour: x.colour, title: x.title || t('(no name)'),
        progress: x.progress, critical: S.view.critical && m.crit.tasks.has(x.id),
      }];
      return { label: x.title || t('(no name)'), depth: e.depth, kind: 'task', sub: e.undated ? t('No dates') : fmtShortRange(span.start, span.end), bars };
    });
    return renderTimePrint({
      title: printTitle(), subtitle: subtitleFor(view, count('{n} task', '{n} tasks'), locale, today),
      nameHeader: colById(S.roles.title)?.label || t('Task'), paper, mode: fit, zoomPx: ZOOMS[S.zoom || 'week'].px, weekStart: weekStart(), locale, today,
      span: m.span || { from: today, to: today + 7 }, rows,
    });
  }
  if (S.mode === 'timeline' && S.tlModel) {
    const lane = tlLaneCol();
    const rows = S.tlModel.lanes.map((l) => ({
      label: l.none ? t('No {col}', { col: lane.label }) : String(l.label ?? ''), kind: 'lane', tracks: l.tracks, sub: String(l.bars.length),
      bars: l.bars.map((b) => ({ kind: b.task.kind === 'milestone' ? 'milestone' : 'bar', start: b.task.start, end: b.task.end, colour: b.task.colour,
        title: b.task.title || t('(no name)'), track: b.track, progress: b.task.progress, clash: b.clash })),
    }));
    return renderTimePrint({
      title: printTitle(), subtitle: subtitleFor(view, tn(S.built.tasks.length, '{n} task', '{n} tasks'), locale, today),
      nameHeader: lane.label, paper, mode: fit, zoomPx: ZOOMS[S.zoom || 'week'].px, weekStart: weekStart(), locale, today,
      span: spanOf(S.built.tasks) || { from: today, to: today + 7 }, rows, labelsInside: true,
    });
  }
  if (S.mode === 'board' && S.boardModel) {
    const lane = laneCol();
    return renderBoardPrint({
      title: printTitle(), subtitle: subtitleFor(view, count('{n} card', '{n} cards'), locale, today), paper,
      lanes: S.boardModel.lanes.map((l) => ({
        name: l.none ? t('No {col}', { col: lane.label }) : String(l.label), colour: l.colour, over: l.over,
        count: l.limit != null ? `${l.open}/${l.limit}` : String(l.cards.length),
        cards: l.cards.map((c) => ({
          title: c.title || t('(no name)'), done: c.done, colour: c.colour, fields: c.fields, people: c.people.join(', '), late: c.late > 0,
          when: [c.due != null ? t('Due {date}', { date: fmtShort(c.due) }) : c.span ? fmtShortRange(c.span[0], c.span[1]) : null,
            c.late > 0 ? tn(c.late, '{n} day late', '{n} days late') : null].filter(Boolean).join(' · '),
        })),
      })),
    });
  }
  if (S.mode === 'booking' && S.bookModel) {
    const b = S.bookModel;
    const res = bookResCol();
    const lab = bookLabelCol();
    const labelOf = (task) => (lab ? cellText(rowById(task.id) || {}, lab, S.labels, fmtShort) : task.title) || t('(no name)');
    const fmt = (o) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o });
    const periodText = (p) => {
      if (b.unit === 'column') return { label: String(p.label) };
      if (b.unit === 'table') return { label: p.label || fmtShortRange(p.start, p.end), sub: p.label ? fmtShortRange(p.start, p.end) : null };
      const d = dateFromDay(p.start);
      if (b.unit === 'day') return { label: fmt({ weekday: 'short', day: 'numeric' }).format(d), sub: fmt({ month: 'short' }).format(d) };
      if (b.unit === 'week') return { label: t('W{n}', { n: isoWeek(p.start + 3).week }), sub: fmt({ day: 'numeric', month: 'short' }).format(d) };
      return { label: fmt({ month: 'short', year: 'numeric' }).format(d) };
    };
    // Days, weeks and months print the booked stretch and one period either side, not the screen's
    // run-up of empty future weeks; a period column or table prints whole.
    const used = b.resources.flatMap((r) => r.items);
    const calendarUnit = b.unit !== 'column' && b.unit !== 'table';
    const lo = calendarUnit && used.length ? Math.max(0, Math.min(...used.map((it) => it.first)) - 1) : 0;
    const hi = calendarUnit && used.length ? Math.min(b.periods.length - 1, Math.max(...used.map((it) => it.last)) + 1) : b.periods.length - 1;
    return renderBookingPrint({
      title: printTitle(), subtitle: subtitleFor(view, count('{n} booking', '{n} bookings'), locale, today), paper,
      resourceHeader: res.label, periods: b.periods.slice(lo, hi + 1).map(periodText), free: b.free.slice(lo, hi + 1),
      resources: b.resources.map((r) => ({
        name: r.none ? t('No {col}', { col: res.label }) : String(r.label), tracks: r.tracks, clashes: r.items.filter((it) => it.clash).length,
        items: r.items.filter((it) => it.last >= lo && it.first <= hi)
          .map((it) => ({ first: Math.max(it.first, lo) - lo, last: Math.min(it.last, hi) - lo, track: it.track, label: labelOf(it.task), clash: it.clash })),
      })),
    });
  }
  if (S.mode === 'calendar' && S.calModel) {
    const { mode, anchor } = S.calModel;
    // a month on paper has room for four bars a day, a week for what fits
    const tracks = mode === 'month' ? 4 : 14;
    const grid = buildCalGrid(S.built.tasks, { mode, anchor, weekStart: weekStart(), maxTracks: tracks });
    const cal = calendar();
    return renderCalendarPrint({
      title: printTitle(), subtitle: subtitleFor(`${t('Calendar')}: ${calTitle(mode, grid)}`, count('{n} task', '{n} tasks'), locale, today), paper,
      weekdays: grid.weeks[0].days.map((d) => calFormat('wd').format(dateFromDay(d))),
      weeks: grid.weeks.map((w) => ({
        tracks: mode === 'month' ? tracks : Math.max(3, w.tracks), more: w.more.map((n) => (n ? t('+{n} more', { n }) : '')),
        days: w.days.map((d, i) => ({
          text: (i === 0 || d === grid.month?.first ? calFormat('first') : calFormat('num')).format(dateFromDay(d)),
          outside: !!grid.month && (d < grid.month.first || d > grid.month.last), off: !cal.isWork(d),
        })),
        segments: w.segments.map((g) => ({
          col0: g.col0, col1: g.col1, track: g.track, title: g.task.title || t('(no name)'), colour: g.task.colour, done: !!g.task.finished,
          milestone: g.task.kind === 'milestone', fromLeft: g.fromLeft, toRight: g.toRight,
        })),
      })),
    });
  }
  if (S.mode === 'workload' && S.wlModel) {
    const w = S.wlModel;
    const locale2 = dateLocale(gristCulture());
    const fmt = (o) => new Intl.DateTimeFormat(locale2, { timeZone: 'UTC', ...o });
    const periodText = (p) => {
      const d = dateFromDay(p.start);
      if (w.unit === 'day') return { label: fmt({ weekday: 'short', day: 'numeric' }).format(d), sub: fmt({ month: 'short' }).format(d) };
      if (w.unit === 'week') return { label: t('W{n}', { n: isoWeek(p.start + 3).week }), sub: fmt({ day: 'numeric', month: 'short' }).format(d) };
      return { label: fmt({ month: 'short', year: 'numeric' }).format(d) };
    };
    // Print where there is work, and a period either side: not the screen's run-up of empty weeks.
    const busy = w.periods.map((_, i) => w.people.some((p) => p.totals[i].load > 0.01));
    const lo = Math.max(0, busy.indexOf(true) - 1);
    const hi = busy.lastIndexOf(true) < 0 ? w.periods.length - 1 : Math.min(w.periods.length - 1, busy.lastIndexOf(true) + 1);
    const which = { logged: t('Hours logged'), remaining: t('Hours remaining') }[w.measure];
    return renderWorkloadPrint({
      title: printTitle(), subtitle: subtitleFor(which ? view + ' · ' + which : view, count('{n} task', '{n} tasks'), locale, today), paper,
      rowHeader: wlRowCol()?.label || '', locale: locale2,
      periods: w.periods.slice(lo, hi + 1).map(periodText),
      people: w.people.map((p) => ({
        name: p.none ? t('Not assigned') : String(p.label ?? ''), perWeek: p.none ? null : p.perDay * 5, overDays: p.overDays,
        cells: p.totals.slice(lo, hi + 1),
      })),
    });
  }
  return null;
}

/** The printout as a PNG file: drawn, then saved like the CSV and the calendar file. */
async function savePng(node) {
  toast(t('Drawing the picture…'));
  try {
    const blob = await nodeToPng(node);
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: fileName([printTitle(), t(VIEW_NAMES[S.mode]), isoFromDay(todayDay())].filter(Boolean).join(' ')) + '.png' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(t('Picture saved.'));
  } catch (e) {
    toast(e?.message === 'big' ? t('This is too large for a picture. Use Print, then Save as PDF.') : t('Your browser would not draw the picture. Use Print, then Save as PDF.'));
  }
}

function printNow(o) {
  printing = false;
  const node = printNode(o);
  if (!node) return;
  if (o.png) { savePng(node); return; }
  let root = document.getElementById('ps-print');
  if (!root) { root = el('div', { id: 'ps-print' }); document.body.appendChild(root); }
  let page = document.getElementById('ps-page');
  if (!page) { page = el('style', { id: 'ps-page' }); document.head.appendChild(page); }
  page.textContent = pageRule(o.paper);
  clear(root).appendChild(node);
  // The printout stays (hidden on screen) until the dialog closes; the next print replaces it.
  window.addEventListener('afterprint', () => clear(root), { once: true });
  setTimeout(() => window.print(), 60);
}
// Ctrl+P in the widget opens this panel: the browser's own would print the screen, cut off and dark.
// ? lists the keys, from anywhere but a text box.
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); startPrint(); return; }
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') && !shell.querySelector('.ps-dialog, .ps-drawer')) {
    e.preventDefault();
    openKeys(shell, S.mode);
  }
});

// ---- quick edit, record card, new tasks ---------------------------------------------------------------------
let dialogOpen = false;
function openQuick(id, note = null) {
  const row = rowById(id);
  if (!row || dialogOpen) return;
  dialogOpen = true;
  select(id, { tellGrist: true });
  // Parent and "Depends on" point at this same table: list the other tasks by name.
  const names = new Map([...(S.built?.tasks || []), ...(S.built?.unscheduled || [])].filter((x) => x.id !== id).map((x) => [x.id, x.title || t('(no name)')]));
  const labels = { ...S.labels };
  for (const role of ['parent', 'dependsOn']) if (S.roles[role]) labels[S.roles[role]] = names;
  openQuickEdit(shell, {
    row, roles: S.roles, columns: S.columns, labels, editable: canEdit(), canOpenCard: S.live, note, booking: S.mode === 'booking',
    calendar: calendarWords(id),
    time: {
      logged: S.logged.get(id) || 0, planned: plannedOf(id), running: myTimer()?.task === id, hours: fmtHours,
      canTrack: hasTime() && (canEdit() || S.demo), canSetup: S.live && canEdit() && !hasTime(),
    },
  }, {
    onCalendar: () => exportCalendar([id]),
    onStartTimer: () => startTimer(id),
    onStopTimer: () => stopTimer(),
    onLogTime: () => logTime(id),
    onSetupTime: () => setupTime(),
    onClose: () => { dialogOpen = false; },   // focus goes back to what opened it (dialog.js trapFocus)
    onOpenCard: () => openCard(id),
    onSave: (plan) => {
      // A rename is in the patch; the task in memory still has the old name.
      const typed = S.roles.title ? plan.fields[S.roles.title] : null;
      // a name that is a Reference (a Participant column) is a row id: say the name it shows
      const shown = typeof typed === 'number' ? S.labels[S.roles.title]?.get(typed) : typed;
      const name = (typeof shown === 'string' && shown) || taskById(id)?.title || t('(no name)');
      write(id, plan, t('Saved “{name}”.', { name }));
    },
  });
}

/** What "Add to calendar" would hold for this task, in words; null for a task without a date. */
function calendarWords(id) {
  const x = taskById(id);
  if (!x || x.start == null) return null;
  return { words: isDoable()
    ? t('A calendar file with the due date, {date}, and a reminder.', { date: fmtShort(x.end) })
    : t('A calendar file with this booking, {date}, and a reminder.', { date: x.start === x.end ? fmtShort(x.start) : fmtShortRange(x.start, x.end) }) };
}

/**
 * Grist's own record card for a task (M0, question 6): it opens for the row under this widget's
 * cursor, and only when the widget's section shows at least one field. A section with none gets the
 * task's name column added to its fields first, once, after asking.
 */
async function openCard(id) {
  if (!S.live) { openQuick(id); return; }
  select(id, { tellGrist: false });
  const own = await loadOwnSection(S.tableId, S.options);
  if (!own) { openQuick(id); return; }
  if (own.fieldCount === 0) {
    const titleCol = S.columns.find((c) => c.id === S.roles.title);
    if (!canEdit() || !titleCol) { openQuick(id); return; }
    const yes = await confirmBox(shell, {
      title: t('Open Grist’s record card?'),
      body: t('Grist opens its card only for a widget that shows at least one column. Plan Studio will add “{col}” to this widget’s fields. Your data does not change.', { col: titleCol.label }),
      ok: t('Add and open'),
    });
    if (!yes) return;
    try { await apply([['AddRecord', '_grist_Views_section_field', null, { parentId: own.id, colRef: titleCol.ref }]]); }
    catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); return; }
  }
  try { await moveCursor(id); await openRecordCard(); }
  catch (e) { toast(t('Grist’s card did not open ({msg}). Here is the quick edit instead.', { msg: errText(e) })); openQuick(id); }
}

/** The value a new task needs to show while this widget is filtered by a linked one (M0, question 4). */
async function linkForNewTask() {
  if (!S.live || !/^Filter:/.test(linkingInfo().asTarget || '')) return null;
  const own = await loadOwnSection(S.tableId, S.options);
  const col = own?.linkTargetColId ? S.columns.find((c) => c.id === own.linkTargetColId) : null;
  if (!col) return null;
  return linkValue(S.rows, col) || { unknown: col };
}

async function newTask() {
  if (!canEdit()) return;
  const link = await linkForNewTask();
  const plan = newTaskFields(ctx(), { day: todayDay(), title: t('New task'), link: link && !link.unknown ? link : null });
  const note = link?.unknown ? t('This task will show here once its {col} matches the row selected in the linked widget.', { col: link.unknown.label }) : null;
  if (S.demo) {
    const id = Math.max(0, ...S.rows.map((r) => r.id)) + 1;
    S.rows = [...S.rows, { id, ...Object.fromEntries(S.columns.map((c) => [c.id, null])), ...plan.patch }];
    S.signature = '';
    S.selectedId = id;
    recompute();
    current()?.reveal(id);
    openQuick(id, note);
    return;
  }
  try {
    const res = await apply([['AddRecord', S.tableId, null, plan.fields]]);
    const id = res?.retValues?.[0];
    if (!id) return;
    S.selectedId = id;
    S.pendingEdit = { id, note };
    moveCursor(id).catch(() => {});
    if (rowById(id)) openPending();
  } catch (e) { toast(t('Grist did not accept the change: {msg}', { msg: errText(e) })); }
}
function openPending() {
  const p = S.pendingEdit;
  if (!p) return;
  S.pendingEdit = null;
  current()?.reveal(p.id);
  openQuick(p.id, p.note);
}

// ---- Columns panel --------------------------------------------------------------------------------------
let mappingOpen = null;
/** The settings panel, on a tab: the one asked for, else the one last used in this browser. */
async function openColumns(tab) {
  if (mappingOpen) return;
  mappingOpen = true;
  const datedTables = S.live ? await listDatedTables().catch(() => []) : [];
  // Tables that can hold time entries for this task table, for the Time tracking section.
  const timeTables = S.live ? (await listTablesWithColumns().catch(() => [])).filter((tb) => tb.id !== S.tableId && detectTimeColumns(tb.columns, S.tableId)).map((tb) => tb.id) : [];
  // The capacity column lives on the people table: read it, if no view has yet.
  if (S.live && !S.peopleTable) { const who = wlRowCol(); if (who?.refTable) S.peopleTable = await loadTable(who.refTable).catch(() => null); }
  mappingOpen = openMapping(shell, {
    tableId: S.tableId, columns: S.columns, roles: S.roles, source: S.source, gantt: S.gantt, canEdit: canEdit() || S.demo,
    board: S.board, booking: S.booking, workload: S.workload, opensAs: S.opensAs, cardFields: fieldCols(null).map((c) => c.id),
    peopleColumns: S.peopleTable?.columns || [], capacityGuess: capacityCol()?.id || null,
    time: S.time, timeTables, timeFound: S.time.table ? null : S.timeTableId, canSetupTime: S.live && canEdit() && !hasTime(),
    canAddColumns: S.live && canEdit(),
    datedTables: datedTables.filter((x) => x !== S.tableId),
    mode: S.mode, tab: typeof tab === 'string' ? tab : storedTab(),
  }, {
    onTab: (id) => rememberTab(id),
    onClose: () => { mappingOpen = null; },
    onAddColumn: (role) => addColumnFor(role),
    onSetupTime: () => setupTime(),
    onReminders: () => openRemindersPanel(),
    onSave: async ({ roles, gantt, board, booking, workload, time, opensAs, language }) => {
      setLanguage(language);
      S.roles = roles;
      S.gantt = gantt;
      S.board = board;
      S.booking = booking;
      S.workload = workload;
      const timeChanged = time.table !== S.time.table;
      S.time = time;
      if (timeChanged) await loadTime({ lookAgain: true });
      if (opensAs !== S.opensAs) { S.opensAs = opensAs; S.mode = resolveMode(); }
      S.source = { kind: 'saved' };
      if (S.live) {
        S.labels = await loadLabels(S.columns, labelRoles()).catch(() => S.labels);
        S.holidayDays = await loadHolidayDays(gantt.holidayTable).catch(() => new Map());
        await loadBookingTables();
        if (canEdit()) {
          const next = writeOptions(S.options, { storedRoles: toStored(roles, S.columns), gantt, board, booking, workload, time, view: opensAs });
          try { await setOptions(next); S.options = next; toast(t('Saved for this widget.')); }
          catch (e) { toast(t('Could not save: {msg}', { msg: errText(e) })); }
        }
      }
      S.signature = '';
      recompute();
    },
  });
}

// ---- loading from Grist ---------------------------------------------------------------------------------
async function loadDocState() {
  S.columns = await loadColumns(S.tableId);
  const opts = readOptions(S.options);
  S.gantt = opts.gantt;
  S.board = opts.board;
  S.booking = opts.booking;
  S.workload = opts.workload;
  S.time = opts.time;
  S.savedViews = opts.views;
  S.me = storedMe(S.tableId);
  timeLookedFor = false;   // a table made or renamed since: look for the time table again
  S.opensAs = opts.view;
  const saved = opts.roles ? fromStored(opts.roles, S.columns, S.tableId) : {};
  if (Object.keys(saved).length) {
    S.roles = saved;
    S.source = { kind: 'saved' };
  } else {
    const d = detectRoles(S.columns, { tableId: S.tableId, foreignMapping: await loadForeignMapping(S.tableId) });
    S.roles = d.roles;
    S.source = d.source;
  }
  S.labels = await loadLabels(S.columns, labelRoles()).catch(() => ({}));
  S.holidayDays = await loadHolidayDays(S.gantt.holidayTable).catch(() => new Map());
  await loadBookingTables();
}

/**
 * The tables beside the task table that the view on show reads: the booking grid's periods table and
 * the table its rows come from (for the filter); the workload's people (for their capacity) and their
 * days off.
 */
async function loadBookingTables() {
  if (S.demo) return;
  if (S.mode === 'booking') {
    const res = bookResCol();
    S.resourceTable = res?.refTable ? await loadTable(res.refTable).catch(() => null) : null;
    S.periodTable = S.booking.periodTable && bookPeriodsBy().startsWith('table:') ? await loadTable(S.booking.periodTable).catch(() => null) : null;
  }
  if (S.mode === 'workload') {
    const who = wlRowCol();
    S.peopleTable = who?.refTable ? await loadTable(who.refTable).catch(() => null) : null;
    S.daysOff = await loadDaysOff(S.gantt.holidayTable).catch(() => ({ refTable: null, days: new Map() }));
  }
  await loadTime();
}

// A column added, removed or renamed shows up as a different set of keys in the rows.
function schemaChanged(rows) {
  if (!rows.length || !S.columns.length) return false;
  const known = new Set(S.columns.map((c) => c.id));
  const keys = Object.keys(rows[0]).filter((k) => k !== 'id');
  return keys.length !== known.size || keys.some((k) => !known.has(k));
}

// A Reference to a row the labels do not have yet (a person added a minute ago): read them again.
function labelsMissing(rows) {
  for (const id of Object.values(labelRoles())) {
    const col = S.columns.find((c) => c.id === id);
    if (!col || !col.refTable || col.refTable === S.tableId) continue;
    const map = S.labels[col.id];
    if (!map) return true;
    for (const r of rows) {
      const v = r[col.id];
      const ids = Array.isArray(v) ? (v[0] === 'L' ? v.slice(1) : v[0] === 'R' ? [v[2]] : []) : [];
      if (ids.some((x) => x && !map.has(x))) return true;
    }
  }
  return false;
}

let reloading = null;
let reloadNext = null;   // asked for while one was running: run once more after it, schema first
function reload(what) {
  // The demo has its labels in memory and no document to read them from.
  if (S.demo) { S.signature = ''; recompute(); return Promise.resolve(); }
  if (reloading) {
    // A template's second step (which column each Reference shows) lands while the first step's
    // reload still runs; dropping this one would leave the labels as "Rooms[1]".
    reloadNext = reloadNext === 'schema' || what === 'schema' ? 'schema' : 'labels';
    return reloading.then(() => (reloadNext ? reload(reloadNext) : null));
  }
  reloadNext = null;
  reloading = (async () => {
    try {
      // A table reshaped under the widget (columns added, renamed): the view that fits may have changed too.
      if (what === 'schema') { forgetMeta(); S.tableId = (await selectedTableId()) || S.tableId; await loadDocState(); S.mode = resolveMode(); await loadBookingTables(); }
      else {
        S.labels = await loadLabels(S.columns, labelRoles()).catch(() => S.labels);
        if (S.gantt.holidayTable) S.holidayDays = await loadHolidayDays(S.gantt.holidayTable).catch(() => S.holidayDays);
        await loadBookingTables();
      }
      S.signature = '';
      recompute();
    } finally { reloading = null; }
  })();
  return reloading;
}

function onRows(rows) {
  S.rows = rows;
  if (!S.ready) return;
  // An empty table says nothing about its columns (no row, no keys), and an undo that takes a
  // template back empties it and removes its columns at once: read the columns from Grist then.
  if (schemaChanged(rows) || (!rows.length && S.live)) { reload('schema'); return; }
  if (labelsMissing(rows)) reload('labels');
  schedule();
  if (S.pendingEdit && rows.some((r) => r.id === S.pendingEdit.id)) requestAnimationFrame(openPending);
}

let lastAccess = null;
function onOptions(options) {
  const before = JSON.stringify(S.options || null);
  S.options = options;
  // Grist says which access it granted in this same message, often after the widget has drawn once
  // with none: a widget drawn read-only would stay so until the next change of data.
  const access = accessLevel() + '|' + (linkingInfo().asTarget || '');
  if (S.ready && access !== lastAccess) { S.signature = ''; schedule(); }
  lastAccess = access;
  if (!S.ready || JSON.stringify(options || null) === before) return;
  // Someone saved the Columns panel (here or in another browser): use what they saved.
  const o = readOptions(options);
  S.savedViews = o.views;
  viewsPanel?.refresh(viewsState());
  // Only the saved views changed (a view saved here or elsewhere): nothing to redraw but the button's count.
  const rest = (x) => JSON.stringify({ ...(x && typeof x === 'object' ? x : {}), views: undefined });
  if (rest(options) === rest(JSON.parse(before))) { drawToolbar(S.mode === 'gantt' ? S.model : null); return; }
  S.gantt = o.gantt;
  S.board = o.board;
  S.booking = o.booking;
  S.workload = o.workload;
  if (o.time.table !== S.time.table) { S.time = o.time; timeLookedFor = false; } else S.time = o.time;
  if (o.view !== S.opensAs) { S.opensAs = o.view; S.mode = resolveMode(); }
  if (o.roles) { S.roles = fromStored(o.roles, S.columns, S.tableId); S.source = { kind: 'saved' }; }
  reload('labels');
}

function onCursor(id) {
  if (id == null || id === S.selectedId || !S.ready) return;
  if (taskById(id)) select(id, { tellGrist: false });
}

function loadViewState() {
  const v = storedView(S.tableId);
  S.view = { ...v, collapsed: new Set(v.collapsed) };
  S.zoom = storedZoom(S.tableId, null);
}

async function boot() {
  setLanguage(storedLanguage(), { remember: false });
  const live = await start({ onRows, onOptions, onCursor });
  if (!live) return bootDemo();
  S.live = true;
  // Anything less than full access (the person picked "Read selected table", or declined): Grist
  // then sends only the columns shown in the widget's own fields and no column types (M2 check), so
  // there is nothing to plan with. Say so, and where to change it; Grist reloads the widget when
  // the access level changes, so this page goes away by itself.
  if (accessLevel() !== 'full') {
    drawToolbar(null, 'bare');
    emptyState(t('Plan Studio needs full access to this document'),
      t('It reads your column types and writes your changes back. In the widget panel on the right, set Access level to “Full document access”.'), []);
    return;
  }
  S.tableId = await selectedTableId();
  if (S.options == null) S.options = await getOptions().catch(() => null);
  loadViewState();   // before the labels: the board's lane column may be this browser's choice
  await loadDocState();
  S.mode = resolveMode();
  S.ready = true;
  lastAccess = accessLevel() + '|' + (linkingInfo().asTarget || '');
  recompute();
  // Other tables send no change events (M0, question 7): labels are read again now and then.
  setInterval(() => { if (document.visibilityState === 'visible') reload('labels'); }, 15000);
  startTimerTick();
  window.addEventListener('focus', () => reload('labels'));
}

/**
 * The demo, when no Grist answers: a website relaunch (every view), or pop-up stores over weekends, which
 * opens as the booking grid. ?example=stores picks the second.
 */
function bootDemo(example = null) {
  S.demo = true;
  if (!example) { try { example = new URLSearchParams(location.search).get('example'); } catch { /* no URL */ } }
  S.example = example === 'stores' || example === 'speed' ? example : 'plan';
  const stores = S.example === 'stores';
  const speed = S.example === 'speed';   // 5,000 tasks, for the speed pass; not in the Example menu
  // The website plan counts working days, so its weekends are not slack and the critical path runs through.
  S.gantt = { ...GANTT_DEFAULTS, durationUnit: stores ? 'days' : 'workdays' };
  S.tableId = stores ? STORES_TABLE : speed ? SPEED_TABLE : SAMPLE_TABLE;
  // A few views to open, so the panel shows what it is for (they live in memory, like the rest of the demo).
  S.savedViews = stores || speed ? [] : [
    { id: 'demo1', name: 'My tasks', ...snapshotView({ mode: 'agenda', zoom: null, view: { agendaWho: 'mine' } }) },
    { id: 'demo2', name: 'Board by owner', ...snapshotView({ mode: 'board', zoom: null, view: { laneBy: 'Owner' } }) },
    { id: 'demo3', name: 'Workload by month', ...snapshotView({ mode: 'workload', zoom: null, view: { wlUnit: 'month' } }) },
  ];
  S.columns = stores ? STORES_COLUMNS : speed ? SPEED_COLUMNS : SAMPLE_COLUMNS;
  S.rows = stores ? storesRows() : speed ? speedRows() : sampleRows();
  S.labels = stores ? STORES_LABELS : speed ? SPEED_LABELS : SAMPLE_LABELS;
  S.resourceTable = stores ? STORES_RESOURCES : null;
  // The website plan's people have hours a week (Dieter works part-time) and Ben has a day off.
  S.peopleTable = stores || speed ? null : SAMPLE_PEOPLE;
  S.daysOff = stores || speed ? { refTable: null, days: new Map() } : sampleDaysOff();
  S.workload = { ...WORKLOAD_DEFAULTS };
  // The website plan's time entries, kept in memory like everything else in the demo.
  S.time = { ...TIME_DEFAULTS };
  S.timeTableId = stores || speed ? null : SAMPLE_TIME_TABLE;
  S.timeTable = stores || speed ? null : { columns: SAMPLE_TIME_COLUMNS, rows: sampleTimeRows() };
  S.timeCols = S.timeTable ? detectTimeColumns(S.timeTable.columns, SAMPLE_TABLE) : null;
  S.timeZone = 'UTC';
  S.me = storedMe(SAMPLE_TABLE);
  refreshEntries();
  startTimerTick();
  S.opensAs = stores ? 'booking' : 'auto';
  S.selectedId = null;
  demoHistory.undo.length = 0;
  demoHistory.redo.length = 0;
  const d = detectRoles(S.columns, { tableId: S.tableId });
  S.roles = d.roles;
  S.source = d.source;
  loadViewState();
  S.mode = resolveMode();
  S.signature = '';
  S.firstDraw = true;
  S.ready = true;
  recompute();
}

boot();
