// The strip above the views: which view, what is shown, and that view's own controls (zoom, Fit,
// Today and New task for the Gantt chart; lanes and zoom for the timeline; the lane column for the
// board; rows, periods and a filter for the booking grid; rows, periods and Level for the workload), plus
// the settings panel.

import { el, clear } from '../core/util.js';
import { ZOOM_ORDER } from '../views/gantt/layout.js';
import { t, tn } from '../i18n/index.js';
import { ANUPRESS_LOGO } from '../core/assets/brand-logo.js';
import { VERSION } from '../version.js';

const ZOOM_LABELS = { day: 'Days', week: 'Weeks', month: 'Months', quarter: 'Quarters', year: 'Years' };
const VIEW_LABELS = { gantt: 'Gantt', timeline: 'Timeline', board: 'Board', calendar: 'Calendar', booking: 'Bookings', workload: 'Workload', agenda: 'Agenda' };
const WL_UNIT_LABELS = { day: 'Days', week: 'Weeks', month: 'Months' };

const seg = (label, items, current, onPick, extra = '') => el('div', { class: 'ps-seg' + (extra ? ' ' + extra : ''), role: 'group', 'aria-label': label }, items.map(([id, text]) => el('button', {
  type: 'button', class: 'ps-seg__btn' + (id === current ? ' is-on' : ''), 'aria-pressed': id === current ? 'true' : 'false',
  text, onclick: () => { if (id !== current) onPick(id); },
})));

const picker = (label, aria, options, current, onPick, noneText = null) => el('label', { class: 'ps-group' }, [
  el('span', { class: 'ps-group__label', text: label }),
  el('select', { class: 'ps-input ps-input--inline', 'aria-label': aria, onchange: (e) => onPick(e.target.value || null) }, [
    noneText ? el('option', { value: '', text: noneText }) : null,
    ...options.map((o) => el('option', { value: o.id, text: o.label, selected: o.id === current })),
  ]),
]);
const button = (text, title, onclick, cls = '') => el('button', { type: 'button', class: 'ps-btn' + cls, text, title, onclick });

/**
 *   level: 'full' (default); 'switch' when the view shows a message instead (only the view switch and Columns);
 *   'bare' before the widget can work at all (the brand and the mode only)
 * @param {{level, mode, zoom, counts: {tasks, unscheduled, flagged, cards, bookings, clashes, outside, overloads, noHours, logged (text, Logged only)}, demo, editable,
 *          readOnlyWhy, canAdd, groupOptions, groupBy, hasLinks, critical, laneOptions, laneBy, tlLaneOptions, tlLaneBy,
 *          rowOptions, rowsBy, periodOptions, periodsBy, filterOptions, filterBy, wlRowOptions, wlRowsBy, wlUnit, wlMeasure (null without time entries), canLevel,
 *          agendaWho ('mine' | 'all' | null without people), agendaDoable, canCalendar, narrow (a phone: no calendar),
 *          timer: {title, since, elapsed} | null, hasTime, display: {available, changed, open}, examples, example}} s
 * @param {{onMode, onZoom, onFit, onToday, onColumns, onNew, onUndated, onGroup, onCritical, onLanes, onTlLanes,
 *          onRows, onPeriods, onFilter, onClash, onWlRows, onWlUnit, onWlMeasure, onAgendaWho, onCalendar, onReminders, onViews, onDisplay, onLevel, onOverload, onStopTimer, onTimesheet, onExample,
 *          onPrint, onHelp}} on
 */
export function renderToolbar(host, s, on) {
  const view = s.mode;
  const level = s.level || 'full';
  const c = s.counts;
  // The calendar needs a screen wider than a phone's: seven columns would leave the names unreadable.
  const viewList = Object.entries(VIEW_LABELS).filter(([id]) => id !== 'calendar' || !s.narrow);
  const counts = [];
  if (view === 'agenda') {
    // rows that can be finished are tasks; a table without Done, Status or Progress just has items
    counts.push(el('span', { text: s.agendaDoable ? tn(c.open, '{n} open task', '{n} open tasks') : tn(c.open, '{n} item', '{n} items') }));
    if (c.late) counts.push(el('span', { class: 'ps-warn', text: tn(c.late, '{n} late', '{n} late') }));
  } else if (view === 'board') counts.push(el('span', { text: tn(c.cards, '{n} card', '{n} cards') }));
  else if (view === 'booking') {
    counts.push(el('span', { text: tn(c.bookings, '{n} booking', '{n} bookings') }));
    if (c.clashes) counts.push(el('button', { type: 'button', class: 'ps-link ps-warn', text: tn(c.clashes, '{n} double booked', '{n} double booked'), title: t('Show the first one'), onclick: on.onClash }));
    if (c.outside) counts.push(el('span', { text: tn(c.outside, '{n} not in these columns', '{n} not in these columns'), title: t('Bookings outside these periods, or with no value in the period column') }));
  } else if (view === 'workload') {
    counts.push(el('span', { text: tn(c.tasks, '{n} task', '{n} tasks') }));
    if (c.logged != null) counts.push(el('span', { text: t('{h} h logged', { h: c.logged }), title: t('In the dates shown') }));
    else counts.push(c.overloads
      ? el('button', { type: 'button', class: 'ps-link ps-warn', text: tn(c.overloads, '{n} day over capacity', '{n} days over capacity'), title: t('From today on. Show the first one.'), onclick: on.onOverload })
      : el('span', { class: 'ps-ok', text: t('nobody over capacity') }));
    if (c.noHours) counts.push(el('span', { text: tn(c.noHours, '{n} without hours', '{n} without hours'), title: t('Tasks whose Hours of work cell is empty count for nothing here.') }));
  } else {
    counts.push(el('span', { text: tn(c.tasks, '{n} task', '{n} tasks') }));
    if (c.unscheduled) {
      counts.push(view === 'gantt'
        ? el('button', { type: 'button', class: 'ps-link', text: tn(c.unscheduled, '{n} without dates', '{n} without dates'), title: t('Show the tasks without dates'), onclick: on.onUndated })
        : el('span', { text: tn(c.unscheduled, '{n} without dates', '{n} without dates') }));
    }
    if (c.flagged) counts.push(el('span', { class: 'ps-warn', text: tn(c.flagged, '{n} with end before start', '{n} with end before start') }));
  }

  // A dot plus a word, never the colour alone, as on Invoice Studio's bar.
  const mode = s.demo ? 'demo' : s.editable ? 'live' : 'ro';
  const modeText = { live: t('Connected'), ro: t('Read only'), demo: t('Demo') }[mode];
  const zoomTools = () => [
    seg(t('Zoom'), ZOOM_ORDER.map((z) => [z, t(ZOOM_LABELS[z])]), s.zoom, on.onZoom),
    button(t('Fit'), t('Zoom so every task fits'), on.onFit),
    button(t('Today'), t('Scroll to today (T)'), on.onToday),
  ];

  let tools = [];
  if (level === 'full') {
    if (view === 'gantt') {
      tools = [
        s.canAdd ? button(t('+ New task'), null, on.onNew, ' ps-btn--primary') : null,
        s.groupOptions?.length ? picker(t('Group'), t('Group rows by'), s.groupOptions, s.groupBy, on.onGroup, t('No groups')) : null,
        s.hasLinks ? el('button', { type: 'button', class: 'ps-btn' + (s.critical ? ' is-on' : ''), 'aria-pressed': s.critical ? 'true' : 'false',
          text: t('Critical path'), title: t('Show the tasks that decide the end date'), onclick: on.onCritical }) : null,
        ...zoomTools(),
      ];
    } else if (view === 'calendar') {
      tools = [s.canAdd ? button(t('+ New task'), t('A task for today'), on.onNew, ' ps-btn--primary') : null];
    } else if (view === 'timeline') {
      tools = [s.tlLaneOptions?.length ? picker(t('Lanes'), t('Make a lane for each value of'), s.tlLaneOptions, s.tlLaneBy, on.onTlLanes) : null, ...zoomTools()];
    } else if (view === 'board') {
      tools = [s.laneOptions?.length ? picker(t('Lanes'), t('Make a lane for each value of'), s.laneOptions, s.laneBy, on.onLanes) : null];
    } else if (view === 'booking') {
      tools = [
        s.rowOptions?.length ? picker(t('Rows'), t('A row for each'), s.rowOptions, s.rowsBy, on.onRows) : null,
        s.filterOptions?.length ? picker(t('Show'), t('Show only some rows'), s.filterOptions, s.filterBy, on.onFilter, t('all')) : null,
        s.periodOptions?.length ? picker(t('Columns are'), t('A column for each'), s.periodOptions, s.periodsBy, on.onPeriods) : null,
        // Weekend 1, 2, 3 have no dates, so there is no today to scroll to.
        s.periodsBy?.startsWith('col:') ? null : button(t('Today'), t('Scroll to today'), on.onToday),
      ];
    } else if (view === 'agenda') {
      tools = [
        s.agendaWho ? seg(t('Show'), [['mine', t('Mine')], ['all', t('Everyone')]], s.agendaWho, on.onAgendaWho) : null,
        s.canCalendar ? button(t('Add to calendar'), t('A calendar file with the dates below and a reminder'), on.onCalendar) : null,
        button(t('Email reminders'), t('Email the tasks that are late or due soon, every morning'), on.onReminders, ' ps-hide-narrow'),
      ];
    } else if (view === 'workload') {
      tools = [
        s.canLevel ? button(t('Level'), t('Move tasks later, inside their slack, until nobody is over capacity. You see the moves first.'), on.onLevel, ' ps-btn--primary') : null,
        s.wlRowOptions?.length ? picker(t('Rows'), t('A row for each'), s.wlRowOptions, s.wlRowsBy, on.onWlRows) : null,
        // which hours: the plan, the time entries, or the plan less the time entries from today on
        s.wlMeasure ? seg(t('Hours'), [['planned', t('Planned')], ['logged', t('Logged')], ['remaining', t('Remaining')]], s.wlMeasure, on.onWlMeasure) : null,
        seg(t('Periods'), Object.entries(WL_UNIT_LABELS).map(([u, label]) => [u, t(label)]), s.wlUnit, on.onWlUnit),
        button(t('Today'), t('Scroll to today'), on.onToday),
      ];
    }
  }

  clear(host).append(
    el('div', { class: 'ps-bar-left' }, [
      // The mark is the credit: it links home, the way the other widgets' do.
      el('a', { class: 'ps-brand', href: 'https://anupress.com', target: '_blank', rel: 'noopener', title: t('By ANUPRESS (anupress.com)') }, [
        el('img', { class: 'ps-brand__logo', src: ANUPRESS_LOGO, alt: 'ANUPRESS' }),
        el('span', { class: 'ps-brand__name', text: 'Plan Studio' }),
      ]),
      el('span', { class: 'ps-mode is-' + mode, title: mode === 'ro' && s.readOnlyWhy ? s.readOnlyWhy : 'Plan Studio v' + VERSION }, [
        el('span', { class: 'ps-mode__dot', 'aria-hidden': 'true' }),
        el('span', { text: modeText }),
      ]),
      s.demo && s.examples?.length ? picker(t('Example'), t('Example'), s.examples, s.example, on.onExample) : null,
      // A strip of views on a wide screen, one menu on a phone (the stylesheet shows one of them)
      level === 'bare' ? null : seg(t('View'), viewList.map(([id, label]) => [id, t(label)]), view, on.onMode, 'ps-seg--views'),
      level === 'bare' ? null : el('select', { class: 'ps-input ps-viewpick', 'aria-label': t('View'), onchange: (e) => on.onMode(e.target.value) },
        viewList.map(([id, label]) => el('option', { value: id, text: t(label), selected: id === view }))),
      level === 'full' ? el('span', { class: 'ps-counts' }, counts.flatMap((x, i) => (i ? [' · ', x] : [x]))) : null,
    ]),
    el('div', { class: 'ps-bar-right' }, [
      ...tools,
      // A running timer, said in words: which task and for how long (the time ticks in main.js), and Stop.
      s.timer && level !== 'bare' ? el('div', { class: 'ps-timer', role: 'status', title: t('Your timer is running on “{task}”', { task: s.timer.title }) }, [
        el('span', { class: 'ps-timer__dot', 'aria-hidden': 'true' }),
        el('span', { class: 'ps-timer__task', text: s.timer.title }),
        el('span', { class: 'ps-timer__time', dataset: { since: String(s.timer.since) }, text: s.timer.elapsed }),
        el('button', { type: 'button', class: 'ps-timer__stop', text: t('Stop'), title: t('Stop the timer and log its time'), onclick: on.onStopTimer }),
      ]) : null,
      s.hasTime && level === 'full' ? button(t('Timesheet'), t('Hours logged this week, per task and day'), on.onTimesheet) : null,
      level === 'full' && s.display?.available ? el('button', {
        type: 'button', class: 'ps-btn ps-display-btn' + (s.display.changed ? ' is-on' : ''), text: t('Display'), 'aria-haspopup': 'dialog', 'aria-expanded': s.display.open ? 'true' : 'false',
        title: s.display.changed ? t('How rows and bars look: changed from the default') : t('How rows and bars look: row height, order, colours, names, columns'), onclick: on.onDisplay,
      }) : null,
      level === 'full' ? button(t('Views'), t('Saved views: a view as you set it up, under a name'), on.onViews) : null,
      level === 'full' && view !== 'agenda' ? button(t('Print'), t('Print or save as PDF (Ctrl+P)'), on.onPrint, ' ps-hide-narrow') : null,
      level === 'bare' ? null : el('button', { type: 'button', class: 'ps-btn ps-btn--key ps-hide-narrow', text: '?', title: t('Help and keyboard shortcuts (?)'), 'aria-label': t('Help'), onclick: on.onHelp }),
      level === 'bare' ? null : button(t('Settings'), t('Columns, how dates are read, and what each view shows'), on.onColumns, ' ps-columns-btn'),
    ]),
  );
}
