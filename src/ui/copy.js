// "Copy ..." on a task (M24): the same task on a later day, or every week or month for a while, with its sub-tasks when it has some.
// It asks what is needed to make the copies, says what they will be, and hands the days back; what is written is model/rowops.js.

import { el } from '../core/util.js';
import { t, tn } from '../i18n/index.js';
import { trapFocus } from './dialog.js';
import { seriesStarts, MAX_COPIES } from '../model/series.js';

/**
 * @param s {title, name, hasDates, anchor (the day the original starts), childCount, fmt(day) -> text, isoOf(day), dayOf(iso) -> day | null}
 * @returns {Promise<{name, starts: number[] | null, times, children: 'all' | 'none', fresh: boolean} | null>}
 *   starts: the day each copy starts on (null when the task has no dates: then `times` plain copies)
 */
export function copyBox(host, s) {
  return new Promise((resolve) => {
    const done = (v) => { release(); scrim.remove(); box.remove(); resolve(v); };
    const name = el('input', { id: 'ps-cp-n', type: 'text', class: 'ps-input', value: s.name, maxlength: '200' });
    const first = el('input', { id: 'ps-cp-d', type: 'date', class: 'ps-input', value: s.hasDates ? s.isoOf(s.anchor + 7) : '' });
    const times = el('input', { id: 'ps-cp-t', type: 'number', class: 'ps-input ps-input--num', min: '1', max: String(MAX_COPIES), step: '1', value: '1' });
    const every = el('input', { id: 'ps-cp-e', type: 'number', class: 'ps-input ps-input--num', min: '1', max: '365', step: '1', value: '1', 'aria-label': t('Repeat every') });
    const unit = el('select', { id: 'ps-cp-u', class: 'ps-input ps-input--inline', 'aria-label': t('Unit') }, [
      el('option', { value: 'day', text: t('day(s)') }), el('option', { value: 'week', text: t('week(s)'), selected: true }), el('option', { value: 'month', text: t('month(s)') }),
    ]);
    const until = el('input', { id: 'ps-cp-u2', type: 'date', class: 'ps-input' });
    const kids = s.childCount ? el('input', { id: 'ps-cp-k', type: 'checkbox', checked: true }) : null;
    const fresh = el('input', { id: 'ps-cp-f', type: 'checkbox', checked: true });
    const preview = el('p', { class: 'ps-dialog__note ps-cp__preview', 'aria-live': 'polite' });

    const read = () => {
      const n = Math.round(Number(times.value));
      const count = Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_COPIES) : 1;
      if (!s.hasDates) return { count, starts: null };
      const day = s.dayOf(first.value);
      if (day == null) return { count, starts: [], bad: 'first' };
      const untilDay = until.value ? s.dayOf(until.value) : null;
      const starts = seriesStarts({ first: day, times: untilDay != null ? MAX_COPIES : count, every: Number(every.value), unit: unit.value, until: untilDay });
      return { count: starts.length, starts, bad: starts.length ? null : 'until' };
    };
    const refresh = () => {
      const r = read();
      every.disabled = unit.disabled = until.disabled = !s.hasDates || (Number(times.value) <= 1 && !until.value);
      let text;
      if (r.bad === 'first') text = t('Pick the day the first copy starts on.');
      else if (r.bad === 'until') text = t('That day is before the first copy.');
      else if (!s.hasDates) text = tn(r.count, '{n} copy, with the same dates as the original.', '{n} copies, with the same dates as the original.');
      else if (r.starts.length === 1) text = t('One copy, starting {date}.', { date: s.fmt(r.starts[0]) });
      else text = t('{n} copies, from {first} to {last}.', { n: r.starts.length, first: s.fmt(r.starts[0]), last: s.fmt(r.starts[r.starts.length - 1]) });
      if (s.hasDates && r.starts.length >= MAX_COPIES) text += ' ' + t('That is the most at once.');
      preview.textContent = text;
      return r;
    };
    const submit = () => {
      const r = refresh();
      if (r.bad) { (r.bad === 'first' ? first : until).focus(); return; }
      const title = name.value.trim();
      if (!title) { name.focus(); return; }
      done({ name: title, starts: r.starts, times: r.count, children: kids && kids.checked ? 'all' : 'none', fresh: fresh.checked });
    };
    for (const n of [first, times, every, unit, until]) { n.addEventListener('input', refresh); n.addEventListener('change', refresh); }

    const scrim = el('div', { class: 'ps-scrim', onclick: () => done(null) });
    const box = el('form', { class: 'ps-dialog ps-dialog--wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-dlg-t', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('h2', { id: 'ps-dlg-t', text: s.title }),
      el('div', { class: 'ps-field' }, [el('label', { for: 'ps-cp-n', text: t('Name of the copies') }), name]),
      s.hasDates ? el('div', { class: 'ps-field' }, [el('label', { for: 'ps-cp-d', text: t('The first copy starts on') }), first]) : null,
      el('div', { class: 'ps-field ps-inline' }, [times, el('label', { for: 'ps-cp-t', text: s.hasDates ? t('copies') : t('copies of the task') })]),
      s.hasDates ? el('div', { class: 'ps-field ps-inline' }, [el('label', { for: 'ps-cp-e', text: t('one every') }), every, unit]) : null,
      s.hasDates ? el('div', { class: 'ps-field' }, [el('label', { for: 'ps-cp-u2', text: t('Or until (optional)') }), until]) : null,
      kids ? el('div', { class: 'ps-field ps-field--check' }, [kids, el('label', { for: 'ps-cp-k', text: tn(s.childCount, 'With its {n} sub-task', 'With its {n} sub-tasks') })]) : null,
      el('div', { class: 'ps-field ps-field--check' }, [fresh, el('label', { for: 'ps-cp-f', text: t('Start them over: not started, no progress') })]),
      preview,
      el('div', { class: 'ps-dialog__foot' }, [
        el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'ps-btn ps-btn--primary', text: t('Make copies') }),
      ]),
    ]);
    host.append(scrim, box);
    const release = trapFocus(box, () => done(null));
    refresh();
    (s.hasDates ? first : times).focus();
  });
}
