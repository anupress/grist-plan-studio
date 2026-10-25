// The weekly timesheet: one person's week (or everyone's), a row per task with the hours of each day,
// day totals and the week's, built from the time entries (model/time.js). A side drawer like Columns,
// so the view behind stays where it was. A click on a day of a task logs time there; CSV hands the
// week's entries to a spreadsheet.

import { el, clear } from '../core/util.js';
import { timesheet } from '../model/time.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

/**
 * @param s  {people: [{value, label}], person (a key, or '' for everyone), from (the week's first day), entries,
 *            taskTitle(id), today, canLog, weekLabel(from), dayLabel(day) -> [weekday, date, day of the month], hours(h) -> text,
 *            capacityOf(person) -> hours that week | null}
 * @param on {onLog({task, day, person}) (task null: pick one), onCsv({from, person}), onClose()}
 * @returns {{refresh(entries), close()}}
 */
export function openTimesheet(host, s, on) {
  let from = s.from, person = s.person ?? '', entries = s.entries;
  const body = el('div', { class: 'ps-drawer__body ps-ts' });
  const weekText = el('span', { class: 'ps-ts__week', 'aria-live': 'polite' });
  const who = el('select', { id: 'ps-ts-who', class: 'ps-input', onchange: () => { person = who.value; draw(); } }, [
    el('option', { value: '', text: t('Everyone') }),
    ...s.people.map((p) => el('option', { value: p.value, text: p.label, selected: p.value === person })),
  ]);
  const step = (n) => { from += 7 * n; draw(); };
  const navBtn = (text, label, run) => el('button', { type: 'button', class: 'ps-btn', text, 'aria-label': label, title: label, onclick: run });
  const panel = el('div', { class: 'ps-drawer ps-drawer--wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-ts-title' }, [
    el('div', { class: 'ps-drawer__head' }, [
      el('h2', { id: 'ps-ts-title', text: t('Timesheet') }),
      el('button', { type: 'button', class: 'ps-icon-btn', 'aria-label': t('Close'), text: '×', onclick: () => close() }),
    ]),
    el('div', { class: 'ps-ts__bar' }, [
      el('div', { class: 'ps-ts__who' }, [el('label', { for: 'ps-ts-who', text: t('Whose time') }), who]),
      el('div', { class: 'ps-ts__nav' }, [
        navBtn('‹', t('Week before'), () => step(-1)), weekText, navBtn('›', t('Week after'), () => step(1)),
        el('button', { type: 'button', class: 'ps-btn', text: t('This week'), onclick: () => { from = s.from; draw(); } }),
      ]),
    ]),
    body,
    el('div', { class: 'ps-drawer__foot' }, [
      el('button', { type: 'button', class: 'ps-btn', text: t('Download CSV'), title: t('This week’s entries, for a spreadsheet'), onclick: () => on.onCsv?.({ from, person: person || null }) }),
      el('span', { class: 'ps-spacer' }),
      el('button', { type: 'button', class: 'ps-btn', text: t('Close'), onclick: () => close() }),
    ]),
  ]);

  function draw() {
    weekText.textContent = s.weekLabel(from);
    const sheet = timesheet(entries, { from, person: person || null });
    const canLog = s.canLog && !!person;
    clear(body);
    const rows = sheet.rows.map((r) => ({ ...r, title: s.taskTitle(r.task) || t('(no name)') })).sort((a, b) => a.title.localeCompare(b.title));
    const dayHead = (d) => {
      const [wd, date, n] = s.dayLabel(d);
      return el('th', { class: 'ps-ts__day' + (d === s.today ? ' is-today' : ''), scope: 'col', 'aria-label': (d === s.today ? t('Today') + ', ' : '') + wd + ' ' + date }, [
        el('span', { text: d === s.today ? t('Today') : wd }),
        el('span', { class: 'ps-ts__date' }, [el('span', { class: 'ps-ts__long', text: date }), el('span', { class: 'ps-ts__short', text: n })]),
      ]);
    };
    const cell = (r, i) => {
      const d = sheet.days[i], h = r.hours[i];
      const text = h > 0.004 ? s.hours(h) : '';
      const cls = 'ps-ts__h' + (d === s.today ? ' is-today' : '');
      if (!canLog) return el('td', { class: cls, text });
      const [wd, date] = s.dayLabel(d);
      return el('td', { class: cls }, [el('button', { type: 'button', class: 'ps-ts__log' + (text ? '' : ' is-empty'), text,
        'aria-label': `${r.title}, ${wd} ${date}: ${text ? t('{h} hours', { h: text }) : t('nothing logged')}. ${t('Log time here')}`,
        onclick: () => on.onLog?.({ task: r.task, day: d, person }) })]);
    };
    if (rows.length) {
      body.append(el('table', { class: 'ps-ts__table' }, [
        el('thead', {}, [el('tr', {}, [el('th', { class: 'ps-ts__task', scope: 'col', text: t('Task') }), ...sheet.days.map(dayHead), el('th', { class: 'ps-ts__total', scope: 'col', text: t('Total') })])]),
        el('tbody', {}, rows.map((r) => el('tr', {}, [
          el('th', { class: 'ps-ts__task', scope: 'row', text: r.title, title: r.title }),
          ...r.hours.map((_, i) => cell(r, i)),
          el('td', { class: 'ps-ts__total', text: s.hours(r.total) }),
        ]))),
        el('tfoot', {}, [el('tr', {}, [
          el('th', { class: 'ps-ts__task', scope: 'row', text: t('Total') }),
          ...sheet.totals.map((h, i) => el('td', { class: 'ps-ts__h' + (sheet.days[i] === s.today ? ' is-today' : ''), text: h > 0.004 ? s.hours(h) : '' })),
          el('td', { class: 'ps-ts__total', text: s.hours(sheet.total) }),
        ])]),
      ]));
    } else {
      body.append(el('p', { class: 'ps-ts__empty', text: person ? t('Nothing logged this week.') : t('Nobody logged time this week.') }));
    }
    const cap = person ? s.capacityOf?.(person, from) : null;
    body.append(el('p', { class: 'ps-ts__sum' }, [
      el('span', { text: person && cap != null ? t('{h} of {cap} hours this week', { h: s.hours(sheet.total), cap: s.hours(cap) }) : t('{h} hours this week', { h: s.hours(sheet.total) }) }),
      canLog ? el('button', { type: 'button', class: 'ps-btn', text: t('Log time on another task…'), onclick: () => on.onLog?.({ task: null, day: Math.min(Math.max(s.today, from), from + 6), person }) }) : null,
    ]));
    if (s.canLog && !person) body.append(el('p', { class: 'ps-hint', text: t('Choose a person to log time from here.') }));
  }

  const scrim = el('div', { class: 'ps-scrim', onclick: () => close() });
  let release = () => {};
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    release();
    scrim.remove();
    panel.remove();
    on.onClose?.();
  }
  host.append(scrim, panel);
  draw();
  release = trapFocus(panel, close);
  who.focus();
  return { refresh: (next) => { entries = next; if (!closed) draw(); }, close };
}
