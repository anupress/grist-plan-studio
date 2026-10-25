// The agenda: open tasks (or bookings) in a list under the day they next need someone, built for a
// phone first: one column, rows you can hit with a thumb, the late ones on top. Drawing only; what
// goes in which group is decided in model/agenda.js.
//
//   tap a row, or Enter     quick edit (it selects the task, and Grist's cursor follows)
//   arrow keys              move from row to row
//
// Rows are buttons in a list under a heading per group, so a screen reader hears "Late, 2 tasks" and
// walks the rows; late is said in words in the row, not only in red.

import { el, clear } from '../../core/util.js';
import { t, tn } from '../../i18n/index.js';

const CAP = 150;   // rows drawn per group before a "Show all" button

const GROUP_LABELS = {
  late: 'Late', today: 'Today', tomorrow: 'Tomorrow', now: 'Under way', week: 'This week', next: 'Next week', later: 'Later', undated: 'No date',
};

/**
 * @param on {onQuickEdit(id), onSelect(id, {ctrl, shift}) (a click with Ctrl or Shift), onAnnounce(text)}
 */
export function createAgenda(host, on = {}) {
  // model: {groups: [{id, items: [{task, day, what, late}]}], selectedId, fmtDay(day) -> "Fri 6 Nov", empty: {title, body} | null}
  let model = null;
  const expanded = new Set();

  const root = el('div', { class: 'ps-ag', tabindex: '-1', role: 'region', 'aria-label': t('Agenda') });
  clear(host).appendChild(root);

  const whenText = (it) => {
    if (it.day == null) return null;
    const d = model.fmtDay(it.day);
    switch (it.what) {
      case 'due': return t('Due {date}', { date: d });
      case 'starts': return t('Starts {date}', { date: d });
      case 'until': return t('Until {date}', { date: d });
      case 'ends': return t('Ends {date}', { date: d });
      case 'on': return d;
      default: return null;
    }
  };

  function row(it) {
    const x = it.task;
    const details = [whenText(it), x.people.join(', ') || null, x.status].filter(Boolean);
    const late = it.late > 0 ? tn(it.late, '{n} day late', '{n} days late') : null;
    const label = [x.title || t('(no name)'), late, ...details].join(', ');
    return el('li', { class: 'ps-ag__item' }, [
      el('button', {
        type: 'button', class: 'ps-ag__row' + (x.id === model.selectedId || model.multi?.has(x.id) ? ' is-selected' : '') + (x.colour ? ' has-stripe' : ''),
        dataset: { id: String(x.id) }, 'aria-label': label, 'aria-current': x.id === model.selectedId ? 'true' : null,
        style: x.colour ? { '--stripe': x.colour } : {},
        onclick: (e) => (e.ctrlKey || e.metaKey || e.shiftKey ? on.onSelect?.(x.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }) : on.onQuickEdit?.(x.id)),
      }, [
        el('span', { class: 'ps-ag__main' }, [
          el('span', { class: 'ps-ag__title', text: x.title || t('(no name)') }),
          details.length ? el('span', { class: 'ps-ag__details', text: details.join(' · ') }) : null,
        ]),
        late ? el('span', { class: 'ps-ag__late', text: late }) : null,
      ]),
    ]);
  }

  function group(g) {
    const open = expanded.has(g.id) ? g.items : g.items.slice(0, CAP);
    const id = 'ps-ag-' + g.id;
    return el('section', { class: 'ps-ag__group is-' + g.id, 'aria-labelledby': id }, [
      el('h2', { class: 'ps-ag__head', id }, [
        el('span', { class: 'ps-ag__name', text: t(GROUP_LABELS[g.id]) }),
        el('span', { class: 'ps-ag__count', text: String(g.items.length) }),
      ]),
      el('ul', { class: 'ps-ag__list' }, open.map(row)),
      g.items.length > open.length
        ? el('button', { type: 'button', class: 'ps-ag__more', text: t('Show all {n}', { n: g.items.length }), onclick: () => { expanded.add(g.id); render(); } }) : null,
    ]);
  }

  function render() {
    const top = root.scrollTop;
    const focused = document.activeElement?.closest?.('.ps-ag__row')?.dataset.id;
    clear(root);
    if (model.empty) {
      root.appendChild(el('div', { class: 'ps-ag__empty' }, [el('h2', { text: model.empty.title }), el('p', { text: model.empty.body })]));
    } else {
      root.appendChild(el('div', { class: 'ps-ag__col' }, model.groups.map(group)));
    }
    root.scrollTop = top;
    if (focused) root.querySelector(`.ps-ag__row[data-id="${focused}"]`)?.focus({ preventScroll: true });
  }

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...root.querySelectorAll('.ps-ag__row')];
    const i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    next.focus();
    on.onAnnounce?.(next.getAttribute('aria-label'));
  });

  return {
    update(next) { model = next; render(); },
    reveal(id) { root.querySelector(`.ps-ag__row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }); },
    scrollToToday() { root.scrollTop = 0; },
    focus() { (root.querySelector('.ps-ag__row') || root).focus({ preventScroll: true }); },
    destroy() { clear(host); },
  };
}
