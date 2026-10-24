// Dialogs over the widget: a yes/no question, a number to type, and the focus handling every dialog
// and side panel shares.

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep the keyboard inside a dialog while it is open: Tab and Shift+Tab cycle through its controls,
 * Escape closes it, and when it closes the focus goes back to where it was (the button or the bar
 * that opened it), so a keyboard or screen-reader user never lands on the page behind.
 * @returns {Function} release: call it when the dialog closes
 */
export function trapFocus(container, onEscape) {
  const before = document.activeElement;
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape?.(); return; }
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (!container.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    if (before && typeof before.focus === 'function' && document.contains(before)) before.focus({ preventScroll: true });
  };
}

export function confirmBox(host, { title, body, ok, cancel = t('Cancel') }) {
  return new Promise((resolve) => {
    const done = (v) => { release(); scrim.remove(); box.remove(); resolve(v); };
    const scrim = el('div', { class: 'ps-scrim', onclick: () => done(false) });
    const okBtn = el('button', { type: 'button', class: 'ps-btn ps-btn--primary', text: ok, onclick: () => done(true) });
    const box = el('div', { class: 'ps-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-dlg-t', 'aria-describedby': 'ps-dlg-b' }, [
      el('h2', { id: 'ps-dlg-t', text: title }),
      el('p', { id: 'ps-dlg-b', text: body }),
      el('div', { class: 'ps-dialog__foot' }, [el('button', { type: 'button', class: 'ps-btn', text: cancel, onclick: () => done(false) }), okBtn]),
    ]);
    host.append(scrim, box);
    const release = trapFocus(box, () => done(false));
    okBtn.focus();
  });
}

/**
 * A whole number to type, or nothing. Resolves the number, '' when the box was emptied (no value),
 * or null when cancelled.
 */
export function numberBox(host, { title, body, label, value = null, ok = t('Save'), cancel = t('Cancel') }) {
  return new Promise((resolve) => {
    const done = (v) => { release(); scrim.remove(); box.remove(); resolve(v); };
    const read = () => { const n = parseInt(input.value, 10); return input.value.trim() === '' ? '' : Number.isInteger(n) && n > 0 ? n : null; };
    const submit = () => { const v = read(); if (v !== null) done(v); else input.focus(); };
    // Enter is handled here too: a key event without a character (some automation, some IMEs) never submits the form.
    const input = el('input', { type: 'number', id: 'ps-dlg-n', class: 'ps-input ps-input--num', min: '1', step: '1', value: value == null ? '' : String(value),
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } } });
    const scrim = el('div', { class: 'ps-scrim', onclick: () => done(null) });
    const box = el('form', { class: 'ps-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-dlg-t', 'aria-describedby': 'ps-dlg-b',
      onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('h2', { id: 'ps-dlg-t', text: title }),
      el('p', { id: 'ps-dlg-b', text: body }),
      el('div', { class: 'ps-field ps-inline' }, [input, el('label', { for: 'ps-dlg-n', text: label })]),
      el('div', { class: 'ps-dialog__foot' }, [
        el('button', { type: 'button', class: 'ps-btn', text: cancel, onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'ps-btn ps-btn--primary', text: ok }),
      ]),
    ]);
    host.append(scrim, box);
    const release = trapFocus(box, () => done(null));
    input.focus();
    input.select();
  });
}
