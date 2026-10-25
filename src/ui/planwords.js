// The words for plan against actual (M18), said in the person's language. The numbers come from model/plan.js.

import { t, tn } from '../i18n/index.js';
import { slipWords, slipShort, finishedVsEnd } from '../model/plan.js';

/** "4 days later than planned", "Starts 2 days earlier than planned", "On plan"; null when the task has no plan. */
export function slipText(task) {
  const w = slipWords(task);
  if (!w) return null;
  switch (w.key) {
    case 'later': return tn(w.n, '{n} day later than planned', '{n} days later than planned');
    case 'earlier': return tn(w.n, '{n} day earlier than planned', '{n} days earlier than planned');
    case 'startsLater': return tn(w.n, 'Starts {n} day later than planned', 'Starts {n} days later than planned');
    case 'startsEarlier': return tn(w.n, 'Starts {n} day earlier than planned', 'Starts {n} days earlier than planned');
    default: return t('On plan');
  }
}

/** The short form for a list column: "+4 d", "−2 d"; null without a plan, and for a task exactly on it (a column of "On plan" would only be noise). */
export function slipShortText(task) {
  const s = slipShort(task);
  if (!s) return null;
  if (s.key === 'plus') return t('+{n} d', { n: s.n });
  if (s.key === 'minus') return t('−{n} d', { n: s.n });
  return null;
}

/** "Done on Fri 13 Nov, 2 days after its end"; null when the task has no finish day. fmt: a day number -> text. */
export function doneText(task, fmt) {
  if (task.doneOn == null) return null;
  const d = finishedVsEnd(task);
  const when = t('Done on {date}', { date: fmt(task.doneOn) });
  if (!d) return when;
  return when + ', ' + (d > 0 ? tn(d, '{n} day after its end', '{n} days after its end') : tn(-d, '{n} day before its end', '{n} days before its end'));
}
