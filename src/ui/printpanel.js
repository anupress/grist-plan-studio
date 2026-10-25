// The Print panel: paper and fit, then the browser's own print dialog (which also saves a PDF), or a PNG of the same layout.

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

const KEY = 'planStudio.print';
export function storedPrint() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { paper: v.paper === 'A3' ? 'A3' : 'A4', fit: v.fit === 'pages' ? 'pages' : 'fit' }; }
  catch { return { paper: 'A4', fit: 'fit' }; }
}
const remember = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ } };

/**
 * @param s  {canPages: the view can keep its zoom across several pages (Gantt chart, timeline)}
 * @param on {onPrint({paper, fit, png}), onClose()}
 */
export function openPrint(host, s, on) {
  const v = storedPrint();
  const radio = (name, value, label, hint = null) => el('label', { class: 'ps-radio' }, [
    el('input', { type: 'radio', name, value, checked: v[name] === value, onchange: () => { v[name] = value; } }),
    el('span', {}, [el('span', { text: label }), hint ? el('span', { class: 'ps-radio__hint', text: hint }) : null]),
  ]);
  const done = (go, extra = {}) => {
    release();
    scrim.remove();
    box.remove();
    on.onClose?.();
    if (go) { remember(v); on.onPrint?.({ ...v, ...extra }); }
  };
  const scrim = el('div', { class: 'ps-scrim', onclick: () => done(false) });
  const printBtn = el('button', { type: 'button', class: 'ps-btn ps-btn--primary', text: t('Print…'), onclick: () => done(true) });
  const box = el('div', { class: 'ps-dialog ps-dialog--print', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-pr-t' }, [
    el('h2', { id: 'ps-pr-t', text: t('Print') }),
    el('fieldset', { class: 'ps-fieldset' }, [
      el('legend', { text: t('Paper (landscape)') }),
      el('div', { class: 'ps-radios ps-radios--row' }, [radio('paper', 'A4', 'A4'), radio('paper', 'A3', 'A3')]),
    ]),
    s.canPages ? el('fieldset', { class: 'ps-fieldset' }, [
      el('legend', { text: t('Size') }),
      el('div', { class: 'ps-radios' }, [
        radio('fit', 'fit', t('Fit the plan to the page width'), t('Rows continue on further pages.')),
        radio('fit', 'pages', t('Keep the current zoom'), t('A long plan is split across pages, each with the names repeated.')),
      ]),
    ]) : null,
    el('p', { class: 'ps-hint', text: t('To get a PDF, choose “Save as PDF” as the printer in the dialog that opens.') }),
    el('p', { class: 'ps-hint', text: t('Save as PNG draws the same layout as a picture, for a slide or a message.') }),
    el('div', { class: 'ps-dialog__foot' }, [
      el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: () => done(false) }),
      el('button', { type: 'button', class: 'ps-btn', text: t('Save as PNG'), onclick: () => done(true, { png: true }) }),
      printBtn,
    ]),
  ]);
  host.append(scrim, box);
  const release = trapFocus(box, () => done(false));
  printBtn.focus();
}
