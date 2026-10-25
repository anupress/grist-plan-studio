// Calendar files (M11): an .ics file (RFC 5545) a calendar app imports, for one task, one booking, or
// a list of them. Every event is a whole day or a run of days, as Plan Studio's dates are, and is
// marked free so a deadline does not block anyone's time. Pure: tests/ics.test.mjs.
//
// The alarm is a display reminder, timed from the start of the event's first day (midnight): 15 hours
// before is 9:00 the day before, 9 hours after is 9:00 that day. It is written in the standard form
// (VALARM, ACTION:DISPLAY, a TRIGGER duration). Whether a calendar app keeps it on import is the app's
// choice: Google does not document it for imported files, so a person who finds none there sets the
// calendar's own notification.

import { isoFromDay } from './values.js';

const pad = (n) => String(n).padStart(2, '0');
const dateOf = (day) => isoFromDay(day).replace(/-/g, '');
const stampOf = (secs) => {
  const d = new Date(secs * 1000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
/** TEXT as RFC 5545 escapes it: backslash, semicolon, comma, and line breaks as \n. */
export const escapeText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** A content line folded at 75 octets: the rest goes on lines that start with a space, never inside a character. */
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', size = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit) { out.push(cur); cur = ''; size = 0; limit = 74; }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** "-PT15H": a duration before the event's start as RFC 5545 writes it; a negative number of minutes is after ("PT9H"). */
export function before(minutes) {
  const a = Math.abs(minutes);
  const d = Math.floor(a / 1440), h = Math.floor((a % 1440) / 60), m = a % 60;
  const time = h || m ? 'T' + (h ? h + 'H' : '') + (m ? m + 'M' : '') : '';
  return d || time ? (minutes > 0 ? '-' : '') + 'P' + (d ? d + 'D' : '') + time : 'PT0M';
}

/**
 * @param events [{uid, title, start (day), end (day, inclusive), description?, url?, alarm (minutes before the first day starts; negative after) | null}]
 * @param o {now: epoch seconds (DTSTAMP), name: the calendar's name | null, prodId}
 * @returns {string} the file, CRLF line endings
 */
export function toIcs(events, { now, name = null, prodId = '-//ANUPRESS//Plan Studio//EN' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:' + prodId, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (name) lines.push('X-WR-CALNAME:' + escapeText(name));
  for (const e of events) {
    lines.push('BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + stampOf(now),
      'DTSTART;VALUE=DATE:' + dateOf(e.start), 'DTEND;VALUE=DATE:' + dateOf(Math.max(e.start, e.end) + 1),
      'SUMMARY:' + escapeText(e.title), 'TRANSP:TRANSPARENT');
    if (e.description) lines.push('DESCRIPTION:' + escapeText(e.description));
    if (e.url) lines.push('URL:' + e.url);
    if (e.alarm != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escapeText(e.title), 'TRIGGER:' + before(e.alarm), 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A file name a download keeps: no characters a file system refuses, at most 80 of them. */
export const fileName = (s) => String(s || 'plan').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'plan';
