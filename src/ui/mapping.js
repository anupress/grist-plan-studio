// The settings panel: which column fills each role, and how the widget reads and shows them. Opens over
// the view; nothing changes until Save.
//
// Built to fit the person (M13). Three tabs:
//   Columns    a sentence that says what the mapping will do, the three columns every plan needs, then the
//              columns the view on show also reads; the columns only other views read are folded away
//   This view  the options of the view on show, and which view the widget opens as
//   More       everything else, in groups that fold: how dates are read, working days, the other views'
//              options, time tracking, reminders, the language
// A search box above them finds a setting by what it says, across all three. Every control keeps one place
// and one node, so the tabs and the search show the same fields, not copies.

import { el } from '../core/util.js';
import { ROLES, fits, detectRoles } from '../model/roles.js';
import { FIELD_KINDS } from '../model/board.js';
import { ASSISTED_ROLES } from '../model/templates.js';
import { HOLIDAY_REGIONS } from '../model/calendar.js';
import { t, UI_LANGUAGES, storedLanguage } from '../i18n/index.js';
import { usedBy, viewsOfRole, groupsFor, previewLines, mappedCount, queryWords, matchesQuery } from '../model/settingsmap.js';
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
const CORE = ['title', 'start', 'end'];           // what almost every plan needs
const OTHER_DATES = ['due', 'duration'];          // other ways to give a task its date
const VIEW_NAME = { gantt: 'Gantt chart', timeline: 'Timeline', board: 'Board', calendar: 'Calendar', booking: 'Booking grid', workload: 'Workload', agenda: 'Agenda' };
const GROUP_TITLE = { colours: 'Colours', dates: 'Reading dates', working: 'Working days', board: 'Board', booking: 'Booking grid', workload: 'Workload', time: 'Time tracking', reminders: 'Reminders', browser: 'This browser' };
const TABS = [['columns', 'Columns'], ['view', 'This view'], ['more', 'More']];

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
 *                  time, timeTables (tables that can hold time entries), timeFound (the one found by name), canSetupTime,
 *                  mode (the view on show), tab ('columns' | 'view' | 'more')}
 * @param on       {onSave({roles, gantt, board, booking, workload, time, opensAs, language}), onAddColumn(role), onSetupTime(), onReminders(), onTab(tab), onClose()}
 */
export function openMapping(host, s, on) {
  let roles = { ...s.roles };
  const gantt = { ...s.gantt };
  const board = { ...s.board, wip: { ...(s.board?.wip || {}) } };
  const booking = { ...s.booking };
  const workload = { ...s.workload };
  const time = { ...(s.time || { table: null, cols: null }) };
  let opensAs = s.opensAs || 'auto';
  let language = storedLanguage();
  let fieldsTouched = false;
  const mode = s.mode || 'gantt';
  const selects = new Map();
  const items = [];                                   // every field, for the search: {node, text}
  const colName = (id) => { const c = s.columns.find((x) => x.id === id); return c ? (c.label || c.id) : id; };

  /** A field: its node is registered once, so the search and the tabs share it. The search reads its label and its hint. */
  const field = (where, node) => {
    node.dataset.where = where;
    // its label, its hint, and the choices of a menu whose choices are fixed words (weekdays, regions, languages), not column names
    items.push({ node, text: [...node.querySelectorAll('label, .ps-hint, select[data-fixed] option')].map((n) => n.textContent).join(' ') });
    return node;
  };

  // ---- columns ------------------------------------------------------------------------------------------------
  const roleRow = (roleId) => {
    const [label, hint] = ROLE_TEXT[roleId];
    const options = s.columns.filter((c) => fits(roleId, c, s.tableId));
    const id = 'ps-map-' + roleId;
    const select = el('select', { id, class: 'ps-input', onchange: () => { roles[roleId] = select.value || undefined; refreshPreview(); } }, [
      el('option', { value: '', text: t('— none —') }),
      ...options.map((c) => el('option', { value: c.id, text: c.label === c.id ? c.id : `${c.label} (${c.id})`, selected: roles[roleId] === c.id })),
    ]);
    if (!options.length) select.disabled = true;
    selects.set(roleId, select);
    // A useful role with no column: offer to make one, of the right type (model/templates.js).
    const addBtn = s.canAddColumns && ASSISTED_ROLES.includes(roleId) && !roles[roleId]
      ? el('button', { type: 'button', class: 'ps-link ps-add-col', text: t('Add a column for it'), onclick: () => { close(); on.onAddColumn?.(roleId); } })
      : null;
    // which views read it, said in words, unless every view does
    const views = viewsOfRole(roleId);
    const usedText = views.length < Object.keys(VIEW_NAME).length ? t('Used by: {views}.', { views: views.map((v) => t(VIEW_NAME[v])).join(', ') }) : null;
    const hintText = !options.length ? t('No column of a fitting type in this table.') : [hint ? t(hint) : null, usedText].filter(Boolean).join(' ');
    return field(t('Columns'), el('div', { class: 'ps-field' }, [
      el('label', { for: id, text: t(label) }),
      select,
      hintText ? el('p', { class: 'ps-hint', text: hintText }) : null,
      addBtn,
    ]));
  };

  const preview = el('p', { class: 'ps-preview', 'aria-live': 'polite' });
  const mapped = el('span', { class: 'ps-preview__count' });
  function refreshPreview() {
    preview.textContent = previewLines(roles, colName).map((l) => t(l.key, l.vars)).join(' ');
    const n = mappedCount(roles);
    mapped.textContent = n === 1 ? t('1 column set') : t('{n} columns set', { n });
  }
  const detect = el('button', { type: 'button', class: 'ps-link', text: t('Detect again'), title: t('Guess every column again from the table'), onclick: () => {
    roles = detectRoles(s.columns, { tableId: s.tableId }).roles;
    for (const [roleId, select] of selects) select.value = roles[roleId] || '';
    refreshPreview();
  } });

  const sec = (title, children) => el('section', { class: 'ps-sec' }, [title ? el('h3', { text: title }) : null, ...children]);
  /** A folded group: its summary names it. */
  const fold = (title, children, open = false) => el('details', { class: 'ps-more', open }, [el('summary', { text: title }), ...children]);

  const panelRoles = ROLES.filter((r) => r.panel).map((r) => r.id);
  const restRoles = panelRoles.filter((r) => !CORE.includes(r) && !OTHER_DATES.includes(r));
  const hereRoles = restRoles.filter((r) => usedBy(r, mode));
  const elseRoles = restRoles.filter((r) => !usedBy(r, mode));
  const columnsPane = el('div', { class: 'ps-pane', dataset: { tab: 'columns' }, role: 'tabpanel' }, [
    el('p', { class: 'ps-source', text: sourceText(s.source) }),
    el('div', { class: 'ps-previewbox' }, [preview, el('div', { class: 'ps-preview__foot' }, [mapped, detect])]),
    sec(t('Dates and names'), [
      ...CORE.map(roleRow),
      fold(t('Other ways to give a date'), OTHER_DATES.map(roleRow), !!(roles.due || roles.duration || (!roles.start && !roles.end))),
    ]),
    hereRoles.length ? sec(t('More columns this view reads'), hereRoles.map(roleRow)) : null,
    elseRoles.length ? fold(t('Columns other views use ({n})', { n: elseRoles.length }), elseRoles.map(roleRow)) : null,
  ]);

  // ---- the groups of options ----------------------------------------------------------------------------------
  const menu = (fixed) => (id, value, list, onchange) => el('select', { id, class: 'ps-input', onchange, ...(fixed ? { dataset: { fixed: '1' } } : {}) }, list.map(([v, label]) => el('option', { value: String(v), text: label, selected: String(value) === String(v) })));
  const sel = menu(true);          // a menu of fixed words: the search can read them
  const selCols = menu(false);     // a menu of this document's columns or tables: it cannot
  const days = el('input', { type: 'number', min: '1', max: '365', class: 'ps-input ps-input--num', value: String(gantt.defaultDays), 'aria-label': t('Days'),
    disabled: gantt.dueOnly !== 'bar', onchange: () => { gantt.defaultDays = Math.max(1, Math.min(365, parseInt(days.value, 10) || 1)); } });
  const F = (label, control, hint = null, id = null) => el('div', { class: 'ps-field' }, [el('label', { ...(id ? { for: id } : {}), text: label }), control, hint ? el('p', { class: 'ps-hint', text: hint }) : null]);

  const GROUPS = {
    colours: (w) => [
      field(w, F(t('Colour the bars by'), selCols('ps-colby', gantt.colourBy?.id || '', [['', t('Status, or else Project')],
        ...s.columns.filter((c) => COLOUR_KINDS.includes(c.kind)).map((c) => [c.id, c.label])],
      (e) => { const c = s.columns.find((x) => x.id === e.target.value); gantt.colourBy = c ? { ref: c.ref, id: c.id } : null; }), null, 'ps-colby')),
    ],
    dates: (w) => [
      field(w, F(t('End date'), sel('ps-end', gantt.endInclusive, [[true, t('is the task’s last day')], [false, t('is the day after the task')]], (e) => { gantt.endInclusive = e.target.value === 'true'; }), null, 'ps-end')),
      field(w, F(t('A task with only a due date'), el('div', { class: 'ps-inline' }, [
        sel('ps-due', gantt.dueOnly, [['milestone', t('is shown as a milestone')], ['bar', t('is a bar ending on it, days long:')]], (e) => { gantt.dueOnly = e.target.value; days.disabled = gantt.dueOnly !== 'bar'; }),
        days,
      ]), null, 'ps-due')),
      field(w, F(t('Weeks start on'), sel('ps-week', gantt.weekStart, [['auto', t('Automatic (from the language)')], [1, t('Monday')], [0, t('Sunday')]], (e) => { gantt.weekStart = e.target.value === 'auto' ? 'auto' : Number(e.target.value); }), null, 'ps-week')),
    ],
    working: (w) => [
      field(w, F(t('Durations and moves count'), sel('ps-unit', gantt.durationUnit, [['days', t('every calendar day')], ['workdays', t('working days only (no weekends or holidays)')]], (e) => { gantt.durationUnit = e.target.value; }), null, 'ps-unit')),
      field(w, F(t('Public holidays'), sel('ps-hol', gantt.holidays || '', [['', t('none')], ...HOLIDAY_REGIONS.map(([code, label]) => [code, t(label)])], (e) => { gantt.holidays = e.target.value || null; }),
        t('Shaded in the chart. Days kept only in part of a state, and cantonal holidays, are not included: add them in a holidays table.'), 'ps-hol')),
      field(w, F(t('Days off from a table'), selCols('ps-holtab', gantt.holidayTable || '', [['', t('none')], ...(s.datedTables || []).map((id) => [id, id])], (e) => { gantt.holidayTable = e.target.value || null; }),
        t('Each row with a date is a day off; a second date column makes it a run of days. A row that names a person is that person’s day off, in the workload.'), 'ps-holtab')),
    ],
    board: (w) => [
      field(w, el('div', { class: 'ps-field' }, [
        el('label', { id: 'ps-cf-l', text: t('Cards also show') }),
        el('div', { class: 'ps-checks ps-checks--tall', role: 'group', 'aria-labelledby': 'ps-cf-l' }, s.columns.filter((c) => FIELD_KINDS.includes(c.kind) && c.id !== roles.title).map((c) => {
          const box = el('input', { type: 'checkbox', value: c.id, checked: (s.cardFields || []).includes(c.id), onchange: () => { fieldsTouched = true; } });
          return el('label', { class: 'ps-check' }, [box, el('span', { text: c.label })]);
        })),
        el('p', { class: 'ps-hint', text: t('Dates and the people assigned are always shown.') }),
      ])),
      field(w, F(t('Lanes with no cards'), sel('ps-hideempty', board.hideEmpty, [[false, t('are shown')], [true, t('are hidden')]], (e) => { board.hideEmpty = e.target.value === 'true'; }), null, 'ps-hideempty')),
    ],
    booking: (w) => [
      field(w, F(t('Periods from a table'), selCols('ps-pertab', booking.periodTable || '', [['', t('none')], ...(s.datedTables || []).map((id) => [id, id])], (e) => { booking.periodTable = e.target.value || null; }),
        t('A table with a start and an end date, such as Markets: each row becomes a column of the grid. Days, weeks and months need no table.'), 'ps-pertab')),
      field(w, F(t('Bookings show'), selCols('ps-booklab', booking.labelBy?.id || '', [['', t('the name')], ...s.columns.filter((c) => FIELD_KINDS.includes(c.kind)).map((c) => [c.id, c.label])],
        (e) => { const c = s.columns.find((x) => x.id === e.target.value); booking.labelBy = c ? { ref: c.ref, id: c.id } : null; }), null, 'ps-booklab')),
    ],
    workload: (w) => [
      field(w, F(t('A working day has'), el('div', { class: 'ps-inline' }, [
        el('input', { type: 'number', id: 'ps-wlday', min: '1', max: '24', step: '0.5', class: 'ps-input ps-input--num', value: String(workload.hoursPerDay),
          onchange: (e) => { const v = Number(e.target.value); workload.hoursPerDay = v >= 1 && v <= 24 ? v : 8; } }),
        el('span', { text: t('hours') }),
      ]), null, 'ps-wlday')),
      field(w, F(t('Hours of work count'), sel('ps-wlunit', workload.effortUnit, [['auto', t('Automatic (from the column’s name)')], ['hours', t('hours')], ['days', t('person-days')]], (e) => { workload.effortUnit = e.target.value; }), null, 'ps-wlunit')),
      field(w, F(t('Each person’s capacity'), selCols('ps-wlcap', workload.capacity?.id || '', [
        ['', s.capacityGuess ? t('Automatic ({col})', { col: s.capacityGuess }) : t('Automatic (a full day each)')],
        ...(s.peopleColumns || []).filter((c) => c.kind === 'Numeric' || c.kind === 'Int').map((c) => [c.id, c.label]),
      ], (e) => { const c = (s.peopleColumns || []).find((x) => x.id === e.target.value); workload.capacity = c ? { ref: c.ref, id: c.id } : null; }),
      s.peopleColumns?.length
        ? t('A column of the people table: hours a week (40), or a share (0.5 or 50 %). An empty cell is a full day.')
        : t('When “Assigned to” is a Reference to a people table, a column there can give each person’s hours a week. Without one, everyone has a full day.'), 'ps-wlcap')),
    ],
    time: (w) => [
      field(w, el('div', { class: 'ps-field' }, [
        el('label', { for: 'ps-timetab', text: t('Time entries are in') }),
        selCols('ps-timetab', time.table || '', [
          ['', s.timeFound ? t('Automatic ({table})', { table: s.timeFound }) : t('Automatic (none found)')],
          ...(s.timeTables || []).map((id) => [id, id]),
        ], (e) => { time.table = e.target.value || null; time.cols = null; }),
        el('p', { class: 'ps-hint', text: t('A table with a Reference to this one, a date or a start, and hours or a start and an end. Timers and logged hours are written there.') }),
        s.canSetupTime ? el('button', { type: 'button', class: 'ps-link ps-add-col', text: t('Add a time-entries table'), onclick: () => { close(); on.onSetupTime?.(); } }) : null,
      ])),
    ],
    reminders: (w) => [
      field(w, el('div', { class: 'ps-field' }, [
        el('label', { text: t('Email reminders') }),
        el('p', { class: 'ps-hint', text: t('Email the tasks that are late or due soon every morning, from your own Google account. Free: no Grist plan is needed.') }),
        el('button', { type: 'button', class: 'ps-link ps-add-col', text: t('Set up email reminders…'), onclick: () => { close(); on.onReminders?.(); } }),
      ])),
    ],
    browser: (w) => [
      field(w, F(t('Interface language'), sel('ps-lang', language, UI_LANGUAGES.map((l) => [l.id, l.id === 'auto' ? t('Automatic (Grist’s or the browser’s)') : l.label]), (e) => { language = e.target.value; }),
        t('Kept in this browser, not in the document.'), 'ps-lang')),
    ],
  };
  const { here, more } = groupsFor(mode);

  const opens = field(t('This view'), F(t('This widget opens as'), sel('ps-opens', opensAs, [['auto', t('Automatic')], ['gantt', t('Gantt chart')], ['timeline', t('Timeline')], ['board', t('Board')], ['calendar', t('Calendar')], ['booking', t('Booking grid')], ['workload', t('Workload')], ['agenda', t('Agenda')]], (e) => { opensAs = e.target.value; }),
    t('Automatic: the Agenda on a phone, otherwise the Gantt chart when the table has dates, or else the board. For everyone who opens this page; the toolbar switches the view in this browser only.'), 'ps-opens'));
  const viewPane = el('div', { class: 'ps-pane is-off', dataset: { tab: 'view' }, role: 'tabpanel' }, [
    el('p', { class: 'ps-viewname', text: `${t('This view')}: ${t(VIEW_NAME[mode])}` }),
    ...here.map((g) => sec(t(GROUP_TITLE[g]), GROUPS[g](t('This view')))),
    sec(t('This widget'), [opens]),
  ]);
  const morePane = el('div', { class: 'ps-pane is-off', dataset: { tab: 'more' }, role: 'tabpanel' }, [
    ...more.map((g) => fold(t(GROUP_TITLE[g]), GROUPS[g](t('More')))),
  ]);

  // ---- tabs and search ------------------------------------------------------------------------------------------
  const panes = { columns: columnsPane, view: viewPane, more: morePane };
  let tab = panes[s.tab] ? s.tab : 'columns';
  const tabButtons = new Map();
  const tabs = el('div', { class: 'ps-tabs', role: 'tablist', 'aria-label': t('Settings') }, TABS.map(([id, label]) => {
    const b = el('button', { type: 'button', role: 'tab', id: 'ps-tab-' + id, class: 'ps-tabs__btn', 'aria-controls': 'ps-pane-' + id, text: t(label), onclick: () => show(id),
      onkeydown: (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = TABS.findIndex(([x]) => x === id);
        const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
        show(next);
        tabButtons.get(next).focus();
      } });
    tabButtons.set(id, b);
    return b;
  }));
  for (const [id, node] of Object.entries(panes)) node.id = 'ps-pane-' + id;
  function show(id) {
    tab = id;
    // a class, not the hidden attribute: searching shows every pane at once, and the stylesheet's [hidden] rule would win
    for (const [k, node] of Object.entries(panes)) node.classList.toggle('is-off', k !== id);
    for (const [k, b] of tabButtons) { b.setAttribute('aria-selected', k === id ? 'true' : 'false'); b.tabIndex = k === id ? 0 : -1; b.classList.toggle('is-on', k === id); }
    on.onTab?.(id);
  }

  const search = el('input', { type: 'search', id: 'ps-set-find', class: 'ps-input ps-find', placeholder: t('Find a setting'), 'aria-label': t('Find a setting'), autocomplete: 'off',
    oninput: () => applySearch() });
  const noMatch = el('p', { class: 'ps-hint ps-nomatch', hidden: true });
  const folds = [...columnsPane.querySelectorAll('details'), ...morePane.querySelectorAll('details')].map((d) => ({ d, was: d.open }));
  function applySearch() {
    const words = queryWords(search.value);
    const searching = words.length > 0;
    body.classList.toggle('is-searching', searching);
    let any = false;
    for (const it of items) { const m = !searching || matchesQuery(words, it.text + ' ' + it.node.dataset.where); it.node.hidden = !m; if (m) any = true; }
    // a folded group opens while it holds a match, goes back to how it was afterwards, and is not shown when empty
    for (const f of folds) {
      const has = !!f.d.querySelector('.ps-field:not([hidden])');
      if (searching) { f.d.hidden = !has; f.d.open = has; } else { f.d.hidden = false; f.d.open = f.was; }
    }
    for (const x of body.querySelectorAll('.ps-sec')) x.hidden = searching && !x.querySelector('.ps-field:not([hidden])');
    noMatch.hidden = !(searching && !any);
    noMatch.textContent = noMatch.hidden ? '' : t('No setting matches “{q}”.', { q: search.value.trim() });
  }
  // a person folds or unfolds a group while not searching: that is how it stays afterwards
  for (const f of folds) f.d.addEventListener('toggle', () => { if (!body.classList.contains('is-searching')) f.was = f.d.open; });

  const body = el('div', { class: 'ps-drawer__body ps-set' }, [
    el('div', { class: 'ps-set__top' }, [search, tabs]),
    el('p', { class: 'ps-hint ps-scope', text: s.canEdit ? t('Saved for everyone who opens this page. The language stays in this browser.') : t('You can’t edit this document, so these settings apply only until you reload.') }),
    noMatch,
    columnsPane, viewPane, morePane,
  ]);

  const panel = el('div', { class: 'ps-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-set-title' }, [
    el('div', { class: 'ps-drawer__head' }, [
      el('h2', { id: 'ps-set-title', text: t('Settings') }),
      el('button', { type: 'button', class: 'ps-icon-btn', 'aria-label': t('Close'), text: '×', onclick: () => close() }),
    ]),
    body,
    el('div', { class: 'ps-drawer__foot' }, [
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
  refreshPreview();
  show(tab);
  host.append(scrim, panel);
  // Escape clears a search first, and closes the panel only when there is none
  release = trapFocus(panel, () => { if (search.value) { search.value = ''; applySearch(); } else close(); });
  (panes[tab].querySelector('select:not([disabled])') || tabButtons.get(tab)).focus();
  return { close };
}
