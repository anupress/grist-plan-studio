// Email reminders (M11): a side panel that writes the Google Apps Script for this document (the script
// itself is model/reminders.js) and says how to put it to work. Grist's own email action needs a paid
// plan and has no dates to trigger on, so the mail comes from the person's Google account instead:
// nothing here sends anything, and the API key is typed into Google's editor, never into this page.

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param s  {people: {table, email (column label)} | null (the people table's email column, when found), peopleTable (name or null),
 *            days, hour, build({sendTo, days, hour}) -> the script's text}
 * @param on {onClose()}
 */
export function openReminders(host, s, on = {}) {
  let to = s.people ? 'each' : 'one', address = '', days = s.days, hour = s.hour;
  const clamp = (v, lo, hi, fallback) => (Number.isFinite(Number(v)) && v !== '' ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : fallback);

  const script = el('textarea', { id: 'ps-rm-script', class: 'ps-rm__script', readonly: true, spellcheck: false, rows: 9, 'aria-label': t('The script') });
  const state = el('p', { class: 'ps-hint', 'aria-live': 'polite' });
  const copy = el('button', { type: 'button', class: 'ps-btn ps-btn--primary', text: t('Copy script'), onclick: () => doCopy() });
  const addressRow = el('div', { class: 'ps-field' }, [
    el('label', { for: 'ps-rm-addr', text: t('Your address') }),
    el('input', { id: 'ps-rm-addr', class: 'ps-input', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', oninput: (e) => { address = e.target.value.trim(); refresh(); } }),
  ]);

  const toSelect = el('select', { id: 'ps-rm-to', class: 'ps-input', onchange: (e) => { to = e.target.value; refresh(); } }, [
    s.people ? el('option', { value: 'each', text: t('Each person, at the address in {table}', { table: s.people.table }), selected: to === 'each' }) : null,
    el('option', { value: 'one', text: t('One address, with everyone’s tasks'), selected: to === 'one' }),
  ]);

  function refresh() {
    const valid = to === 'each' || ADDRESS.test(address);
    addressRow.hidden = to !== 'one';
    script.value = s.build({ sendTo: to === 'one' ? address || 'you@example.com' : '', days, hour });
    copy.disabled = !valid;
    state.textContent = to === 'one' && !valid ? t('Type your address above to copy the script.') : '';
  }

  async function doCopy() {
    script.select();
    let ok = false;
    try { await navigator.clipboard.writeText(script.value); ok = true; } catch { /* a frame without clipboard access */ }
    if (!ok) { try { ok = document.execCommand('copy'); } catch { ok = false; } }
    state.textContent = ok ? t('Copied. Now paste it into Google’s editor.') : t('Select the script and copy it with Ctrl+C.');
  }

  const step = (text) => el('li', {}, [el('span', { text })]);
  const panel = el('div', { class: 'ps-drawer ps-drawer--wide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-rm-title' }, [
    el('div', { class: 'ps-drawer__head' }, [
      el('h2', { id: 'ps-rm-title', text: t('Email reminders') }),
      el('button', { type: 'button', class: 'ps-icon-btn', 'aria-label': t('Close'), text: '×', onclick: () => close() }),
    ]),
    el('div', { class: 'ps-drawer__body ps-rm' }, [
      el('p', { text: t('Every morning an email lists the tasks that are late or due soon. It is a small Google script that runs in your Google account, free, and reads this document through Grist’s API. Plan Studio sends nothing itself.') }),
      el('div', { class: 'ps-field' }, [el('label', { for: 'ps-rm-to', text: t('Send to') }), toSelect,
        !s.people ? el('p', { class: 'ps-hint', text: s.peopleTable
          ? t('To send each person their own tasks, add a column with their email address to {table}.', { table: s.peopleTable })
          : t('To send each person their own tasks, assign tasks to rows of a table that has an email column.') }) : null]),
      addressRow,
      el('div', { class: 'ps-rm__pair' }, [
        el('div', { class: 'ps-field' }, [el('label', { for: 'ps-rm-days', text: t('Also tasks due in the next (days)') }),
          el('input', { id: 'ps-rm-days', class: 'ps-input ps-input--num', type: 'number', min: 0, max: 14, step: 1, value: String(days), oninput: (e) => { days = clamp(e.target.value, 0, 14, s.days); refresh(); } })]),
        el('div', { class: 'ps-field' }, [el('label', { for: 'ps-rm-hour', text: t('Send at (hour)') }),
          el('input', { id: 'ps-rm-hour', class: 'ps-input ps-input--num', type: 'number', min: 0, max: 23, step: 1, value: String(hour), oninput: (e) => { hour = clamp(e.target.value, 0, 23, s.hour); refresh(); } })]),
      ]),
      el('div', { class: 'ps-field' }, [el('label', { for: 'ps-rm-script', text: t('The script') }), script]),
      el('div', { class: 'ps-rm__copy' }, [copy, state]),
      el('h3', { text: t('Put it to work') }),
      el('ol', { class: 'ps-rm__steps' }, [
        step(t('Open script.google.com, choose New project, delete the code in it and paste the script.')),
        step(t('In Grist, open your profile settings, then API, and create an API key. Paste it between the quotes on the first line of the script.')),
        step(t('In the menu above the code pick installDailyTrigger, press Run, and allow what Google asks: reaching Grist, and sending email as you.')),
        step(t('To try it now, pick sendReminders and press Run.')),
      ]),
      el('p', { class: 'ps-hint', text: t('The key opens every document you can open in Grist: keep that Google project to yourself. A free Google account can send 100 emails a day, a Workspace account 1,500.') }),
    ]),
    el('div', { class: 'ps-drawer__foot' }, [el('span', { class: 'ps-spacer' }), el('button', { type: 'button', class: 'ps-btn', text: t('Close'), onclick: () => close() })]),
  ]);
  const scrim = el('div', { class: 'ps-scrim', onclick: () => close() });
  let closed = false;
  let release = () => {};
  function close() {
    if (closed) return;
    closed = true;
    release();
    scrim.remove();
    panel.remove();
    on.onClose?.();
  }
  host.append(scrim, panel);
  release = trapFocus(panel, close);
  refresh();
  (panel.querySelector('select, input'))?.focus();
  return { close };
}
