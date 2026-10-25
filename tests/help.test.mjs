// Help for first use: every view says what it is for and what to try, in all three languages, and the guided setup turns
// its three answers into the right column roles.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
// the dialog module reaches for the document only when it opens something
const H = await imp('src/ui/help.js');
const K = await imp('src/ui/keys.js');
const Su = await imp('src/ui/setup.js');
const { DE } = await imp('src/i18n/de.js');
const { FR } = await imp('src/i18n/fr.js');
const { VIEWS } = await imp('src/model/settings.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

eq('help is there for every view the widget has', [...H.HELP_VIEWS].sort(), [...VIEWS].sort());
eq('every view says what it is for and at least two things to try', H.HELP_VIEWS.every((v) => H.helpFor(v).about.length > 20 && H.helpFor(v).can.length >= 2), true);
eq('every view has a tip of its own, and it points to Help', H.HELP_VIEWS.every((v) => H.tipFor(v).length > 20 && /Help/.test(H.tipFor(v))) && new Set(H.HELP_VIEWS.map((v) => H.tipFor(v))).size === H.HELP_VIEWS.length, true);
eq('a tip is a sentence or two, not a paragraph', H.HELP_VIEWS.every((v) => H.tipFor(v).length <= 130), true);

// every sentence is in German and in French (t() is the identity here, so these are the keys)
const sentences = [...new Set(H.HELP_VIEWS.flatMap((v) => [H.helpFor(v).about, ...H.helpFor(v).can, H.tipFor(v)]))];
eq('every help sentence is in German', sentences.filter((s) => !(s in DE)), []);
eq('…and in French', sentences.filter((s) => !(s in FR)), []);
const keys = [...new Set(H.HELP_VIEWS.flatMap((v) => K.keyRows(v).flat()))];
eq('every key and what it does is in German and French', keys.filter((k) => !(k in DE) || !(k in FR)), []);
eq('every view lists the keys that work everywhere', H.HELP_VIEWS.every((v) => K.keyRows(v).some(([k]) => k === 'Ctrl+Z / Ctrl+Y')), true);

// the guided setup
eq('a start and an end make a bar', Su.rolesFromAnswers({ title: 'T', start: 'S', end: 'E', assignee: null }), { title: 'T', start: 'S', end: 'E' });
eq('an end alone is the day the task is due', Su.rolesFromAnswers({ title: 'T', start: null, end: 'E', assignee: null }), { title: 'T', due: 'E' });
eq('a start alone puts the task on that day', Su.rolesFromAnswers({ title: 'T', start: 'S', end: null, assignee: 'W' }), { title: 'T', start: 'S', assignee: 'W' });
eq('nothing answered, nothing set', Su.rolesFromAnswers({ title: null, start: null, end: null, assignee: null }), {});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
