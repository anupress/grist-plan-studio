// The Columns panel: which column fills each role, and how dates are read. Opens over the chart;
// nothing changes until Save.

import { el, clear } from '../core/util.js';
import { ROLES, fits, detectRoles } from '../model/roles.js';
import { FIELD_KINDS } from '../model/board.js';
import { ASSISTED_ROLES } from '../model/templates.js';
import { HOLIDAY_REGIONS } from '../model/calendar.js';
import { t, UI_LANGUAGES, storedLanguage } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

const ROLE_TEXT = {
  title: ['Name', 'What each task is called.'],
  start: ['Start date', null],
  end: ['End date', null],
  due: ['Due date', 'With a start date, the task ends on it. On its own, the task is shown on that day.'],
  duration: ['Duration in days', 'Used when there is a start but no end date.'],
  status: ['Status', 'Colours the bars, using the colours of the column’s choices.'],
  progress: ['Progress', '0 to 1, or 0 to 100.'],
  done: ['Done', 'A ticked task counts as complete.'],
  milestone: ['Milestone', 'A ticked task is shown as a diamond.'],
  assignee: ['Assigned to', null],
  project: ['Project', 'Colours the bars when there is no status.'],
  colour: ['Colour', 'A choice column, or text such as #2563eb.'],
  parent: ['Parent task', 'A Reference to this same table: the task sits under its parent, whose bar spans its subtasks.'],
  dependsOn: ['Depends on', 'References to tasks in this table that must finish first. Drawn as arrows.'],
  order: ['Order in a lane', 'A number column. Dragging a card up or down on the board writes it.'],
  resource: ['Resource', 'A room, store, flat or vehicle: the booking grid has a row for each.'],
  period: ['Period', 'A column that names when, such as Weekend 1, 2, 3: the booking grid has a column for each. Not needed when bookings have dates.'],
  effort: ['Hours of work', 'The work a task needs: hours, or person-days when the column’s name says days. The workload spreads it over the task’s working days.'],
};
// Columns a chart can be coloured by
const COLOUR_KINDS = ['Choice', 'ChoiceList', 'Ref', 'RefList', 'Text', 'Bool'];
const NEEDED = ['title', 'start', 'end', 'due', 'duration'];

function sourceText(source) {
  if (source.kind === 'template') return t('Recognised as {name}.', { name: source.name });
  if (source.kind === 'mapping') return t('Taken over from the widget this one replaced.');
  if (source.kind === 'saved') return t('Saved for this widget.');
  return t('Guessed from the column names.');
}

/**
 * @param host     element the panel opens in
 * @param s        {tableId, columns, roles, source, gantt, board, booking, workload, opensAs, cardFields: [colId], canEdit, canAddColumns, datedTables,
 *                  peopleColumns (of the table the people come from), capacityGuess (its capacity column found by name),
 *                  time, timeTables (tables that can hold time entries), timeFound (the one found by name), canSetupTime}
 * @param on       {onSave({roles, gantt, board, booking, workload, time, opensAs, language}), onAddColumn(role), onSetupTime(), onClose()}
 */
export function openMapping(host, s, on) {
  let roles = { ...s.roles };
  const gantt = { ...s.gantt };
  const board = { ...s.board, wip: { ...(s.board?.wip || {}) } };
  const booking = { ...s.booking };
  const workload = { ...s.workload };
  const time = { ...(s.time || { table: null, cols: null }) };
  let opensAs = s.opensAs || 'auto';
  let fieldsTouched = false;
  const selects = new Map();

  const roleRow = (roleId) => {
    const [label, hint] = ROLE_TEXT[roleId];
    const options = s.columns.filter((c) => fits(roleId, c, s.tableId));
    const id = 'ps-map-' + roleId;
    const select = el('select', { id, class: 'ps-input', onchange: () => { roles[roleId] = select.value || undefined; } }, [
      el('option', { value: '', text: t('— none —') }),
      ...options.map((c) => el('option', { value: c.id, text: c.label === c.id ? c.id : `${c.label} (${c.id})`, selected: roles[roleId] === c.id })),
    ]);
    if (!options.length) select.disabled = true;
    selects.set(roleId, select);
    // A useful role with no column: offer to make one, of the right type (model/templates.js).
    const addBtn = s.canAddColumns && ASSISTED_ROLES.includes(roleId) && !roles[roleId]
      ? el('button', { type: 'button', class: 'ps-link ps-add-col', text: t('Add a column for it'), onclick: () => { close(); on.onAddColumn?.(roleId); } })
      : null;
    return el('div', { class: 'ps-field' }, [
      el('label', { for: id, text: t(label) }),
      select,
      !options.length ? el('p', { class: 'ps-hint', text: t('No column of a fitting type in this table.') }) : hint ? el('p', { class: 'ps-hint', text: t(hint) }) : null,
      addBtn,
    ]);
  };

  const sel = (id, value, items, onchange) => el('select', { id, class: 'ps-input', onchange }, items.map(([v, label]) => el('option', { value: String(v), text: label, selected: String(value) === String(v) })));
  const days = el('input', { type: 'number', min: '1', max: '365', class: 'ps-input ps-input--num', value: String(gantt.defaultDays), 'aria-label': t('Days'),
    disabled: gantt.dueOnly !== 'bar', onchange: () => { gantt.defaultDays = Math.max(1, Math.min(365, parseInt(days.value, 10) || 1)); } });
  let language = storedLanguage();

  const panel = el('div', { class: 'ps-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-map-title' }, [
    el('div', { class: 'ps-drawer__head' }, [
      el('h2', { id: 'ps-map-title', text: t('Columns') }),
      el('button', { type: 'button', class: 'ps-icon-btn', 'aria-label': t('Close'), text: '×', onclick: () => close() }),
    ]),
    el('div', { class: 'ps-drawer__body' }, [
      el('p', { class: 'ps-source', text: sourceText(s.source) }),
      el('h3', { text: t('Dates and names') }),
      ...NEEDED.map(roleRow),
      el('h3', { text: t('More about each task') }),
      ...ROLES.filter((r) => r.panel && !NEEDED.includes(r.id)).map((r) => roleRow(r.id)),
      el('h3', { text: t('Reading dates') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-end', text: t('End date') }),
        sel('ps-end', gantt.endInclusive, [[true, t('is the task’s last day')], [false, t('is the day after the task')]], (e) => { gantt.endInclusive = e.target.value === 'true'; }),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-due', text: t('A task with only a due date') }),
        el('div', { class: 'ps-inline' }, [
          sel('ps-due', gantt.dueOnly, [['milestone', t('is shown as a milestone')], ['bar', t('is a bar ending on it, days long:')]], (e) => { gantt.dueOnly = e.target.value; days.disabled = gantt.dueOnly !== 'bar'; }),
          days,
        ]),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-week', text: t('Weeks start on') }),
        sel('ps-week', gantt.weekStart, [['auto', t('Automatic (from the language)')], [1, t('Monday')], [0, t('Sunday')]], (e) => { gantt.weekStart = e.target.value === 'auto' ? 'auto' : Number(e.target.value); }),
      ]),
      el('h3', { text: t('Working days') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-unit', text: t('Durations and moves count') }),
        sel('ps-unit', gantt.durationUnit, [['days', t('every calendar day')], ['workdays', t('working days only (no weekends or holidays)')]], (e) => { gantt.durationUnit = e.target.value; }),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-hol', text: t('Public holidays') }),
        sel('ps-hol', gantt.holidays || '', [['', t('none')], ...HOLIDAY_REGIONS.map(([code, label]) => [code, t(label)])], (e) => { gantt.holidays = e.target.value || null; }),
        el('p', { class: 'ps-hint', text: t('Shaded in the chart. Days kept only in part of a state, and cantonal holidays, are not included: add them in a holidays table.') }),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-holtab', text: t('Days off from a table') }),
        sel('ps-holtab', gantt.holidayTable || '', [['', t('none')], ...(s.datedTables || []).map((id) => [id, id])], (e) => { gantt.holidayTable = e.target.value || null; }),
        el('p', { class: 'ps-hint', text: t('Each row with a date is a day off; a second date column makes it a run of days. A row that names a person is that person’s day off, in the workload.') }),
      ]),
      el('h3', { text: t('Board') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-opens', text: t('This widget opens as') }),
        sel('ps-opens', opensAs, [['auto', t('Automatic')], ['gantt', t('Gantt chart')], ['timeline', t('Timeline')], ['board', t('Board')], ['booking', t('Booking grid')], ['workload', t('Workload')], ['agenda', t('Agenda')], ['calendar', t('Calendar')]], (e) => { opensAs = e.target.value; }),
        el('p', { class: 'ps-hint', text: t('Automatic: the Agenda on a phone, otherwise the Gantt chart when the table has dates, or else the board. For everyone who opens this page; the toolbar switches the view in this browser only.') }),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { text: t('Cards also show'), id: 'ps-cf-l' }),
        el('div', { class: 'ps-checks ps-checks--tall', role: 'group', 'aria-labelledby': 'ps-cf-l' }, s.columns.filter((c) => FIELD_KINDS.includes(c.kind) && c.id !== roles.title).map((c) => {
          const box = el('input', { type: 'checkbox', value: c.id, checked: (s.cardFields || []).includes(c.id), onchange: () => { fieldsTouched = true; } });
          return el('label', { class: 'ps-check' }, [box, el('span', { text: c.label })]);
        })),
        el('p', { class: 'ps-hint', text: t('Dates and the people assigned are always shown.') }),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-hideempty', text: t('Lanes with no cards') }),
        sel('ps-hideempty', board.hideEmpty, [[false, t('are shown')], [true, t('are hidden')]], (e) => { board.hideEmpty = e.target.value === 'true'; }),
      ]),
      el('h3', { text: t('Booking grid') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-pertab', text: t('Periods from a table') }),
        sel('ps-pertab', booking.periodTable || '', [['', t('none')], ...(s.datedTables || []).map((id) => [id, id])], (e) => { booking.periodTable = e.target.value || null; }),
        el('p', { class: 'ps-hint', text: t('A table with a start and an end date, such as Markets: each row becomes a column of the grid. Days, weeks and months need no table.') }),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-booklab', text: t('Bookings show') }),
        sel('ps-booklab', booking.labelBy?.id || '', [['', t('the name')], ...s.columns.filter((c) => FIELD_KINDS.includes(c.kind)).map((c) => [c.id, c.label])],
          (e) => { const c = s.columns.find((x) => x.id === e.target.value); booking.labelBy = c ? { ref: c.ref, id: c.id } : null; }),
      ]),
      el('h3', { text: t('Workload') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-wlday', text: t('A working day has') }),
        el('div', { class: 'ps-inline' }, [
          el('input', { type: 'number', id: 'ps-wlday', min: '1', max: '24', step: '0.5', class: 'ps-input ps-input--num', value: String(workload.hoursPerDay),
            onchange: (e) => { const v = Number(e.target.value); workload.hoursPerDay = v >= 1 && v <= 24 ? v : 8; } }),
          el('span', { text: t('hours') }),
        ]),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-wlunit', text: t('Hours of work count') }),
        sel('ps-wlunit', workload.effortUnit, [['auto', t('Automatic (from the column’s name)')], ['hours', t('hours')], ['days', t('person-days')]], (e) => { workload.effortUnit = e.target.value; }),
      ]),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-wlcap', text: t('Each person’s capacity') }),
        sel('ps-wlcap', workload.capacity?.id || '', [
          ['', s.capacityGuess ? t('Automatic ({col})', { col: s.capacityGuess }) : t('Automatic (a full day each)')],
          ...(s.peopleColumns || []).filter((c) => c.kind === 'Numeric' || c.kind === 'Int').map((c) => [c.id, c.label]),
        ], (e) => { const c = (s.peopleColumns || []).find((x) => x.id === e.target.value); workload.capacity = c ? { ref: c.ref, id: c.id } : null; }),
        el('p', { class: 'ps-hint', text: s.peopleColumns?.length
          ? t('A column of the people table: hours a week (40), or a share (0.5 or 50 %). An empty cell is a full day.')
          : t('When “Assigned to” is a Reference to a people table, a column there can give each person’s hours a week. Without one, everyone has a full day.') }),
      ]),
      el('h3', { text: t('Time tracking') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-timetab', text: t('Time entries are in') }),
        sel('ps-timetab', time.table || '', [
          ['', s.timeFound ? t('Automatic ({table})', { table: s.timeFound }) : t('Automatic (none found)')],
          ...(s.timeTables || []).map((id) => [id, id]),
        ], (e) => { time.table = e.target.value || null; time.cols = null; }),
        el('p', { class: 'ps-hint', text: t('A table with a Reference to this one, a date or a start, and hours or a start and an end. Timers and logged hours are written there.') }),
        s.canSetupTime ? el('button', { type: 'button', class: 'ps-link ps-add-col', text: t('Add a time-entries table'), onclick: () => { close(); on.onSetupTime?.(); } }) : null,
      ]),
      el('h3', { text: t('Reminders') }),
      el('div', { class: 'ps-field' }, [
        el('p', { class: 'ps-hint', text: t('Email the tasks that are late or due soon every morning, from your own Google account. Free: no Grist plan is needed.') }),
        el('button', { type: 'button', class: 'ps-link ps-add-col', text: t('Set up email reminders…'), onclick: () => { close(); on.onReminders?.(); } }),
      ]),
      el('h3', { text: t('Colours') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-colby', text: t('Colour the bars by') }),
        sel('ps-colby', gantt.colourBy?.id || '', [['', t('Status, or else Project')],
          ...s.columns.filter((c) => COLOUR_KINDS.includes(c.kind)).map((c) => [c.id, c.label])],
        (e) => { const c = s.columns.find((x) => x.id === e.target.value); gantt.colourBy = c ? { ref: c.ref, id: c.id } : null; }),
      ]),
      el('h3', { text: t('This browser') }),
      el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-lang', text: t('Interface language') }),
        sel('ps-lang', language, UI_LANGUAGES.map((l) => [l.id, l.id === 'auto' ? t('Automatic (Grist’s or the browser’s)') : l.label]), (e) => { language = e.target.value; }),
      ]),
      s.canEdit ? null : el('p', { class: 'ps-note', text: t('You can’t edit this document, so these settings apply only until you reload.') }),
    ]),
    el('div', { class: 'ps-drawer__foot' }, [
      el('button', { type: 'button', class: 'ps-btn', text: t('Detect again'), title: t('Guess every column again from the table'), onclick: () => {
        roles = detectRoles(s.columns, { tableId: s.tableId }).roles;
        for (const [roleId, select] of selects) select.value = roles[roleId] || '';
      } }),
      el('span', { class: 'ps-spacer' }),
      el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: () => close() }),
      el('button', { type: 'button', class: 'ps-btn ps-btn--primary', text: s.canEdit ? t('Save') : t('Apply'), onclick: () => {
        const clean = Object.fromEntries(Object.entries(roles).filter(([, v]) => v));
        if (fieldsTouched) {
          board.fields = [...panel.querySelectorAll('.ps-checks input[type=checkbox]:checked')].map((b) => s.columns.find((c) => c.id === b.value)).filter(Boolean).map((c) => ({ ref: c.ref, id: c.id }));
        }
        close();
        on.onSave({ roles: clean, gantt, board, booking, workload, time, opensAs, language });
      } }),
    ]),
  ]);
  const scrim = el('div', { class: 'ps-scrim', onclick: () => close() });
  let release = () => {};
  function close() {
    release();
    scrim.remove();
    panel.remove();
    on.onClose?.();
  }
  host.append(scrim, panel);
  release = trapFocus(panel, close);
  (panel.querySelector('select:not([disabled])') || panel.querySelector('button'))?.focus();
  return { close };
}
