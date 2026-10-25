// The guided setup (M16): when Plan Studio cannot tell which columns hold the dates, three questions in plain words, with
// the plan's own sentence and a count of what would be drawn updating under them. It sets the same column mapping the
// Settings panel does, and Settings stays one click away for everything else.

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

/**
 * The answers as column roles: a start with an end makes a bar up to the end; an end or due date alone puts the task on that day.
 * @param pick {title, start, end, assignee}: column ids or null
 */
export function rolesFromAnswers(pick) {
  return {
    ...(pick.title ? { title: pick.title } : {}),
    ...(pick.start ? { start: pick.start } : {}),
    ...(pick.end ? { [pick.start ? 'end' : 'due']: pick.end } : {}),
    ...(pick.assignee ? { assignee: pick.assignee } : {}),
  };
}

/**
 * @param host the app shell
 * @param s {roles: {title, start, end, due, assignee}, options: {title, start, end, assignee: [{id, label}]}, canSave,
 *          preview(roles) -> {lines: [string], drawn, total}}
 * @param on {onSave(roles), onSettings(), onClose()}
 */
export function openSetup(host, s, on) {
  // the three answers; a start with an end makes a bar, an end or due date alone puts the task on that day
  const pick = { title: s.roles.title || null, start: s.roles.start || null, end: s.roles.end || s.roles.due || null, assignee: s.roles.assignee || null };
  const rolesOf = () => rolesFromAnswers(pick);

  const selects = {};
  const question = (key, id, label, hint, none) => {
    const sel = el('select', { id, class: 'ps-input', onchange: (e) => { pick[key] = e.target.value || null; refresh(); } }, [
      el('option', { value: '', text: none, selected: !pick[key] }),
      ...s.options[key].map((o) => el('option', { value: o.id, text: o.label, selected: o.id === pick[key] })),
    ]);
    selects[key] = sel;
    return el('div', { class: 'ps-field' }, [el('label', { for: id, text: label }), sel, hint ? el('p', { class: 'ps-hint', text: hint }) : null]);
  };

  const sentence = el('p', { class: 'ps-preview' });
  const count = el('p', { class: 'ps-preview__foot', role: 'status', 'aria-live': 'polite' });
  const preview = el('div', { class: 'ps-previewbox' }, [sentence, count]);
  const save = el('button', { type: 'button', class: 'ps-btn ps-btn--primary', text: s.canSave ? t('Show my plan') : t('Apply'), onclick: () => { const r = rolesOf(); done(); on.onSave(r); } });

  function refresh() {
    const r = rolesOf();
    const p = s.preview(r);
    sentence.textContent = p.lines.join(' ');
    const dated = !!(r.start || r.end || r.due);
    count.textContent = !dated ? t('Pick a column for the start, or for the day a task is due.')
      : p.drawn === 0 ? t('No task has a date in these columns yet.')
        : t('{drawn} of {total} tasks have a date and will be drawn.', { drawn: p.drawn, total: p.total });
    count.classList.toggle('is-warn', dated && p.drawn === 0);
    save.disabled = !dated || !r.title;
  }

  const done = () => { release(); scrim.remove(); box.remove(); on.onClose?.(); };
  const scrim = el('div', { class: 'ps-scrim', onclick: done });
  const form = el('div', { class: 'ps-setup' }, [
    el('p', { class: 'ps-hint', text: t('Answer these and the plan takes shape below. You can change any of it later in Settings.') }),
    pick.title ? null : question('title', 'ps-su-title', t('Which column names each task?'), null, t('— none —')),
    question('start', 'ps-su-start', t('Which column says when a task starts?'), null, t('— none —')),
    question('end', 'ps-su-end', t('Which column says when it ends, or when it is due?'), t('With a start, the task is a bar up to this day. Without one, it sits on this day.'), t('— none —')),
    // no column that could name a person, no question
    s.options.assignee.length ? question('assignee', 'ps-su-who', t('Which column says who does the task?'), t('Optional. Colours and the workload use it.'), t('— nobody —')) : null,
    preview,
  ]);
  const box = el('div', { class: 'ps-dialog ps-dialog--setup', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-su-t' }, [
    el('h2', { id: 'ps-su-t', text: t('Set up your plan') }),
    form,
    el('div', { class: 'ps-dialog__foot' }, [
      el('button', { type: 'button', class: 'ps-link ps-setup__more', text: t('More options in Settings'), onclick: () => { done(); on.onSettings?.(); } }),
      el('span', { class: 'ps-spacer' }),
      el('button', { type: 'button', class: 'ps-btn', text: t('Cancel'), onclick: done }),
      save,
    ]),
  ]);
  host.append(scrim, box);
  const release = trapFocus(box, done);
  refresh();
  (selects.title || selects.start).focus();
  return { close: done };
}
