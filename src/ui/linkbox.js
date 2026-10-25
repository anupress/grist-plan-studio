// What a click on an arrow opens (M25): which ends of the two tasks are linked and how many days lie between them, said in a
// sentence that follows what is chosen, or remove the link. What is written is decided in main.js (the columns on the task that waits).

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

/**
 * @param s {title, type: 'fs' | 'ss' | 'ff' | 'sf', lag (days), showType, showLag (false when the table has no such column and none can be added),
 *          unitWord ('days' or 'working days'), sentence(type, lag) -> text, note: a muted line or null}
 * @returns {Promise<{action: 'save', type, lag} | {action: 'remove'} | null>}
 */
export function linkBox(host, s) {
  return new Promise((resolve) => {
    const done = (v) => { release(); scrim.remove(); box.remove(); resolve(v); };
    const type = el('select', { id: 'ps-lk-t', class: 'ps-input' }, [
      ['fs', t('Finish to start')], ['ss', t('Start to start')], ['ff', t('Finish to finish')], ['sf', t('Start to finish')],
    ].map(([v, label]) => el('option', { value: v, text: label, selected: v === s.type })));
    const lag = el('input', { id: 'ps-lk-l', type: 'number', class: 'ps-input ps-input--num', step: '1', min: '-365', max: '365', value: String(s.lag || 0) });
    const sentence = el('p', { class: 'ps-lk__sentence', 'aria-live': 'polite' });
    const read = () => { const n = Math.round(Number(lag.value)); return { type: type.value, lag: Number.isFinite(n) ? Math.max(-365, Math.min(365, n)) : 0 }; };
    const refresh = () => { const r = read(); sentence.textContent = s.sentence(r.type, r.lag); };
    type.addEventListener('change', refresh);
    lag.addEventListener('input', refresh);
    const save = () => done({ action: 'save', ...read() });

    const scrim = el('div', { class: 'ps-scrim', onclick: () => done(null) });
    const box = el('form', { class: 'ps-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-dlg-t', onsubmit: (e) => { e.preventDefault(); save(); } }, [
      el('h2', { id: 'ps-dlg-t', text: s.title }),
      sentence,
      s.showType ? el('div', { class: 'ps-field' }, [el('label', { for: 'ps-lk-t', text: t('Link type') }), type]) : null,
      s.showLag ? el('div', { class: 'ps-field ps-inline' }, [lag, el('label', { for: 'ps-lk-l', text: t('{unit} between (a negative number lets them overlap)', { unit: s.unitWord }) })]) : null,
      s.note ? el('p', { class: 'ps-dialog__note', text: s.note }) : null,
      el('div', { class: 'ps-dialog__foot' }, [
        el('button', { type: 'button', class: 'ps-btn ps-btn--danger', text: t('Remove link'), onclick: () => done({ action: 'remove' }) }),
        el('span', { class: 'ps-spacer' }),
        el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: () => done(null) }),
        s.showType || s.showLag ? el('button', { type: 'submit', class: 'ps-btn ps-btn--primary', text: t('Save') }) : null,
      ]),
    ]);
    host.append(scrim, box);
    const release = trapFocus(box, () => done(null));
    refresh();
    (s.showType ? type : s.showLag ? lag : box.querySelector('button')).focus();
  });
}
