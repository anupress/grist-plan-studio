// Grist's encoded cells (connect.js asks for keepEncoded) -> plain values the views can use.
//
// The shapes, as measured in M0:
//   Date        ['d', secs]              secs = UTC midnight of that day
//   DateTime    ['D', secs, 'Zone/Name'] a real instant; its DAY depends on the zone
//   Reference   ['R', 'Table', id]       id 0 = empty
//   lists       ['L', ...items]          RefList ids, ChoiceList strings
//   errors etc. ['E', ...], ['P'], ['C'] ... nothing usable
//
// Days are integers: days since 1970-01-01. Every date in the views is one, so a bar is two integers
// and no timezone or DST can move it. Pure: tested in tests/values.test.mjs.

import { toDayString, zoneOfType } from '../core/grist/dates.js';

const DAY_SECS = 86400;

/** 'YYYY-MM-DD' -> day number (or null). */
export function dayFromISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null;
}

/** day number -> 'YYYY-MM-DD'. */
export const isoFromDay = (day) => new Date(day * 864e5).toISOString().slice(0, 10);

/** day number -> a Date at UTC midnight, for Intl formatting with timeZone 'UTC'. */
export const dateFromDay = (day) => new Date(day * 864e5);

/** Today in this browser's own calendar, as a day number. */
export function todayDay(now = new Date()) {
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
}

/**
 * A date cell -> the day it falls on, or null.
 * @param cell  encoded cell (or a bare number of seconds, as Grist sends without keepEncoded)
 * @param type  the column's Grist type, used only for bare numbers
 */
export function dayOf(cell, type = 'Date') {
  if (cell == null || cell === '') return null;
  if (Array.isArray(cell)) {
    if (cell[0] === 'd' && typeof cell[1] === 'number') return Math.floor(cell[1] / DAY_SECS);
    if (cell[0] === 'D' && typeof cell[1] === 'number') return dayFromISO(toDayString(cell[1], cell[2] || 'UTC'));
    return null;
  }
  if (typeof cell === 'number' && isFinite(cell)) {
    const zone = zoneOfType(type);
    if (zone === undefined) return null;
    return zone ? dayFromISO(toDayString(cell, zone)) : Math.floor(cell / DAY_SECS);
  }
  return null;
}

/** A Reference cell -> row id, or null for empty. */
export function refId(cell) {
  if (Array.isArray(cell)) return cell[0] === 'R' && cell[2] ? cell[2] : null;
  return typeof cell === 'number' && cell > 0 ? cell : null;
}

/** A list cell (RefList, ChoiceList) -> its items; a single Reference -> [id]; empty -> []. */
export function listOf(cell) {
  if (cell == null || cell === '') return [];
  if (Array.isArray(cell)) {
    if (cell[0] === 'L') return cell.slice(1);
    if (cell[0] === 'R') return cell[2] ? [cell[2]] : [];
    return [];
  }
  return [cell];
}

/** Anything else -> a plain value; errors and placeholders -> null. */
export function plain(cell) {
  if (Array.isArray(cell)) {
    if (cell[0] === 'L') return cell.slice(1).join(', ');
    if (cell[0] === 'R') return cell[2] || null;
    if (cell[0] === 'd' || cell[0] === 'D') return cell[1];
    return null;
  }
  return cell;
}

/** A number cell -> a number, or null. */
export function num(cell) {
  const v = plain(cell);
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * How a progress column is meant: 0–1 or 0–100. Decided per column, not per cell, so 0.5 in a
 * 0–100 column stays half a percent. Percent-formatted Numeric columns store 0–1.
 */
export function progressScale(values) {
  return values.some((v) => typeof v === 'number' && v > 1.0001) ? 100 : 1;
}
