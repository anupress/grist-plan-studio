// Holidays against the official lists (fixtures/holidays.json), and working-day arithmetic.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const C = await imp('src/model/calendar.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');
const REF = JSON.parse(readFileSync(join(HERE, 'fixtures/holidays.json'), 'utf8'));

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const list = (region, year) => [...C.holidaysOf(region, year).keys()].sort((a, b) => a - b).map(iso);

// ---- Easter, the anchor of half the holidays
eq('Easter 2024–2027', [2024, 2025, 2026, 2027].map((y) => iso(C.easter(y))), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28']);
eq('Easter 2038 (late)', iso(C.easter(2038)), '2038-04-25');

// ---- against the official lists
for (const y of ['2025', '2026', '2027']) {
  eq(`England and Wales ${y} (gov.uk)`, list('UK-EW', +y), REF['uk-ew'].filter((d) => d.startsWith(y)));
}
eq('US federal 2026 (opm.gov)', list('US', 2026), REF['us-2026']);
eq('US federal 2027 (opm.gov)', list('US', 2027), REF['us-2027']);
eq('Germany 2026, nationwide', list('DE', 2026), REF['de-2026-national']);
for (const st of ['by', 'be', 'sn', 'bb', 'nw', 'th']) eq(`Germany 2026, ${st.toUpperCase()}`, list('DE-' + st.toUpperCase(), 2026), REF[`de-${st}-2026`]);
eq('Austria 2026', list('AT', 2026), REF['at-2026-national']);
eq('France 2026', list('FR', 2026), REF['fr-2026-national']);
eq('Switzerland 2026, federal', list('CH', 2026), REF['ch-2026-national']);

// ---- rules with a history or a weekend twist
eq('Berlin had no Women’s Day before 2019', C.holidaysOf('DE-BE', 2018).has(day('2018-03-08')), false);
eq('Repentance Day 2026: Wednesday 18 Nov', C.holidaysOf('DE-SN', 2026).get(day('2026-11-18')), 'Buß- und Bettag');
eq('Repentance Day 2027: Wednesday 17 Nov', C.holidaysOf('DE-SN', 2027).has(day('2027-11-17')), true);
eq('UK 2022: Christmas on a Sunday -> Boxing Day Mon 26, Christmas Tue 27', [26, 27].map((d) => C.holidaysOf('UK-EW', 2022).get(day(`2022-12-${d}`))), ['Boxing Day', 'Christmas Day']);
eq('UK 2022: New Year on a Saturday -> Monday 3 Jan', C.holidaysOf('UK-EW', 2022).get(day('2022-01-03')), 'New Year’s Day');
eq('US 2026: 4 July on a Saturday -> Friday 3 July', C.holidaysOf('US', 2026).get(day('2026-07-03')), 'Independence Day');
eq('no region, no holidays', C.holidaysOf(null, 2026).size, 0);
eq('holidays between two days, across a year end', [...C.holidaysBetween('DE', day('2026-12-20'), day('2027-01-02')).keys()].map(iso), ['2026-12-25', '2026-12-26', '2027-01-01']);
eq('extra days from a Holidays table join in', [...C.holidaysBetween('DE', day('2026-12-27'), day('2026-12-31'), new Map([[day('2026-12-28'), 'Betriebsferien']])).values()], ['Betriebsferien']);

// ---- working days
{
  const hol = C.holidaysBetween('DE', day('2026-01-01'), day('2026-12-31'));
  const cal = C.makeCalendar({ workdays: true, holidays: hol });
  // Thu 2 Apr 2026, then Good Friday 3 Apr, weekend, Easter Monday 6 Apr
  eq('3 working days from Thu 2 Apr skip Easter: Thu, Tue, Wed', iso(cal.endAfter(day('2026-04-02'), 3)), '2026-04-08');
  eq('length counts only working days', cal.length(day('2026-04-02'), day('2026-04-08')), 3);
  eq('a successor of a task ending Thu 2 Apr starts Tue 7 Apr', iso(cal.after(day('2026-04-02'))), '2026-04-07');
  eq('shift by 2 working days from Fri 30 Oct', iso(cal.shift(day('2026-10-30'), 2)), '2026-11-03');
  eq('shift back by 1 from Mon 2 Nov', iso(cal.shift(day('2026-11-02'), -1)), '2026-10-30');
  eq('a task starting on a Saturday begins counting on Monday', iso(cal.endAfter(day('2026-10-31'), 1)), '2026-11-02');
  eq('weekend is not a working day', [cal.isWork(day('2026-10-31')), cal.isWork(day('2026-11-02'))], [false, true]);
  const plain = C.makeCalendar();
  eq('calendar days: 3 days from Thu 2 Apr end Sat 4 Apr', iso(plain.endAfter(day('2026-04-02'), 3)), '2026-04-04');
  eq('calendar days: the next day', iso(plain.after(day('2026-04-02'))), '2026-04-03');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
