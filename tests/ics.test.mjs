// The calendar file: RFC 5545 text escaping, line folding at 75 octets, whole-day events with an
// exclusive end, an alarm before the first day, and a stable UID.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const I = await imp('src/model/ics.js');
const { dayFromISO: day } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

eq('commas, semicolons, backslashes and line breaks are escaped', I.escapeText('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
eq('a short line stays', I.fold('SUMMARY:Short'), 'SUMMARY:Short');
const long = 'DESCRIPTION:' + 'x'.repeat(200);
const folded = I.fold(long);
eq('a long line folds at 75 octets with a leading space', folded.split('\r\n').map((l) => new TextEncoder().encode(l).length), [75, 75, 64]);
eq('unfolding gives the line back', folded.replace(/\r\n /g, ''), long);
const accents = 'SUMMARY:' + 'ä'.repeat(60);
const fa = I.fold(accents).split('\r\n');
eq('a fold never splits a character: every line decodes whole', fa.every((l) => !l.includes('�')) && fa.every((l) => new TextEncoder().encode(l).length <= 75), true);
eq('and unfolds back', I.fold(accents).replace(/\r\n /g, ''), accents);
eq('15 hours before', I.before(900), '-PT15H');
eq('a day and a half before', I.before(2160), '-P1DT12H');
eq('ten minutes before', I.before(10), '-PT10M');
eq('three days before', I.before(4320), '-P3D');
eq('at the start', I.before(0), 'PT0M');
eq('nine hours after the day starts', I.before(-540), 'PT9H');
eq('a day and nine hours after', I.before(-1980), 'P1DT9H');

const NOW = Date.UTC(2026, 10, 4, 9, 30, 5) / 1000;
const ics = I.toIcs([
  { uid: 'task-7@plan-studio', title: 'Design, review; sign-off', start: day('2026-11-09'), end: day('2026-11-11'), description: 'Ann\nHigh priority', alarm: 900 },
  { uid: 'task-8@plan-studio', title: 'Launch', start: day('2026-11-30'), end: day('2026-11-30'), alarm: null },
], { now: NOW, name: 'Website relaunch' });
const lines = ics.split('\r\n');
eq('ends with a line break, and CRLF throughout', [ics.endsWith('\r\n'), ics.replace(/\r\n/g, '').includes('\n')], [true, false]);
eq('a calendar wrapper', [lines[0], lines[1], lines.at(-2)], ['BEGIN:VCALENDAR', 'VERSION:2.0', 'END:VCALENDAR']);
eq('the calendar has a name', lines.includes('X-WR-CALNAME:Website relaunch'), true);
eq('two events', lines.filter((l) => l === 'BEGIN:VEVENT').length, 2);
eq('a span of days: the end is the day after the last', [lines.includes('DTSTART;VALUE=DATE:20261109'), lines.includes('DTEND;VALUE=DATE:20261112')], [true, true]);
eq('a one-day task ends the next day', [lines.includes('DTSTART;VALUE=DATE:20261130'), lines.includes('DTEND;VALUE=DATE:20261201')], [true, true]);
eq('the stamp is UTC', lines.includes('DTSTAMP:20261104T093005Z'), true);
eq('the title is escaped', lines.includes('SUMMARY:Design\\, review\\; sign-off'), true);
eq('the description keeps its line break as \\n', lines.includes('DESCRIPTION:Ann\\nHigh priority'), true);
eq('the alarm: display, 15 hours before the day starts', [lines.includes('BEGIN:VALARM'), lines.includes('ACTION:DISPLAY'), lines.includes('TRIGGER:-PT15H')], [true, true, true]);
eq('only the event with an alarm has one', lines.filter((l) => l === 'BEGIN:VALARM').length, 1);
eq('events do not block time', lines.filter((l) => l === 'TRANSP:TRANSPARENT').length, 2);
eq('end before start is one day', I.toIcs([{ uid: 'x', title: 'T', start: day('2026-11-09'), end: day('2026-11-01'), alarm: null }], { now: NOW }).includes('DTEND;VALUE=DATE:20261110'), true);
eq('no line is longer than 75 octets', ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), true);
eq('file names lose what a file system refuses', I.fileName('Plan: A/B?  "x"'), 'Plan A B x');
eq('and fall back to "plan"', I.fileName('???'), 'plan');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
