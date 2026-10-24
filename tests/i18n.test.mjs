// The interface language: every string has German and French, the automatic choice follows Grist
// then the browser, and weeks start where the locale says.

import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { search: '' };
const I = await import(pathToFileURL(resolve(ROOT, 'src/i18n/index.js')).href);

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const check = spawnSync(process.execPath, ['scripts/ui-strings.mjs'], { cwd: ROOT, encoding: 'utf8' });
eq('every interface string has German and French, placeholders intact (node scripts/ui-strings.mjs)', check.status, 0);
if (check.status) console.log(check.stdout);

eq('automatic follows Grist first', I.resolveLanguage('auto', 'de-DE', 'en-GB'), 'de');
eq('then the browser', I.resolveLanguage('auto', '', 'de-AT'), 'de');
eq('French from Grist', I.resolveLanguage('auto', 'fr', 'en-GB'), 'fr');
eq('anything else is English', I.resolveLanguage('auto', 'es-ES', 'es-ES'), 'en');
eq('a choice wins', I.resolveLanguage('en', 'de-DE', 'de-DE'), 'en');

I.setLanguage('de', { remember: false });
eq('German text', I.t('Columns'), 'Spalten');
eq('placeholders', I.t('{n} tasks', { n: 3 }), '3 Aufgaben');
eq('plural', [I.tn(1, '{n} task', '{n} tasks'), I.tn(2, '{n} task', '{n} tasks')], ['1 Aufgabe', '2 Aufgaben']);
eq('missing German falls back to English', I.t('Not in the table'), 'Not in the table');
eq('German dates whatever the culture', I.dateLocale('en-US'), 'de-DE');
I.setLanguage('en', { remember: false });
eq('English text', I.t('Columns'), 'Columns');
eq('English drops the singular mark', I.tn(1, '{n} free [one]', '{n} free'), '1 free');
eq('English dates follow an English culture', I.dateLocale('en-US'), 'en-US');
eq('a non-English culture writes English dates the British way', I.dateLocale('fr-FR'), 'en-GB');
I.setLanguage('fr', { remember: false });
eq('French text', I.t('Columns'), 'Colonnes');
eq('French plural and placeholders', [I.tn(1, '{n} task', '{n} tasks'), I.tn(3, '{n} task', '{n} tasks')], ['1 tâche', '3 tâches']);
eq('a singular French needs and English does not', [I.tn(1, '{n} free [one]', '{n} free'), I.tn(3, '{n} free [one]', '{n} free')], ['1 libre', '3 libres']);
eq('French typography: a narrow no-break space before the question mark', I.t('Remove this link?'), 'Supprimer ce lien ?');
eq('French guillemets with no-break spaces', I.t('Saved “{name}”.', { name: 'Plan' }), '« Plan » enregistrée.');
eq('French dates, in Grist’s French region when there is one', [I.dateLocale('en-US'), I.dateLocale('fr-CH')], ['fr-FR', 'fr-CH']);
I.setLanguage('en', { remember: false });

eq('weeks start on Monday in Germany', I.weekStartOf('de-DE'), 1);
eq('and on Sunday in the US', I.weekStartOf('en-US'), 0);
eq('Monday in the UK', I.weekStartOf('en-GB'), 1);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
