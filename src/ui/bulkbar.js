// The strip that appears when several tasks are selected (M26): how many, and what to do with all of them at once.
// It writes nothing; main.js does, as one action each (one step in Undo). The words are set each time the strip is
// shown, so they follow the language chosen after the page loaded.

import { el } from '../core/util.js';
import { t, tn } from '../i18n/index.js';

/**
 * @param on {onDone(), onOpen(), onSet(), onShift(), onDelete(), onClear()}
 * @returns {{el: HTMLElement, update({count, canEdit, canDone, canShift})}}
 */
export function createBulkBar(on) {
  const count = el('strong', { class: 'ps-bulk__count' });
  const btn = (cls, run) => el('button', { type: 'button', class: 'ps-btn ps-btn--sm' + cls, onclick: () => run?.() });
  const done = btn('', on.onDone), open = btn('', on.onOpen), set = btn('', on.onSet), shift = btn('', on.onShift);
  const del = btn(' ps-btn--danger', on.onDelete), clear = btn('', on.onClear);
  const root = el('div', { class: 'ps-bulk', role: 'region', hidden: true }, [count, done, open, set, shift, el('span', { class: 'ps-spacer' }), del, clear]);
  const say = (node, text, title) => { node.textContent = text; node.title = title; };
  return {
    el: root,
    update({ count: n, canEdit, canDone, canShift }) {
      root.hidden = n < 2;
      if (n < 2) return;
      root.setAttribute('aria-label', t('Selected tasks'));
      count.textContent = tn(n, '{n} task selected', '{n} tasks selected');
      say(done, t('Mark done'), t('Mark every selected task as done'));
      say(open, t('Mark open'), t('Open every selected task again'));
      say(set, t('Set…'), t('Give a column the same value in every selected task'));
      say(shift, t('Move dates…'), t('Move every selected task by the same number of days'));
      say(del, t('Delete…'), t('Delete every selected task (it asks first)'));
      say(clear, t('Clear'), t('Select nothing (Esc)'));
      done.hidden = open.hidden = !canEdit || !canDone;
      set.hidden = !canEdit;
      shift.hidden = !canEdit || !canShift;
      del.hidden = !canEdit;
    },
  };
}
