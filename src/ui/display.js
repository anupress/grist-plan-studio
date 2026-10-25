// The Display panel (M15): how the rows and bars look for this person: row height, the order of the rows, what colours
// the bars, where a bar's name goes, week numbers, weekends and the today line, and the columns beside the names.
// It is not a dialog: it sits under the toolbar without hiding the view, and every choice applies at once, so the
// person sees what it does. Nothing here is written to the document.

import { el, clear } from '../core/util.js';
import { t } from '../i18n/index.js';

/** The sections each view has. */
export const SECTIONS = {
  gantt: ['density', 'sort', 'colour', 'labels', 'show', 'cols'],
  timeline: ['density', 'lanes', 'colour', 'labels', 'show'],
  board: ['density', 'sort', 'colour'],
  calendar: ['density', 'colour'],
  booking: ['density'],
  workload: ['density'],
  agenda: ['density'],
};

/**
 * @typedef {object} DisplayState
 * @property {string} mode
 * @property {object} display          the clean choice (model/display.js)
 * @property {Array<{id, label}>} sortOptions    columns the rows can be sorted by
 * @property {Array<{id, label}>} colourOptions  columns the bars can be coloured by
 * @property {Array<{id, label}>} colOptions     columns the list can show
 * @property {number} maxCols
 * @property {boolean} isDefault
 */
/**
 * @param host the app shell
 * @param on {onChange(patch), onReset(), onClose()}
 * @returns {{refresh(state), close()}}
 */
export function openDisplay(host, state, on) {
  let s = state;
  const panel = el('div', { class: 'ps-disp', role: 'dialog', 'aria-label': t('Display'), onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } } });
  host.appendChild(panel);
  const top = host.querySelector('.ps-toolbar');
  const place = () => { panel.style.top = ((top?.offsetHeight || 48) + 6) + 'px'; };

  const seg = (label, items, current, key) => el('div', { class: 'ps-disp__row' }, [
    el('span', { class: 'ps-disp__label', id: 'ps-d-' + key, text: label }),
    el('div', { class: 'ps-seg', role: 'group', 'aria-labelledby': 'ps-d-' + key }, items.map(([id, text]) => el('button', {
      type: 'button', class: 'ps-seg__btn' + (id === current ? ' is-on' : ''), 'aria-pressed': id === current ? 'true' : 'false', text, dataset: { fk: key + ':' + id },
      onclick: () => { if (id !== current) on.onChange({ [key]: id }); },
    }))),
  ]);
  const select = (label, key, options, current, none) => el('label', { class: 'ps-disp__row' }, [
    el('span', { class: 'ps-disp__label', text: label }),
    el('select', { class: 'ps-input', dataset: { fk: key }, onchange: (e) => on.onChange({ [key]: e.target.value || null }) }, [
      el('option', { value: '', text: none, selected: !current }),
      ...options.map((o) => el('option', { value: o.id, text: o.label, selected: o.id === current })),
    ]),
  ]);
  const check = (label, key, on_) => el('label', { class: 'ps-disp__check' }, [
    el('input', { type: 'checkbox', checked: on_, dataset: { fk: key }, onchange: (e) => on.onChange({ [key]: e.target.checked }) }),
    el('span', { text: label }),
  ]);

  function draw() {
    const d = s.display;
    const sections = SECTIONS[s.mode] || [];
    const focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset?.fk : null;
    place();
    clear(panel);
    const body = [];
    if (sections.includes('density')) body.push(seg(t('Row height'), [['comfortable', t('Comfortable')], ['compact', t('Compact')]], d.density, 'density'));
    if (sections.includes('sort')) body.push(select(s.mode === 'board' ? t('Sort cards by') : t('Sort rows by'), 'sort', [
      { id: 'start', label: t('Start date') }, { id: 'end', label: t('End date') }, { id: 'name', label: t('Name') },
      ...s.sortOptions.map((o) => ({ id: 'col:' + o.id, label: o.label })),
    ], d.sort, t('The table’s order')));
    // up to two more keys, for the rows that tie: the second shows once the first is chosen
    if (sections.includes('sort') && d.sort) {
      const keys = [{ id: 'start', label: t('Start date') }, { id: 'end', label: t('End date') }, { id: 'name', label: t('Name') }, ...s.sortOptions.map((o) => ({ id: 'col:' + o.id, label: o.label }))];
      const then = (i) => el('label', { class: 'ps-disp__row' }, [
        el('span', { class: 'ps-disp__label', text: i === 0 ? t('then by') : t('and then by') }),
        el('select', { class: 'ps-input', dataset: { fk: 'sortThen' + i }, onchange: (e) => { const next = [...d.sortThen]; if (e.target.value) next[i] = e.target.value; else next.length = i; on.onChange({ sortThen: next.filter(Boolean) }); } }, [
          el('option', { value: '', text: t('nothing'), selected: !d.sortThen[i] }),
          ...keys.filter((o) => o.id !== d.sort && !d.sortThen.some((x, j) => j !== i && x === o.id)).map((o) => el('option', { value: o.id, text: o.label, selected: o.id === d.sortThen[i] })),
        ]),
      ]);
      body.push(then(0));
      if (d.sortThen[0]) body.push(then(1));
    }
    if (sections.includes('lanes')) body.push(select(t('Sort lanes by'), 'laneSort', [
      { id: 'name', label: t('Name') }, { id: 'busiest', label: t('Most tasks first') }, { id: 'start', label: t('Earliest start first') },
    ], d.laneSort, t('The lanes’ own order')));
    if (sections.includes('colour')) body.push(select(t('Colour by'), 'colourBy', s.colourOptions, d.colourBy, t('As set in Settings')));
    if (sections.includes('labels')) body.push(seg(t('Names on bars'), [['auto', t('In the bar')], ['beside', t('Beside')], ['off', t('None')]], d.labels, 'labels'));
    if (sections.includes('show')) {
      body.push(el('div', { class: 'ps-disp__row' }, [
        el('span', { class: 'ps-disp__label', text: t('Show') }),
        el('div', { class: 'ps-disp__checks' }, [check(t('Week numbers'), 'weekNumbers', d.weekNumbers), check(t('Weekends'), 'weekends', d.weekends), check(t('Today line'), 'today', d.today),
          ...(s.mode === 'gantt' && s.hasPlan ? [check(t('Plan under the bars'), 'plan', d.plan)] : [])]),
      ]));
    }
    if (sections.includes('cols') && s.colOptions.length) {
      const full = d.cols.length >= s.maxCols;
      body.push(el('div', { class: 'ps-disp__row ps-disp__row--cols' }, [
        el('span', { class: 'ps-disp__label', text: t('Columns beside the names') }),
        el('ul', { class: 'ps-disp__cols' }, s.colOptions.map((o) => {
          const on_ = d.cols.includes(o.id);
          return el('li', {}, [el('label', { class: 'ps-disp__check' }, [
            el('input', { type: 'checkbox', checked: on_, disabled: full && !on_, dataset: { fk: 'col:' + o.id },
              onchange: (e) => on.onChange({ cols: e.target.checked ? [...d.cols, o.id] : d.cols.filter((x) => x !== o.id) }) }),
            el('span', { text: o.label, title: o.label }),
          ])]);
        })),
        el('p', { class: 'ps-hint', text: full ? t('Three columns is the most; untick one to pick another.') : t('Up to three.') }),
      ]));
    }
    panel.append(
      el('h2', { class: 'ps-disp__title', text: t('Display') }),
      ...body,
      el('p', { class: 'ps-hint ps-disp__scope', text: t('Kept in this browser, not in the document.') + ' ' + t('A saved view keeps it too.') }),
      el('div', { class: 'ps-disp__foot' }, [
        el('button', { type: 'button', class: 'ps-link', text: t('Back to the defaults'), disabled: s.isDefault, onclick: () => on.onReset() }),
        el('button', { type: 'button', class: 'ps-btn ps-btn--sm', text: t('Close'), onclick: () => close(true) }),
      ]),
    );
    if (focusKey) panel.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }

  // a click elsewhere closes it, except on the button that opened it (that one toggles)
  const away = (e) => { if (!panel.contains(e.target) && !e.target.closest?.('.ps-display-btn')) close(); };
  document.addEventListener('pointerdown', away, true);
  let closed = false;
  function close(byKey = false) {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', away, true);
    panel.remove();
    on.onClose?.(byKey === true);
  }
  draw();
  panel.querySelector('[data-fk]')?.focus({ preventScroll: true });
  return { refresh(next) { if (!closed) { s = next; draw(); } }, close };
}
