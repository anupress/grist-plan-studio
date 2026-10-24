// Keyboard shortcuts, view by view: the "?" key or the toolbar's ? button. Everything the mouse does
// has a key, except drawing a dependency and dragging dates on the timeline, which have Alt+arrows.

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

// [key, what it does]; both reach t() (scripts/ui-strings.mjs reads such pairs)
const COMMON = [
  ['Tab', 'Go to the view, the toolbar or a panel'],
  ['Enter', 'Edit the selected item'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+P', 'Print or save as PDF'],
  ['?', 'These shortcuts'],
];
const BY_VIEW = {
  gantt: [
    ['↑ ↓  Home End', 'Select the previous or next task'],
    ['← →', 'Fold or unfold a parent task'],
    ['Alt+← →', 'Move the task a day'],
    ['Alt+Shift+← →', 'Make it end a day earlier or later'],
    ['+ −', 'Zoom in or out'],
    ['T', 'Scroll to today'],
  ],
  timeline: [
    ['↑ ↓  Home End', 'Select the previous or next bar'],
    ['Alt+← →', 'Move the task a day'],
  ],
  board: [
    ['↑ ↓', 'Select a card in the lane'],
    ['← →', 'Go to the next lane'],
    ['Alt+← →', 'Move the card to the next lane'],
    ['Alt+↑ ↓', 'Move the card up or down'],
  ],
  booking: [
    ['← → ↑ ↓', 'Move from cell to cell'],
    ['Enter', 'Book a free cell, or edit the booking'],
  ],
};

export function openKeys(host, view, on = {}) {
  const rows = [...(BY_VIEW[view] || []), ...COMMON];
  const done = () => { release(); scrim.remove(); box.remove(); on.onClose?.(); };
  const scrim = el('div', { class: 'ps-scrim', onclick: done });
  const closeBtn = el('button', { type: 'button', class: 'ps-btn', text: t('Close'), onclick: done });
  const box = el('div', { class: 'ps-dialog ps-dialog--keys', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-keys-t' }, [
    el('h2', { id: 'ps-keys-t', text: t('Keyboard shortcuts') }),
    // key names are translated too: Ctrl is Strg on a German keyboard
    el('dl', { class: 'ps-keys' }, rows.flatMap(([k, what]) => [el('dt', {}, [el('kbd', { text: t(k) })]), el('dd', { text: t(what) })])),
    el('div', { class: 'ps-dialog__foot' }, [closeBtn]),
  ]);
  host.append(scrim, box);
  const release = trapFocus(box, done);
  closeBtn.focus();
}
