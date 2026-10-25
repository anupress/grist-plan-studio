// Help for first use (M16): what each view is for and what can be done in it, the same in words as the first-use tip
// that points to it, and the keys. Opened with "?" (the key or the toolbar's button).

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';
import { keyRows } from './keys.js';

export const HELP_VIEWS = ['gantt', 'timeline', 'board', 'calendar', 'booking', 'workload', 'agenda', 'overview'];

/** What a view is for, and what can be done in it: whole sentences, so they translate. */
export function helpFor(view) {
  switch (view) {
    case 'timeline': return {
      about: t('A band for each person, room or project, with its tasks stacked inside it.'),
      can: [
        t('Drag a bar to another day, or into another band to give the task to someone else.'),
        t('Drag the left or right edge of a bar to change its start or end.'),
        t('Click a bar to select it, Enter to edit it.'),
      ],
    };
    case 'board': return {
      about: t('A lane for each value of a column, such as Status, and a card for each task.'),
      can: [
        t('Drag a card to another lane to change its value, or up and down to put it in order.'),
        t('The number in a lane’s title counts its open cards; click it to set a limit.'),
        t('Add card, at the foot of a lane, adds a task there.'),
        t('Swimlanes split the lanes into rows, one for each value of another column such as the person: a card dropped in another row takes that value too.'),
        t('The arrow in a lane’s title folds it to a strip with its count; cards can still be dropped on the strip.'),
      ],
    };
    case 'calendar': return {
      about: t('A month or a week, with a bar for each task on the days it covers.'),
      can: [
        t('Drag a bar to another day: the task keeps its length and moves there.'),
        t('Click a day’s number to open its week; the + of a day adds a task on it.'),
        t('A day with more bars than fit says how many more: click it to open the week.'),
      ],
    };
    case 'booking': return {
      about: t('A row for each room, store or flat, a column for each period, and the bookings in their cells.'),
      can: [
        t('Click a free cell to book it; drag a booking to another cell to move it.'),
        t('A booking that overlaps another in the same row is flagged as double booked.'),
        t('Show, in the toolbar, keeps only the rows you want.'),
      ],
    };
    case 'workload': return {
      about: t('How many hours each person has been given against what they can do, day by day, week by week or month by month.'),
      can: [
        t('A cell over capacity says so in words; click a cell to list the tasks behind it.'),
        t('Level proposes moves inside each task’s slack, shows them first, and writes them as one step.'),
        t('With time entries, Planned, Logged and Remaining switch which hours are counted.'),
      ],
    };
    case 'overview': return {
      about: t('The plan in numbers: how many tasks are open, late or done, and a bar for each value of a column such as Status or Person.'),
      can: [
        t('By and And by, in the toolbar, choose the columns the bars are made by.'),
        t('Click a value to see only its tasks in the view you came from; Clear filters brings the rest back.'),
        t('Click a task under Needs attention or Next milestones to edit it. Print makes a one-page report.'),
      ],
    };
    case 'agenda': return {
      about: t('What needs doing, grouped by the day it is due, the late ones first.'),
      can: [
        t('Click a task to edit it. Mine shows only your tasks.'),
        t('Add to calendar downloads a file with these dates; Email reminders sets up a morning email.'),
      ],
    };
    default: return {
      about: t('The plan on a calendar: a bar for each task from its start to its end, a summary bar over each parent, and arrows for what waits for what.'),
      can: [
        t('Drag a bar to move the task, or its left or right edge to change its start or end.'),
        t('Drag across an empty row to give a task with no dates its dates.'),
        t('Drag the dot at the end of a bar onto another bar: that task then starts after this one ends. Click an arrow to remove the link.'),
        t('Click ▸ or ▾ to fold a parent or a group. Double-click a task to open Grist’s own card.'),
        t('Drag the empty part of the chart to move across it. Ctrl and the wheel zoom around the pointer. Drag the edge of the names, in the heading, to widen them.'),
        t('Set baseline remembers today’s dates as the plan. A bar that later moves shows the plan as a thin line under it, and says by how many days.'),
      ],
    };
  }
}

/** The first-use tip of a view: one sentence, shown once, that says what to try. */
export function tipFor(view) {
  switch (view) {
    case 'timeline': return t('Drag a bar to another day, or into another band to hand the task over. Help lists the rest.');
    case 'board': return t('Drag a card to another lane to change its value there. Help lists the rest.');
    case 'calendar': return t('Drag a bar to another day. The + of a day adds a task on it. Help lists the rest.');
    case 'booking': return t('Click a free cell to book it, or drag a booking to move it. Help lists the rest.');
    case 'workload': return t('A cell over capacity names the day; click it to see the tasks behind it. Help lists the rest.');
    case 'agenda': return t('Tasks by the day they need someone, the late ones first. Click one to edit it. Help lists the rest.');
    case 'overview': return t('Click a value to see only its tasks. By, in the toolbar, picks the column. Help lists the rest.');
    default: return t('Drag a bar to move a task, or its edge to change its length. Help lists the rest.');
  }
}

/** Good to know whatever the view: what the strips and buttons do and do not do. */
const general = () => [
  t('Search and the chips under the toolbar leave tasks out of the view; they never change your table.'),
  t('Display sets how rows and bars look in this browser. Settings says which column means what.'),
  t('Each change you make is one step in Grist’s Undo (Ctrl+Z).'),
  t('A task’s edit window can duplicate it, with its sub-tasks, or delete it. Both are one step in Undo.'),
];

/**
 * @param host the app shell
 * @param view the view on show
 * @param viewName its name, as the toolbar says it
 */
export function openHelp(host, view, viewName, on = {}) {
  const h = helpFor(view);
  const done = () => { release(); scrim.remove(); box.remove(); on.onClose?.(); };
  const scrim = el('div', { class: 'ps-scrim', onclick: done });
  const closeBtn = el('button', { type: 'button', class: 'ps-btn', text: t('Close'), onclick: done });
  const box = el('div', { class: 'ps-dialog ps-dialog--keys ps-dialog--help', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-help-t' }, [
    el('h2', { id: 'ps-help-t', text: t('Help: {view}', { view: viewName }) }),
    el('div', { class: 'ps-help__body' }, [
      el('p', { class: 'ps-help__about', text: h.about }),
      el('h3', { text: t('What you can do') }),
      el('ul', { class: 'ps-help__list' }, h.can.map((x) => el('li', { text: x }))),
      el('h3', { text: t('Good to know') }),
      el('ul', { class: 'ps-help__list' }, general().map((x) => el('li', { text: x }))),
      el('h3', { text: t('Keyboard shortcuts') }),
      // key names are translated too: Ctrl is Strg on a German keyboard
      el('dl', { class: 'ps-keys' }, keyRows(view).flatMap(([k, what]) => [el('dt', {}, [el('kbd', { text: t(k) })]), el('dd', { text: t(what) })])),
    ]),
    el('div', { class: 'ps-dialog__foot' }, [closeBtn]),
  ]);
  host.append(scrim, box);
  const release = trapFocus(box, done);
  closeBtn.focus();
}
