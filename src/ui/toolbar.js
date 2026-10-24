// The strip above the views: which view, what is shown, and that view's own controls (zoom, Fit,
// Today and New task for the Gantt chart; lanes and zoom for the timeline; the lane column for the
// board; rows, periods and a filter for the booking grid), plus the Columns panel.

import { el, clear } from '../core/util.js';
import { ZOOM_ORDER } from '../views/gantt/layout.js';
import { t, tn } from '../i18n/index.js';
import { ANUPRESS_LOGO } from '../core/assets/brand-logo.js';
import { VERSION } from '../version.js';

const ZOOM_LABELS = { day: 'Days', week: 'Weeks', month: 'Months', quarter: 'Quarters', year: 'Years' };
const VIEW_LABELS = { gantt: 'Gantt', timeline: 'Timeline', board: 'Board', booking: 'Bookings' };

const seg = (label, items, current, onPick) => el('div', { class: 'ps-seg', role: 'group', 'aria-label': label }, items.map(([id, text]) => el('button', {
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
 * @param {{level, mode, zoom, counts: {tasks, unscheduled, flagged, cards, bookings, clashes, outside}, demo, editable,
 *          readOnlyWhy, canAdd, groupOptions, groupBy, hasLinks, critical, laneOptions, laneBy, tlLaneOptions, tlLaneBy,
 *          rowOptions, rowsBy, periodOptions, periodsBy, filterOptions, filterBy, examples, example}} s
 * @param {{onMode, onZoom, onFit, onToday, onColumns, onNew, onUndated, onGroup, onCritical, onLanes, onTlLanes,
 *          onRows, onPeriods, onFilter, onClash, onExample, onPrint, onKeys}} on
 */
export function renderToolbar(host, s, on) {
  const view = s.mode;
  const level = s.level || 'full';
  const c = s.counts;
  const counts = [];
  if (view === 'board') counts.push(el('span', { text: tn(c.cards, '{n} card', '{n} cards') }));
  else if (view === 'booking') {
    counts.push(el('span', { text: tn(c.bookings, '{n} booking', '{n} bookings') }));
    if (c.clashes) counts.push(el('button', { type: 'button', class: 'ps-link ps-warn', text: tn(c.clashes, '{n} double booked', '{n} double booked'), title: t('Show the first one'), onclick: on.onClash }));
    if (c.outside) counts.push(el('span', { text: tn(c.outside, '{n} not in these columns', '{n} not in these columns'), title: t('Bookings outside these periods, or with no value in the period column') }));
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
      level === 'bare' ? null : seg(t('View'), Object.entries(VIEW_LABELS).map(([id, label]) => [id, t(label)]), view, on.onMode),
      level === 'full' ? el('span', { class: 'ps-counts' }, counts.flatMap((x, i) => (i ? [' · ', x] : [x]))) : null,
    ]),
    el('div', { class: 'ps-bar-right' }, [
      ...tools,
      level === 'full' ? button(t('Print'), t('Print or save as PDF (Ctrl+P)'), on.onPrint) : null,
      level === 'bare' ? null : el('button', { type: 'button', class: 'ps-btn ps-btn--key', text: '?', title: t('Keyboard shortcuts (?)'), 'aria-label': t('Keyboard shortcuts'), onclick: on.onKeys }),
      level === 'bare' ? null : button(t('Columns'), t('Which column is the start, the end, the status…'), on.onColumns),
    ]),
  );
}
