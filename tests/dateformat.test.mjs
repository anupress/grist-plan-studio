// Dates written the way the table writes them: Grist's own formats, moment-style tokens, names in the language.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const F = await imp('src/model/dateformat.js');
const D = await imp('src/model/display.js');
const S = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const on = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const fmt = (date, p, loc = 'en') => F.formatDate(date, p, loc);

// the formats Grist offers for a Date column
const day = on(2026, 3, 7);          // a Saturday
eq('ISO, the default', fmt(day, 'YYYY-MM-DD'), '2026-03-07');
eq('US, month first', fmt(day, 'MM-DD-YYYY'), '03-07-2026');
eq('with slashes and two digits of year', fmt(day, 'MM/DD/YY'), '03/07/26');
eq('day, short month, year', fmt(day, 'DD MMM YYYY'), '07 Mar 2026');
eq('long month with an ordinal', fmt(day, 'MMMM Do, YYYY'), 'March 7th, 2026');
eq('weekday in front', fmt(day, 'dddd, MMMM D, YYYY'), 'Saturday, March 7, 2026');
eq('short weekday and no year', fmt(day, 'ddd, MMM D'), 'Sat, Mar 7');
eq('a day with no zero, a month with none', fmt(on(2026, 1, 5), 'D/M/YYYY'), '5/1/2026');
eq('text in brackets is kept as it is', fmt(day, '[Day] D [of] MMMM'), 'Day 7 of March');
eq('a letter that is no token stays', fmt(day, 'YYYY.MM.DD (x)'), '2026.03.07 (x)');
eq('a small year is padded', fmt(on(900, 1, 2), 'YYYY'), '0900');

// ordinals: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd
eq('English ordinals', [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30].map((n) => F.ordinal(n, 'en-GB')), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th']);
eq('French: only the first has a word', [1, 2, 31].map((n) => F.ordinal(n, 'fr-FR')), ['1er', '2', '31']);
eq('German: a full stop', F.ordinal(7, 'de-DE'), '7.');

// the names follow the language
eq('German names', fmt(day, 'dddd, D. MMMM YYYY', 'de'), 'Samstag, 7. März 2026');
eq('French names', fmt(day, 'dddd D MMMM YYYY', 'fr'), 'samedi 7 mars 2026');
eq('the first day of the year', fmt(on(2027, 1, 1), 'ddd D MMM', 'en'), 'Fri 1 Jan');
eq('the last day of the year', fmt(on(2026, 12, 31), 'dddd', 'en'), 'Thursday');
eq('weekday number and the two letters', [fmt(day, 'd'), fmt(day, 'dd')], ['6', 'Sa']);

// the pattern a column asks for
eq('a column with a format', F.tablePattern({ dateFormat: 'DD/MM/YYYY' }), 'DD/MM/YYYY');
eq('a column with none, or none at all, gets the default', [F.tablePattern({}), F.tablePattern(null), F.tablePattern({ dateFormat: '' }), F.tablePattern({ dateFormat: 7 })], ['YYYY-MM-DD', 'YYYY-MM-DD', 'YYYY-MM-DD', 'YYYY-MM-DD']);
eq('a very long pattern is not trusted', F.tablePattern({ dateFormat: 'D'.repeat(60) }), 'YYYY-MM-DD');

// the formatter has the shape Intl has for one day
eq('a formatter formats a day', F.patternFormatter('DD.MM.YYYY', 'de').format(on(2026, 11, 7)), '07.11.2026');

// the column list carries the format
const cols = S.tableColumns('Tasks', [{ id: 1, tableId: 'Tasks' }], [
  { id: 10, parentId: 1, colId: 'Start', label: 'Start', type: 'Date', widgetOptions: JSON.stringify({ dateFormat: 'DD/MM/YYYY', isCustomDateFormat: false }) },
  { id: 11, parentId: 1, colId: 'End', label: 'End', type: 'Date', widgetOptions: '' },
  { id: 12, parentId: 1, colId: 'Notes', label: 'Notes', type: 'Text', widgetOptions: JSON.stringify({ dateFormat: 'YYYY' }) },
]);
eq('a Date column keeps its format', cols.find((c) => c.id === 'Start').dateFormat, 'DD/MM/YYYY');
eq('a Date column with no format has none', cols.find((c) => c.id === 'End').dateFormat, null);
eq('another kind of column has none', cols.find((c) => c.id === 'Notes').dateFormat, null);

// the choice is kept in Display
eq('dates are written in the language\'s way unless chosen', D.cleanDisplay(null).dates, null);
eq('the table\'s way is kept', D.cleanDisplay({ dates: 'table' }).dates, 'table');
eq('anything else falls back', [D.cleanDisplay({ dates: 'iso' }).dates, D.cleanDisplay({ dates: 3 }).dates], [null, null]);
eq('it counts as a change from the defaults', [D.isDefaultDisplay({ dates: 'table' }), D.isDefaultDisplay(null)], [false, true]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
