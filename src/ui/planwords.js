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

/** "Due 12 Nov, ends 3 days after it": the deadline of a task that has one, and how late its plan ends (the words say what the marker shows). */
export function deadlineText(task, fmt) {
  if (task.deadline == null) return null;
  const due = t('Due {date}', { date: fmt(task.deadline) });
  return task.overDeadline ? due + ', ' + tn(task.overDeadline, 'ends {n} day after it', 'ends {n} days after it') : due;
}

/** What a link says, in a sentence: "“B” starts 2 days after “A” ends." `link` is {type, lag}; a and b are the names of the tasks. */
export function linkText(link, a, b) {
  const lag = Number.isFinite(link.lag) ? Math.round(link.lag) : 0;
  const n = Math.abs(lag);
  let text;
  switch (link.type) {
    case 'ss':
      if (lag === 0) text = t('“{b}” starts when “{a}” starts.');
      else if (lag > 0) text = tn(n, '“{b}” starts {n} day after “{a}” starts.', '“{b}” starts {n} days after “{a}” starts.');
      else text = tn(n, '“{b}” starts {n} day before “{a}” starts.', '“{b}” starts {n} days before “{a}” starts.');
      break;
    case 'ff':
      if (lag === 0) text = t('“{b}” ends when “{a}” ends.');
      else if (lag > 0) text = tn(n, '“{b}” ends {n} day after “{a}” ends.', '“{b}” ends {n} days after “{a}” ends.');
      else text = tn(n, '“{b}” ends {n} day before “{a}” ends.', '“{b}” ends {n} days before “{a}” ends.');
      break;
    case 'sf':
      if (lag === 0) text = t('“{b}” ends when “{a}” starts.');
      else if (lag > 0) text = tn(n, '“{b}” ends {n} day after “{a}” starts.', '“{b}” ends {n} days after “{a}” starts.');
      else text = tn(n, '“{b}” ends {n} day before “{a}” starts.', '“{b}” ends {n} days before “{a}” starts.');
      break;
    default:
      if (lag === 0) text = t('“{b}” starts after “{a}” ends.');
      else if (lag > 0) text = tn(n, '“{b}” starts {n} day after “{a}” ends.', '“{b}” starts {n} days after “{a}” ends.');
      else text = tn(n, '“{b}” starts {n} day before “{a}” ends.', '“{b}” starts {n} days before “{a}” ends.');
      break;
  }
  return text.replace('{a}', a).replace('{b}', b);
}
