// The strip under the toolbar (M14): a search by name, a chip for each column worth filtering by (who, status,
// project, and any column added with "Filter"), and in words how much of the table is on show. It keeps its own
// elements between updates, so typing in the search box or ticking values in a chip's list is never interrupted
// by the redraw its own change causes.

import { el, clear } from '../core/util.js';
import { t } from '../i18n/index.js';

const MANY = 8;   // a list longer than this gets a box to find a value in

/**
 * @typedef {object} BarState
 * @property {boolean} visible
 * @property {string}  q            the search
 * @property {Array<{id, label, role, selected: string[], selectedValues: string[], extra: boolean}>} chips   selected: what is chosen, as words; selectedValues: as the filter stores it
 * @property {Array<{id, label}>} addable                                             columns the Filter menu offers
 * @property {boolean} active       the filters leave something out
 * @property {number}  shown
 * @property {number}  total
 * @property {string|null} note     a sentence about what the filter does to this view's numbers
 * @property {{on: boolean} | null} mine   the switch for the person this browser says it is; null when the tasks have no people (M22)
 */
/**
 * @param on {onQuery(q), onToggle(colId, value), onClearColumn(colId), onRemoveColumn(colId), onClear(), onAdd(colId), onMine(),
 *            choices(colId) -> {items: [{value, label, count}], more: number}}
 */
export function createFilterBar(on) {
  let state = null;
  let openId = null;          // the chip whose list is open
  let valueQuery = '';        // what is typed in that list's own box
  let timer = 0;

  const input = el('input', {
    type: 'search', class: 'ps-input ps-find__input', placeholder: t('Search by name'), 'aria-label': t('Search by name'), autocomplete: 'off', spellcheck: 'false',
    oninput: () => { clearTimeout(timer); timer = setTimeout(() => on.onQuery(input.value), 160); },
    onkeydown: (e) => {
      if (e.key === 'Enter') { clearTimeout(timer); on.onQuery(input.value); }
      else if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; clearTimeout(timer); on.onQuery(''); }
    },
  });
  const chips = el('div', { class: 'ps-find__chips' });
  const add = el('select', { class: 'ps-input ps-input--inline ps-find__add', 'aria-label': t('Add a filter'), onchange: (e) => { const id = e.target.value; e.target.value = ''; if (id) { openId = id; valueQuery = ''; on.onAdd(id); requestAnimationFrame(() => chips.querySelector('.ps-pop input')?.focus()); } } });
  const status = el('p', { class: 'ps-find__status', role: 'status', 'aria-live': 'polite' });
  const bar = el('div', { class: 'ps-filterbar', role: 'search', 'aria-label': t('Filter the tasks') }, [
    el('div', { class: 'ps-find__box' }, [input]), chips, el('label', { class: 'ps-find__addwrap' }, [add]), status,
  ]);

  function close(refocus = true) {
    const id = openId;
    openId = null; valueQuery = '';
    draw();
    if (id && refocus) chips.querySelector(`[data-chip="${CSS.escape(id)}"] .ps-chip`)?.focus();
  }

  function summary(chip) {
    if (!chip.selected.length) return chip.label;
    return chip.selected.length === 1 ? `${chip.label}: ${chip.selected[0]}` : `${chip.label}: ${t('{n} selected', { n: chip.selected.length })}`;
  }

  function list(chip) {
    const { items, more } = on.choices(chip.id);
    const chosen = new Set(chip.selectedValues);
    const words = valueQuery.trim().toLowerCase();
    const shown = words ? items.filter((x) => x.label.toLowerCase().includes(words)) : items;
    const box = items.length > MANY
      ? el('input', {
        type: 'search', class: 'ps-input ps-pop__find', placeholder: t('Find a value'), 'aria-label': t('Find a value'), value: valueQuery, dataset: { fk: 'find' },
        oninput: (e) => { valueQuery = e.target.value; draw(); },
      }) : null;
    const rows = shown.map((x, i) => el('li', {}, [el('label', { class: 'ps-pop__item' + (x.count === 0 && !chosen.has(x.value) ? ' is-zero' : '') }, [
      el('input', { type: 'checkbox', checked: chosen.has(x.value), dataset: { fk: 'v' + i }, onchange: () => on.onToggle(chip.id, x.value) }),
      el('span', { class: 'ps-pop__text', text: x.label, title: x.label }),
      el('span', { class: 'ps-pop__count', text: String(x.count) }),
    ])]));
    return [
      box,
      rows.length ? el('ul', { class: 'ps-pop__list' }, rows) : el('p', { class: 'ps-pop__none', text: items.length ? t('No value matches “{q}”.', { q: valueQuery.trim() }) : t('This column has no values yet.') }),
      more ? el('p', { class: 'ps-pop__none', text: t('{n} more values are not listed: search by name instead.', { n: more }) }) : null,
    ];
  }

  function popover(chip) {
    const pop = el('div', {
      class: 'ps-pop', role: 'dialog', 'aria-label': t('Filter by {col}', { col: chip.label }),
      onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } },
    }, [
      ...list(chip),
      el('div', { class: 'ps-pop__foot' }, [
        el('button', { type: 'button', class: 'ps-link', text: t('Clear'), disabled: !chip.selected.length, onclick: () => on.onClearColumn(chip.id) }),
        chip.extra && !chip.selected.length ? el('button', { type: 'button', class: 'ps-link', text: t('Remove this filter'), onclick: () => { openId = null; on.onRemoveColumn(chip.id); } }) : null,
        el('button', { type: 'button', class: 'ps-btn ps-btn--sm', text: t('Close'), onclick: () => close() }),
      ]),
    ]);
    return pop;
  }

  function draw() {
    if (!state) return;
    const focusKey = bar.contains(document.activeElement) ? document.activeElement.dataset?.fk || document.activeElement.closest?.('[data-chip]')?.dataset.chip : null;
    const wasChip = bar.contains(document.activeElement) && document.activeElement.classList.contains('ps-chip');
    bar.hidden = !state.visible;
    // the words are set here, not where the elements are made: the strip is built before the language is known
    input.placeholder = t('Search by name');
    input.setAttribute('aria-label', t('Search by name'));
    add.setAttribute('aria-label', t('Add a filter'));
    bar.setAttribute('aria-label', t('Filter the tasks'));
    if (document.activeElement !== input && input.value !== state.q) input.value = state.q;
    clear(chips);
    if (state.mine) {
      chips.appendChild(el('button', {
        type: 'button', class: 'ps-chip ps-chip--toggle' + (state.mine.on ? ' is-on' : ''), 'aria-pressed': state.mine.on ? 'true' : 'false', dataset: { fk: 'mine' },
        title: state.mine.on ? t('Showing only your tasks. Click to show everyone’s.') : t('Show only your tasks'), onclick: () => on.onMine?.(),
      }, [el('span', { class: 'ps-chip__text', text: t('Mine') })]));
    }
    for (const chip of state.chips) {
      const isOpen = openId === chip.id;
      const btn = el('button', {
        type: 'button', class: 'ps-chip' + (chip.selected.length ? ' is-on' : ''), 'aria-haspopup': 'dialog', 'aria-expanded': isOpen ? 'true' : 'false',
        title: chip.selected.length ? chip.selected.join(', ') : t('Filter by {col}', { col: chip.label }),
        onclick: () => { openId = isOpen ? null : chip.id; valueQuery = ''; draw(); if (openId) requestAnimationFrame(() => chips.querySelector('.ps-pop input')?.focus()); },
      }, [el('span', { class: 'ps-chip__text', text: summary(chip) })]);
      const wrap = el('div', { class: 'ps-find__chip', dataset: { chip: chip.id } }, [btn, isOpen ? popover(chip) : null]);
      chips.appendChild(wrap);
    }
    clear(add).append(el('option', { value: '', text: t('+ Filter') }), ...state.addable.map((o) => el('option', { value: o.id, text: o.label })));
    add.disabled = !state.addable.length;
    add.parentElement.hidden = !state.addable.length;
    // what is on show, in words
    clear(status);
    if (state.active) {
      status.append(
        el('span', { class: 'ps-find__count', text: t('{shown} of {total} shown', { shown: state.shown, total: state.total }) }),
        el('button', { type: 'button', class: 'ps-link ps-find__clear', text: t('Clear filters'), onclick: () => on.onClear() }),
      );
      if (state.note) status.append(el('span', { class: 'ps-find__note', text: state.note }));
    }
    status.hidden = !state.active;
    // keep the list inside the frame, and the focus where it was
    const pop = chips.querySelector('.ps-pop');
    if (pop) {
      const r = pop.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) { pop.style.left = 'auto'; pop.style.right = '0'; }
    }
    if (focusKey) {
      const target = wasChip ? chips.querySelector(`[data-chip="${CSS.escape(focusKey)}"] .ps-chip`) : bar.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
      if (target && document.activeElement !== target) target.focus({ preventScroll: true });
    }
  }

  // a click anywhere else closes the list
  const away = (e) => { if (openId && !bar.contains(e.target)) close(false); };
  document.addEventListener('pointerdown', away, true);

  return {
    el: bar,
    update(next) { state = next; draw(); },
    openChip(id) { openId = id; valueQuery = ''; draw(); requestAnimationFrame(() => chips.querySelector('.ps-pop input')?.focus()); },
    destroy() { document.removeEventListener('pointerdown', away, true); clearTimeout(timer); bar.remove(); },
  };
}
