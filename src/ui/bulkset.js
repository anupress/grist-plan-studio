// "Set…" on several selected tasks (M26): pick a column and a value, and every selected task gets it. And "Move dates…": a number of
// days, forwards or back. Both only ask; main.js writes.

import { el, clear } from '../core/util.js';
import { t, tn } from '../i18n/index.js';
import { trapFocus } from './dialog.js';
import { inputFor } from './quickedit.js';

/**
 * @param s {count, columns: [{col, labels}] (the columns that can be set), ok}
 * @returns {Promise<{col, value} | null>}  value as the column's input reads it (a string, a number, a boolean, a day, a list)
 */
export function setBox(host, s) {
  return new Promise((resolve) => {
    const done = (v) => { release(); scrim.remove(); box.remove(); resolve(v); };
    const pick = el('select', { id: 'ps-bs-c', class: 'ps-input' }, s.columns.map(({ col }) => el('option', { value: col.id, text: col.label })));
    const holder = el('div', { class: 'ps-bs__value' });
    let input = null;
    const show = () => {
      const entry = s.columns.find((x) => x.col.id === pick.value);
      input = inputFor(entry.col, null, entry.labels, 'ps-bs-v', false);
      clear(holder).append(input.node);
    };
    pick.addEventListener('change', show);
    const scrim = el('div', { class: 'ps-scrim', onclick: () => done(null) });
    const box = el('form', { class: 'ps-dialog ps-dialog--wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-dlg-t', 'aria-describedby': 'ps-dlg-b',
      onsubmit: (e) => { e.preventDefault(); done({ col: s.columns.find((x) => x.col.id === pick.value).col, value: input.read() }); } }, [
      el('h2', { id: 'ps-dlg-t', text: tn(s.count, 'Set a value on {n} task', 'Set a value on {n} tasks') }),
      el('p', { id: 'ps-dlg-b', text: t('Every selected task gets this value in the column you pick. An empty value clears it.') }),
      el('div', { class: 'ps-field' }, [el('label', { for: 'ps-bs-c', text: t('Column') }), pick]),
      el('div', { class: 'ps-field' }, [el('label', { for: 'ps-bs-v', text: t('Value') }), holder]),
      el('div', { class: 'ps-dialog__foot' }, [
        el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'ps-btn ps-btn--primary', text: s.ok || t('Set') }),
      ]),
    ]);
    host.append(scrim, box);
    const release = trapFocus(box, () => done(null));
    show();
    pick.focus();
  });
}

/**
 * A number of days, forwards or back (0 asks nothing). Resolves the number, or null when cancelled.
 * @param s {title, body, unit ('days' or 'working days'), ok}
 */
export function daysBox(host, s) {
  return new Promise((resolve) => {
    const done = (v) => { release(); scrim.remove(); box.remove(); resolve(v); };
    const read = () => { const n = Math.round(Number(input.value)); return Number.isFinite(n) && input.value.trim() !== '' ? n : null; };
    const submit = () => { const n = read(); if (n === null || n === 0) { input.focus(); return; } done(n); };
    const input = el('input', { id: 'ps-dy-n', type: 'number', class: 'ps-input ps-input--num', step: '1', min: '-3650', max: '3650', value: '7',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } } });
    const scrim = el('div', { class: 'ps-scrim', onclick: () => done(null) });
    const box = el('form', { class: 'ps-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-dlg-t', 'aria-describedby': 'ps-dlg-b', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('h2', { id: 'ps-dlg-t', text: s.title }),
      el('p', { id: 'ps-dlg-b', text: s.body }),
      el('div', { class: 'ps-field ps-inline' }, [input, el('label', { for: 'ps-dy-n', text: s.unit })]),
      el('div', { class: 'ps-dialog__foot' }, [
        el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'ps-btn ps-btn--primary', text: s.ok }),
      ]),
    ]);
    host.append(scrim, box);
    const release = trapFocus(box, () => done(null));
    input.focus();
    input.select();
  });
}
