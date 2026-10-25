// Email reminders (M11): a Google Apps Script, filled in for this document, that emails every morning
// the tasks that are late or due soon. It needs no Grist plan beyond the free one, and no server: Google
// runs it on a daily trigger, reads the document through Grist's REST API with the person's own API key,
// and sends the mail from their Google account. Pure: tests/reminders.test.mjs runs the script it writes.
//
// The script decides as Plan Studio does: a task's deadline is its end (else its due date, else its
// start); it is finished when Done is ticked, its progress is full, or its status is a word such as Done
// or Erledigt. Each person gets their own tasks at the address in the people table's email column, or
// one address gets everyone's.

import { DONE_WORDS } from './tasks.js';

/** A people table's email column, by its name or by values that are addresses. */
export function detectEmailColumn(columns, rows = []) {
  const text = columns.filter((c) => c.kind === 'Text' || c.kind === 'Any');
  const named = text.find((c) => /e-?mail|courriel|mail/i.test(c.id + ' ' + (c.label || '')));
  if (named) return named;
  return text.find((c) => rows.length && rows.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r[c.id] ?? ''))).length >= Math.ceil(rows.length / 2)) || null;
}

/**
 * @param cfg {api: 'https://host/api/docs/<id>' | '', docUrl, docName,
 *   tasks: {table, title, start, end, due, done, status, progress, person, endInclusive, progressFull},
 *   people: {table, name, email} | null, sendTo: '' (each person) | an address (everyone's tasks to one),
 *   daysAhead, hour, months: 12 short month names, dayPattern: '{d} {m}' | '{d}. {m}',
 *   words: {subjectOne, subjectMany, hello, helloAll, late, today, tomorrow, soon, lateBy, lateByOne, due, open, footer}}
 * @returns {string} the script, to paste into script.google.com
 */
export function reminderScript(cfg) {
  const config = JSON.stringify({
    api: cfg.api, docUrl: cfg.docUrl, tasks: cfg.tasks, people: cfg.people, sendTo: cfg.sendTo || '',
    daysAhead: cfg.daysAhead, hour: cfg.hour, months: cfg.months, dayPattern: cfg.dayPattern, words: cfg.words,
    doneWords: DONE_WORDS.source,   // the same words Plan Studio finishes a task by
  }, null, 2);
  const name = String(cfg.docName || '').replace(/[\r\n]+/g, ' ');
  return [
    '// Plan Studio: email reminders for "' + name + '"',
    '// Every morning at ' + cfg.hour + ':00 this script emails the tasks that are late or due soon.',
    '//',
    '// Once, to set it up:',
    '//   1. Paste your Grist API key below (in Grist: your picture, top right > Profile settings > API > Create).',
    '//   2. Pick installDailyTrigger in the menu above the code, press Run, and allow what Google asks:',
    '//      reaching Grist over the internet, and sending email as you.',
    '//   Pick sendReminders and press Run to send today\'s reminders at once.',
    '// The key opens every document you can open in Grist: keep this project to yourself.',
    '',
    "const GRIST_API_KEY = 'PASTE YOUR GRIST API KEY HERE';",
    '',
    'const CONFIG = ' + config + ';',
    '',
    SCRIPT_BODY,
  ].join('\n');
}

// The part every document shares. Plain JavaScript as Apps Script's V8 runs it.
const SCRIPT_BODY = String.raw`function sendReminders() {
  const today = dayOf(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  const t = CONFIG.tasks;
  const people = new Map();
  if (CONFIG.people) records(CONFIG.people.table).forEach(function (r) { people.set(r.id, r.fields); });
  const mail = new Map();
  records(t.table).forEach(function (r) {
    const f = r.fields;
    if (finished(f)) return;
    const due = deadline(f);
    if (due == null || due > today + CONFIG.daysAhead) return;
    const who = peopleOf(t.person ? f[t.person] : null, people);
    const to = CONFIG.sendTo ? [CONFIG.sendTo] : who.filter(function (p) { return p.email; }).map(function (p) { return p.email; });
    to.forEach(function (address) {
      if (!mail.has(address)) mail.set(address, { name: CONFIG.sendTo ? '' : who.filter(function (p) { return p.email === address; })[0].name, items: [] });
      mail.get(address).items.push({ title: String(f[t.title] == null ? '' : f[t.title]).trim(), due: due, who: who.map(function (p) { return p.name; }).filter(Boolean) });
    });
  });
  mail.forEach(function (m, address) {
    const w = CONFIG.words;
    const n = m.items.length;
    const subject = (n === 1 ? w.subjectOne : w.subjectMany).replace('{n}', n);
    MailApp.sendEmail({ to: address, subject: subject, body: bodyOf(m, today) });
  });
  Logger.log('Reminders sent: ' + mail.size);
  return mail.size;
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'sendReminders') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(CONFIG.hour).create();
  Logger.log('Reminders will be sent every morning at ' + CONFIG.hour + ':00.');
}

function bodyOf(m, today) {
  const w = CONFIG.words;
  const groups = [
    [w.late, m.items.filter(function (x) { return x.due < today; })],
    [w.today, m.items.filter(function (x) { return x.due === today; })],
    [CONFIG.daysAhead === 1 ? w.tomorrow : w.soon.replace('{n}', CONFIG.daysAhead), m.items.filter(function (x) { return x.due > today; })],
  ];
  const lines = [m.name ? w.hello.replace('{name}', m.name) : w.helloAll, ''];
  groups.forEach(function (g) {
    if (!g[1].length) return;
    lines.push(g[0]);
    g[1].sort(function (a, b) { return a.due - b.due; }).forEach(function (x) {
      const late = today - x.due;
      const when = w.due.replace('{date}', dateText(x.due)) + (late > 0 ? ', ' + (late === 1 ? w.lateByOne : w.lateBy.replace('{n}', late)) : '');
      lines.push('  - ' + x.title + ': ' + when + (CONFIG.sendTo && x.who.length ? ' (' + x.who.join(', ') + ')' : ''));
    });
    lines.push('');
  });
  lines.push(w.open.replace('{url}', CONFIG.docUrl), '', w.footer.replace('{hour}', CONFIG.hour));
  return lines.join('\n');
}

function records(table) {
  const key = GRIST_API_KEY && GRIST_API_KEY.indexOf('PASTE') !== 0 ? GRIST_API_KEY : null;
  const res = UrlFetchApp.fetch(CONFIG.api + '/tables/' + encodeURIComponent(table) + '/records', {
    headers: key ? { Authorization: 'Bearer ' + key } : {}, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Grist answered ' + res.getResponseCode() + ' for ' + table + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText()).records;
}

function dayOf(iso) { return Math.round(Date.parse(iso + 'T00:00:00Z') / 864e5); }
function cellDay(v) { return typeof v === 'number' && isFinite(v) ? Math.floor(v / 86400) : null; }
function dateText(day) {
  const d = new Date(day * 864e5);
  return CONFIG.dayPattern.replace('{d}', d.getUTCDate()).replace('{m}', CONFIG.months[d.getUTCMonth()]);
}

// The task's deadline: its end, else its due date, else its start (a one-day task).
function deadline(f) {
  const t = CONFIG.tasks;
  let end = t.end ? cellDay(f[t.end]) : null;
  if (end != null && !t.endInclusive) end -= 1;
  if (end != null) return end;
  const due = t.due ? cellDay(f[t.due]) : null;
  if (due != null) return due;
  return t.start ? cellDay(f[t.start]) : null;
}

function finished(f) {
  const t = CONFIG.tasks;
  if (t.done && f[t.done] === true) return true;
  if (t.progress && typeof f[t.progress] === 'number' && f[t.progress] >= t.progressFull) return true;
  if (t.status && f[t.status] != null) {
    const s = String(f[t.status]).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    if (new RegExp(CONFIG.doneWords).test(s)) return true;
  }
  return false;
}

// The task's people: rows of the people table (a Reference or a list of them), or names typed in.
function peopleOf(v, people) {
  const p = CONFIG.people;
  const list = Array.isArray(v) && v[0] === 'L' ? v.slice(1) : v == null || v === '' || v === 0 ? [] : [v];
  return list.map(function (x) {
    if (typeof x === 'number' && p) {
      const row = people.get(x) || {};
      return { name: String(row[p.name] == null ? '' : row[p.name]), email: p.email && row[p.email] ? String(row[p.email]).trim() : null };
    }
    const s = String(x);
    return { name: s, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null };
  });
}
`;
