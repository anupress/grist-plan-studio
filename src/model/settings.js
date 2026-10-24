// What a Plan Studio widget remembers, and where.
//
// In the widget's options (saved in the document, shared by everyone who opens the page, written
// only when someone presses Save in the Columns panel): the column mapping, how dates are read,
// which view the widget opens in, what a board card shows and the lanes' limits, and the booking
// grid's periods table and cell label.
// Writing options is a document action, so nothing that changes while someone merely looks around
// (zoom, scroll position) goes there.
//
// In this browser (localStorage): per table, the zoom level, the grouping, whether the critical path
// is shown, which parents and groups are folded, the board's lane column and the view last switched
// to; and the interface language.

export const SETTINGS_VERSION = 1;

export const GANTT_DEFAULTS = Object.freeze({
  endInclusive: true,       // an end date is the last day of the task
  dueOnly: 'milestone',     // a task with only a due date: 'milestone' or 'bar'
  defaultDays: 1,           // ...and how long that bar is
  weekStart: 'auto',        // 'auto' (from the locale), 1 = Monday, 0 = Sunday
  durationUnit: 'days',     // 'days' or 'workdays': how a duration and a push count
  holidays: null,           // a region code from model/calendar.js HOLIDAY_REGIONS, or null
  holidayTable: null,       // a table id whose dated rows are days off, or null
  colourBy: null,           // {ref, id} of the column the bars are coloured by, or null (status, then project)
});
export const BOARD_DEFAULTS = Object.freeze({
  fields: null,             // [{ref, id}] the columns a card shows besides its name; null = automatic
  hideEmpty: false,         // leave out lanes with no cards
  wip: {},                  // '<column ref>|<lane key>' -> the most open cards that lane should hold
});
export const BOOKING_DEFAULTS = Object.freeze({
  periodTable: null,        // a table id whose dated rows are the grid's columns, or null
  labelBy: null,            // {ref, id} of the column a booking shows, or null (its name)
});
export const VIEWS = ['gantt', 'timeline', 'board', 'booking'];
const REGION = /^(DE(-[A-Z]{2})?|AT|CH|FR|UK-EW|US)$/;

/** Widget options as Grist returns them (or null) -> {roles (stored form or null), gantt}. */
export function readOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  const g = o.gantt && typeof o.gantt === 'object' ? o.gantt : {};
  const gantt = { ...GANTT_DEFAULTS };
  if (typeof g.endInclusive === 'boolean') gantt.endInclusive = g.endInclusive;
  if (g.dueOnly === 'milestone' || g.dueOnly === 'bar') gantt.dueOnly = g.dueOnly;
  if (Number.isInteger(g.defaultDays) && g.defaultDays >= 1 && g.defaultDays <= 365) gantt.defaultDays = g.defaultDays;
  if (g.weekStart === 0 || g.weekStart === 1 || g.weekStart === 'auto') gantt.weekStart = g.weekStart;
  if (g.durationUnit === 'days' || g.durationUnit === 'workdays') gantt.durationUnit = g.durationUnit;
  if (typeof g.holidays === 'string' && REGION.test(g.holidays)) gantt.holidays = g.holidays;
  if (typeof g.holidayTable === 'string' && g.holidayTable) gantt.holidayTable = g.holidayTable;
  if (g.colourBy && typeof g.colourBy === 'object' && typeof g.colourBy.id === 'string') gantt.colourBy = { ref: g.colourBy.ref, id: g.colourBy.id };
  const b = o.board && typeof o.board === 'object' ? o.board : {};
  const board = { ...BOARD_DEFAULTS, wip: {} };
  if (Array.isArray(b.fields)) board.fields = b.fields.filter((x) => x && typeof x.id === 'string').slice(0, 12).map((x) => ({ ref: x.ref, id: x.id }));
  if (typeof b.hideEmpty === 'boolean') board.hideEmpty = b.hideEmpty;
  if (b.wip && typeof b.wip === 'object') {
    for (const [k, n] of Object.entries(b.wip)) if (Number.isInteger(n) && n > 0 && n < 10000) board.wip[k] = n;
  }
  const k = o.booking && typeof o.booking === 'object' ? o.booking : {};
  const booking = { ...BOOKING_DEFAULTS };
  if (typeof k.periodTable === 'string' && k.periodTable) booking.periodTable = k.periodTable;
  if (k.labelBy && typeof k.labelBy === 'object' && typeof k.labelBy.id === 'string') booking.labelBy = { ref: k.labelBy.ref, id: k.labelBy.id };
  const view = VIEWS.includes(o.view) ? o.view : 'auto';
  return { roles: o.roles && typeof o.roles === 'object' ? o.roles : null, gantt, board, booking, view };
}

/** What Save writes. Other keys already in the options (from a later version) are kept. */
export function writeOptions(previous, { storedRoles, gantt, board, booking, view }) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const out = { ...prev, v: SETTINGS_VERSION };
  if (storedRoles !== undefined) out.roles = storedRoles;
  if (gantt) out.gantt = { ...gantt };
  if (board) out.board = { ...board, wip: { ...board.wip } };
  if (booking) out.booking = { ...booking };
  if (view !== undefined) out.view = view;
  return out;
}

const zoomKey = (tableId) => 'planStudio.zoom.' + (tableId || 'demo');
export function storedZoom(tableId, fallback = 'week') {
  try { return localStorage.getItem(zoomKey(tableId)) || fallback; } catch { return fallback; }
}
export function rememberZoom(tableId, zoom) {
  try { localStorage.setItem(zoomKey(tableId), zoom); } catch { /* private window: forget it */ }
}

// ---- view state in this browser, per table ----------------------------------------------------------
const local = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const keep = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ } };
const viewKey = (tableId) => 'planStudio.view.' + (tableId || 'demo');

/**
 * {groupBy, critical, collapsed, laneBy (board), tlLaneBy (timeline), bookRows, bookPeriods ('day' | 'week' |
 *  'month' | 'col:<colId>' | 'table:<tableId>'), bookFilter ('<colId>=<value>')}; the column ids are null when not chosen
 */
export function storedView(tableId) {
  const v = local(viewKey(tableId), {});
  return {
    groupBy: typeof v.groupBy === 'string' ? v.groupBy : null,
    critical: v.critical === true,
    collapsed: Array.isArray(v.collapsed) ? v.collapsed.filter((x) => typeof x === 'string').slice(0, 2000) : [],
    laneBy: typeof v.laneBy === 'string' ? v.laneBy : null,
    tlLaneBy: typeof v.tlLaneBy === 'string' ? v.tlLaneBy : null,
    bookRows: typeof v.bookRows === 'string' ? v.bookRows : null,
    bookPeriods: typeof v.bookPeriods === 'string' ? v.bookPeriods : null,
    bookFilter: typeof v.bookFilter === 'string' ? v.bookFilter : null,
  };
}
export function rememberView(tableId, view) { keep(viewKey(tableId), view); }

// The view last switched to with the toolbar, per table and per the view the widget opens in: two Plan
// Studio widgets on one table, one set to open as a board, each keep their own.
const modeKey = (tableId, opensAs) => 'planStudio.mode.' + (tableId || 'demo') + '.' + opensAs;
export function storedMode(tableId, opensAs) { const v = local(modeKey(tableId, opensAs), null); return VIEWS.includes(v) ? v : null; }
export function rememberMode(tableId, opensAs, mode) { keep(modeKey(tableId, opensAs), mode); }
