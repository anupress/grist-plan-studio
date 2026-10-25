// "Add several tasks" (M24): type or paste a list, one task a line, indented lines being sub-tasks. It says what the list will
// become (how many tasks, how many have sub-tasks, between which days) before anything is written; what is written is
// model/outline.js.

import { el } from '../core/util.js';
import { t, tn } from '../i18n/index.js';
import { trapFocus } from './dialog.js';
import { parseOutline, MAX_LINES } from '../model/outline.js';

/**
 * @param s {title, body, hasDates, today, isoOf(day), dayOf(iso), fmt(day), unitWord (days or working days), preview(items, {start, days, chain}) -> planOutline's result}
 * @returns {Promise<{items, start: number | null, days, chain} | null>}
 */
export function outlineBox(host, s) {
  return new Promise((resolve) => {
    const done = (v) => { release(); scrim.remove(); box.remove(); resolve(v); };
    const text = el('textarea', {
      id: 'ps-ol-t', class: 'ps-input ps-ol__text', rows: '9', spellcheck: 'false', 'aria-describedby': 'ps-ol-h',
      placeholder: [t('Design'), '  ' + t('Mock-ups'), '  ' + t('Review'), t('Build'), '  ' + t('Backend'), '  ' + t('Interface'), t('Launch')].join('\n'),
    });
    const dated = s.hasDates ? el('input', { id: 'ps-ol-g', type: 'checkbox', checked: true }) : null;
    const start = el('input', { id: 'ps-ol-s', type: 'date', class: 'ps-input', value: s.isoOf(s.today) });
    const days = el('input', { id: 'ps-ol-n', type: 'number', class: 'ps-input ps-input--num', min: '1', max: '365', step: '1', value: '1' });
    const chain = el('input', { id: 'ps-ol-c', type: 'checkbox', checked: true });
    const preview = el('p', { class: 'ps-dialog__note ps-cp__preview', 'aria-live': 'polite' });

    const options = () => ({ start: dated?.checked ? s.dayOf(start.value) : null, days: Math.max(1, Math.round(Number(days.value)) || 1), chain: chain.checked });
    const refresh = () => {
      const items = parseOutline(text.value);
      const o = options();
      const dateFields = [start, days, chain];
      for (const n of dateFields) n.disabled = !dated?.checked;
      if (!items.length) { preview.textContent = t('Nothing yet: one task on each line.'); return null; }
      const p = s.preview(items, o);
      if (p.error) { preview.textContent = t('These tasks cannot be written: the table has no name column that can be written.'); return null; }
      const bits = [tn(items.length, '{n} task', '{n} tasks')];
      if (p.parents) bits.push(tn(p.parents, '{n} with sub-tasks', '{n} with sub-tasks'));
      let line = bits.join(', ') + '.';
      if (p.range) line += ' ' + (p.range[0] === p.range[1] ? s.fmt(p.range[0]) : t('{a} to {b}.', { a: s.fmt(p.range[0]), b: s.fmt(p.range[1]) }));
      if (p.flattened) line += ' ' + t('The table has no column for parent tasks that can be written, so every line becomes a task on one level.');
      if (items.length >= MAX_LINES) line += ' ' + t('That is the most at once.');
      preview.textContent = line;
      return { items, ...o };
    };
    const submit = () => {
      const r = refresh();
      if (!r) { text.focus(); return; }
      if (dated?.checked && r.start == null) { start.focus(); return; }
      done(r);
    };
    for (const n of [text, start, days, chain, dated]) if (n) { n.addEventListener('input', refresh); n.addEventListener('change', refresh); }

    const scrim = el('div', { class: 'ps-scrim', onclick: () => done(null) });
    const box = el('form', { class: 'ps-dialog ps-dialog--wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-dlg-t', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('h2', { id: 'ps-dlg-t', text: s.title }),
      el('p', { id: 'ps-ol-h', text: s.body }),
      el('div', { class: 'ps-field' }, [el('label', { for: 'ps-ol-t', text: t('Tasks, one on each line') }), text]),
      dated ? el('div', { class: 'ps-field ps-field--check' }, [dated, el('label', { for: 'ps-ol-g', text: t('Give them dates') })]) : null,
      dated ? el('div', { class: 'ps-field' }, [el('label', { for: 'ps-ol-s', text: t('Start on') }), start]) : null,
      dated ? el('div', { class: 'ps-field ps-inline' }, [days, el('label', { for: 'ps-ol-n', text: s.unitWord })]) : null,
      dated ? el('div', { class: 'ps-field ps-field--check' }, [chain, el('label', { for: 'ps-ol-c', text: t('One after the other') })]) : null,
      preview,
      el('div', { class: 'ps-dialog__foot' }, [
        el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'ps-btn ps-btn--primary', text: t('Add the tasks') }),
      ]),
    ]);
    host.append(scrim, box);
    const release = trapFocus(box, () => done(null));
    refresh();
    text.focus();
  });
}
