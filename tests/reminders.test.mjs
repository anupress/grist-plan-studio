// The reminder script: written for a document, then actually run (node:vm, with Google's UrlFetchApp,
// MailApp and ScriptApp stood in for) against a fake Grist API: who gets which mail, what counts as late,
// done or soon, the one-address digest, the trigger, and a Grist error.

import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const R = await imp('src/model/reminders.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const cols = (...ids) => ids.map((id) => ({ id, label: id, kind: 'Text' }));
eq('the email column is found by name', R.detectEmailColumn(cols('Name', 'Work_email')).id, 'Work_email');
eq('…in German', R.detectEmailColumn(cols('Name', 'E-Mail')).id, 'E-Mail');
eq('…or by what its values look like', R.detectEmailColumn(cols('Name', 'Contact'), [{ Name: 'Ann', Contact: 'ann@example.com' }, { Name: 'Ben', Contact: 'ben@example.com' }]).id, 'Contact');
eq('no email column', R.detectEmailColumn(cols('Name', 'Notes'), [{ Name: 'Ann', Notes: 'hi' }]), null);

const WORDS = {
  subjectOne: '1 task needs you', subjectMany: '{n} tasks need you', hello: 'Hello {name},', helloAll: 'Hello,',
  late: 'Late:', today: 'Due today:', tomorrow: 'Due tomorrow:', soon: 'Due in the next {n} days:',
  lateBy: '{n} days late', lateByOne: '1 day late', due: 'due {date}', open: 'Open the plan: {url}', footer: 'Sent every morning at {hour}:00 by your Plan Studio reminder script.',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TODAY = '2026-11-04';
const d = (n) => (day(TODAY) + n) * 86400;
const config = (extra = {}) => ({
  api: 'https://docs.example.com/api/docs/abc', docUrl: 'https://docs.example.com/abc/Plan', docName: 'Website, relaunch',
  tasks: { table: 'Tasks', title: 'Task', start: 'Start', end: 'End', due: null, done: 'Done', status: 'Status', progress: 'Progress', person: 'Owner', endInclusive: true, progressFull: 1 },
  people: { table: 'People', name: 'Name', email: 'Email' }, sendTo: '', daysAhead: 3, hour: 7, months: MONTHS, dayPattern: '{d} {m}', words: WORDS, ...extra,
});

const TASKS = [
  { id: 1, fields: { Task: 'Late ', Start: d(-5), End: d(-2), Done: false, Status: 'Doing', Progress: 0.2, Owner: 1 } },
  { id: 2, fields: { Task: 'Today', Start: d(-1), End: d(0), Done: false, Status: 'Doing', Progress: 0, Owner: 1 } },
  { id: 3, fields: { Task: 'Soon', Start: d(1), End: d(3), Done: false, Status: 'To do', Progress: 0, Owner: ['L', 1, 2] } },
  { id: 4, fields: { Task: 'Far away', Start: d(1), End: d(4), Done: false, Status: 'To do', Progress: 0, Owner: 2 } },
  { id: 5, fields: { Task: 'Ticked', Start: d(-5), End: d(-2), Done: true, Status: 'Doing', Progress: 0, Owner: 1 } },
  { id: 6, fields: { Task: 'German done', Start: d(-5), End: d(-2), Done: false, Status: 'Erledigt', Progress: 0, Owner: 1 } },
  { id: 7, fields: { Task: 'All there', Start: d(-5), End: d(-2), Done: false, Status: 'Doing', Progress: 1, Owner: 1 } },
  { id: 8, fields: { Task: 'No date', Start: null, End: null, Done: false, Status: 'Doing', Progress: 0, Owner: 1 } },
  { id: 9, fields: { Task: 'Nobody', Start: d(-1), End: d(-1), Done: false, Status: 'Doing', Progress: 0, Owner: 0 } },
  { id: 11, fields: { Task: 'French done', Start: d(-5), End: d(-2), Done: false, Status: 'Terminée', Progress: 0, Owner: 1 } },
  { id: 10, fields: { Task: 'No address', Start: d(0), End: d(0), Done: false, Status: 'Doing', Progress: 0, Owner: 3 } },
];
const PEOPLE = [
  { id: 1, fields: { Name: 'Ann', Email: 'ann@example.com' } },
  { id: 2, fields: { Name: 'Ben', Email: ' ben@example.com ' } },
  { id: 3, fields: { Name: 'Cleo', Email: '' } },
];

/** Run the script in a sandbox; call one of its functions. */
function run(cfg, fn = 'sendReminders', { key = 'k123', status = 200, tasks = TASKS } = {}) {
  const script = R.reminderScript(cfg).replace("'PASTE YOUR GRIST API KEY HERE'", JSON.stringify(key));
  const sent = [], fetched = [], triggers = [], logs = [];
  const ctx = {
    UrlFetchApp: { fetch: (url, opts) => {
      fetched.push({ url, auth: opts.headers.Authorization || null });
      const table = decodeURIComponent(url.split('/tables/')[1].split('/')[0]);
      return { getResponseCode: () => status, getContentText: () => (status === 200 ? JSON.stringify({ records: table === 'Tasks' ? tasks : PEOPLE }) : '{"error":"nope"}') };
    } },
    MailApp: { sendEmail: (m) => sent.push(m) },
    Session: { getScriptTimeZone: () => 'Europe/Berlin' },
    Utilities: { formatDate: () => TODAY },
    Logger: { log: (s) => logs.push(s) },
    ScriptApp: { getProjectTriggers: () => [{ getHandlerFunction: () => 'sendReminders', id: 'old' }, { getHandlerFunction: () => 'other', id: 'keep' }],
      deleteTrigger: (t) => triggers.push('delete ' + t.id),
      newTrigger: (f) => ({ timeBased: () => ({ everyDays: (n) => ({ atHour: (h) => ({ create: () => triggers.push(`create ${f} every ${n} day at ${h}`) }) }) }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  let error = null, result = null;
  try { result = vm.runInContext(fn + '()', ctx); } catch (e) { error = e.message; }
  return { sent, fetched, triggers, logs, error, result };
}

// each person gets their own
const r = run(config());
eq('the script is valid JavaScript and ran', r.error, null);
eq('two people have something to do (Cleo has no address; Nobody has no one)', r.sent.map((m) => m.to).sort(), ['ann@example.com', 'ben@example.com']);
eq('the key goes to Grist as a bearer token, once per table read', [r.fetched.length, r.fetched[0].auth], [2, 'Bearer k123']);
eq('both tables are read from the document’s API address', r.fetched.map((f) => f.url).sort(), ['https://docs.example.com/api/docs/abc/tables/People/records', 'https://docs.example.com/api/docs/abc/tables/Tasks/records']);
const ann = r.sent.find((m) => m.to === 'ann@example.com');
eq('Ann: three tasks, in words, her own name', [ann.subject, ann.body.startsWith('Hello Ann,')], ['3 tasks need you', true]);
eq('Ann’s mail', ann.body.split('\n'), [
  'Hello Ann,', '', 'Late:', '  - Late: due 2 Nov, 2 days late', '', 'Due today:', '  - Today: due 4 Nov', '',
  'Due in the next 3 days:', '  - Soon: due 7 Nov', '', 'Open the plan: https://docs.example.com/abc/Plan', '', 'Sent every morning at 7:00 by your Plan Studio reminder script.',
]);
const ben = r.sent.find((m) => m.to === 'ben@example.com');
eq('Ben (a task shared with Ann): just that one, his address trimmed, singular subject', [ben.subject, ben.body.includes('  - Soon: due 7 Nov'), ben.body.includes('Late')], ['1 task needs you', true, false]);
eq('finished, undated, far-off and unowned tasks are never mailed', r.sent.every((m) => !/Ticked|German done|French done|All there|No date|Far away|Nobody/.test(m.body)), true);
eq('a task of someone without an address is skipped', r.sent.every((m) => !m.body.includes('No address')), true);
eq('it logs how many mails went', [r.logs.at(-1), r.result], ['Reminders sent: 2', 2]);

// one address gets everyone's
const all = run(config({ sendTo: 'boss@example.com' }));
eq('one mail, to one address', all.sent.map((m) => m.to), ['boss@example.com']);
eq('…with every open task and who it belongs to', all.sent[0].body.split('\n').filter((l) => l.startsWith('  - ')), [
  '  - Late: due 2 Nov, 2 days late (Ann)', '  - Nobody: due 3 Nov, 1 day late', '  - Today: due 4 Nov (Ann)', '  - No address: due 4 Nov (Cleo)', '  - Soon: due 7 Nov (Ann, Ben)',
]);
eq('a greeting without a name', all.sent[0].body.startsWith('Hello,\n'), true);

// the due-date column, and an exclusive end
const dueOnly = run(config({ tasks: { ...config().tasks, end: null, due: 'End' }, daysAhead: 1 }));
eq('a Due column works like an end; one day ahead says tomorrow', dueOnly.sent.map((m) => m.to).sort(), ['ann@example.com']);
const exclusive = run(config({ tasks: { ...config().tasks, endInclusive: false }, daysAhead: 0 }));
eq('an exclusive end is the day before: "Today" ends yesterday, so it is late', exclusive.sent.find((m) => m.to === 'ann@example.com').body.includes('  - Today: due 3 Nov, 1 day late'), true);

// no email column: names only, so everything goes to the one address
const noPeople = run(config({ people: null, sendTo: 'me@example.com' }), 'sendReminders', { tasks: [{ id: 1, fields: { Task: 'Typed', End: d(0), Done: false, Status: 'Doing', Progress: 0, Owner: 'Zoe' } }] });
eq('a text column of people needs no people table', [noPeople.fetched.length, noPeople.sent.map((m) => m.to)], [1, ['me@example.com']]);
eq('…and a name that is an address is mailed', run(config({ people: null }), 'sendReminders', { tasks: [{ id: 1, fields: { Task: 'Typed', End: d(0), Done: false, Status: 'Doing', Progress: 0, Owner: 'zoe@example.com' } }] }).sent.map((m) => m.to), ['zoe@example.com']);

// the key is optional for a public document
eq('without a key no Authorization header is sent', run(config(), 'sendReminders', { key: 'PASTE YOUR GRIST API KEY HERE' }).fetched[0].auth, null);

// trigger
const trig = run(config(), 'installDailyTrigger');
eq('the trigger replaces an old one and is daily at the hour', trig.triggers, ['delete old', 'create sendReminders every 1 day at 7']);

// failure
const bad = run(config(), 'sendReminders', { status: 403 });
eq('a Grist error stops with its status and the table', /Grist answered 403 for People|Grist answered 403 for Tasks/.test(bad.error || ''), true);
eq('and nothing was mailed', bad.sent.length, 0);

// quoting
const quoted = R.reminderScript(config({ docName: 'Line one\nline "two"' }));
eq('a document name with a line break cannot break out of the comment', quoted.split('\n')[0], '// Plan Studio: email reminders for "Line one line "two""');
eq('the config is JSON a person can read', /const CONFIG = \{\n  "api": "https:\/\/docs\.example\.com\/api\/docs\/abc"/.test(quoted), true);
eq('the key line is the only thing to paste', /const GRIST_API_KEY = 'PASTE YOUR GRIST API KEY HERE';/.test(quoted), true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
