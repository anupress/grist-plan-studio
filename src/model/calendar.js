// Working days and public holidays, worked out offline (no service, no download).
//
// Holidays come from rules: fixed dates, dates counted from Easter, "the nth weekday of a month", and
// each country's rule for a holiday that falls on a weekend. Tested against the official lists for
// 2025–2027 (tests/calendar.test.mjs, fixtures/holidays.json: gov.uk and opm.gov first-hand,
// Nager.Date for the others).
//
// What is deliberately left out, because a rule cannot know it: holidays kept only in parts of a
// state (Assumption in parts of Bavaria, Augsburg's peace festival), one-off days (Scotland's
// 2026 World Cup bank holiday), and cantonal holidays in Switzerland beyond the four federal ones.
// Those belong in a Holidays table, which the widget reads as well.
//
// Days are day numbers (model/values.js). Pure: no DOM, no Grist.

const dayOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 864e5);
const weekday = (day) => (((day + 4) % 7) + 7) % 7;          // 0 = Sunday
const yearOf = (day) => new Date(day * 864e5).getUTCFullYear();

/** Easter Sunday (Gregorian), the anonymous algorithm (Meeus/Jones/Butcher). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayOf(y, month, day);
}
/** The nth given weekday of a month (n = -1: the last one). */
function nthWeekday(y, m, wd, n) {
  if (n > 0) { const first = dayOf(y, m, 1); return first + ((wd - weekday(first) + 7) % 7) + (n - 1) * 7; }
  const last = dayOf(y, m + 1, 1) - 1;
  return last - ((weekday(last) - wd + 7) % 7);
}
/** US federal: Saturday is kept on the Friday before, Sunday on the Monday after. */
const usObserved = (d) => (weekday(d) === 6 ? d - 1 : weekday(d) === 0 ? d + 1 : d);

// ---- rules -----------------------------------------------------------------------------------------
// Each returns [day, name] pairs for one year. Names in the region's own language.

const DE_COMMON = (y) => {
  const e = easter(y);
  return [[dayOf(y, 1, 1), 'Neujahr'], [e - 2, 'Karfreitag'], [e + 1, 'Ostermontag'], [dayOf(y, 5, 1), 'Tag der Arbeit'],
    [e + 39, 'Christi Himmelfahrt'], [e + 50, 'Pfingstmontag'], [dayOf(y, 10, 3), 'Tag der Deutschen Einheit'],
    [dayOf(y, 12, 25), '1. Weihnachtstag'], [dayOf(y, 12, 26), '2. Weihnachtstag']];
};
const DE_EXTRA = {
  threeKings: (y) => [dayOf(y, 1, 6), 'Heilige Drei Könige'],
  womensDay: (y) => [dayOf(y, 3, 8), 'Internationaler Frauentag'],
  easterSunday: (y) => [easter(y), 'Ostersonntag'],
  whitSunday: (y) => [easter(y) + 49, 'Pfingstsonntag'],
  corpusChristi: (y) => [easter(y) + 60, 'Fronleichnam'],
  assumption: (y) => [dayOf(y, 8, 15), 'Mariä Himmelfahrt'],
  childrensDay: (y) => [dayOf(y, 9, 20), 'Weltkindertag'],
  reformation: (y) => [dayOf(y, 10, 31), 'Reformationstag'],
  allSaints: (y) => [dayOf(y, 11, 1), 'Allerheiligen'],
  // the Wednesday before 23 November
  repentance: (y) => { const d = dayOf(y, 11, 23); return [d - ((weekday(d) - 3 + 7) % 7 || 7), 'Buß- und Bettag']; },
};
// [extra, from year] per state; a missing year means "for as long as the rule set matters"
const DE_STATES = {
  BW: [['threeKings'], ['corpusChristi'], ['allSaints']],
  BY: [['threeKings'], ['corpusChristi'], ['allSaints']],
  BE: [['womensDay', 2019]],
  BB: [['easterSunday'], ['whitSunday'], ['reformation']],
  HB: [['reformation', 2018]],
  HH: [['reformation', 2018]],
  HE: [['corpusChristi']],
  MV: [['womensDay', 2023], ['reformation']],
  NI: [['reformation', 2018]],
  NW: [['corpusChristi'], ['allSaints']],
  RP: [['corpusChristi'], ['allSaints']],
  SL: [['corpusChristi'], ['assumption'], ['allSaints']],
  SN: [['reformation'], ['repentance']],
  ST: [['threeKings'], ['reformation']],
  SH: [['reformation', 2018]],
  TH: [['childrensDay', 2019], ['reformation']],
};

const RULES = {
  DE: DE_COMMON,
  AT: (y) => {
    const e = easter(y);
    return [[dayOf(y, 1, 1), 'Neujahr'], [dayOf(y, 1, 6), 'Heilige Drei Könige'], [e, 'Ostersonntag'], [e + 1, 'Ostermontag'],
      [dayOf(y, 5, 1), 'Staatsfeiertag'], [e + 39, 'Christi Himmelfahrt'], [e + 49, 'Pfingstsonntag'], [e + 50, 'Pfingstmontag'],
      [e + 60, 'Fronleichnam'], [dayOf(y, 8, 15), 'Mariä Himmelfahrt'], [dayOf(y, 10, 26), 'Nationalfeiertag'],
      [dayOf(y, 11, 1), 'Allerheiligen'], [dayOf(y, 12, 8), 'Mariä Empfängnis'], [dayOf(y, 12, 25), 'Christtag'], [dayOf(y, 12, 26), 'Stefanitag']];
  },
  // Federal law: 1 August, plus the three days equated with Sundays everywhere. Cantons add more.
  CH: (y) => [[dayOf(y, 1, 1), 'Neujahr'], [easter(y) + 39, 'Auffahrt'], [dayOf(y, 8, 1), 'Bundesfeier'], [dayOf(y, 12, 25), 'Weihnachten']],
  FR: (y) => {
    const e = easter(y);
    return [[dayOf(y, 1, 1), 'Jour de l’an'], [e + 1, 'Lundi de Pâques'], [dayOf(y, 5, 1), 'Fête du Travail'], [dayOf(y, 5, 8), 'Victoire 1945'],
      [e + 39, 'Ascension'], [e + 50, 'Lundi de Pentecôte'], [dayOf(y, 7, 14), 'Fête nationale'], [dayOf(y, 8, 15), 'Assomption'],
      [dayOf(y, 11, 1), 'Toussaint'], [dayOf(y, 11, 11), 'Armistice 1918'], [dayOf(y, 12, 25), 'Noël']];
  },
  // England and Wales. A bank holiday on a weekend moves to the next weekday that is not one already.
  'UK-EW': (y) => {
    const e = easter(y);
    const out = [[e - 2, 'Good Friday'], [e + 1, 'Easter Monday'], [nthWeekday(y, 5, 1, 1), 'Early May bank holiday'],
      [nthWeekday(y, 5, 1, -1), 'Spring bank holiday'], [nthWeekday(y, 8, 1, -1), 'Summer bank holiday']];
    const ny = dayOf(y, 1, 1);
    out.push([weekday(ny) === 6 ? ny + 2 : weekday(ny) === 0 ? ny + 1 : ny, 'New Year’s Day']);
    const xmas = dayOf(y, 12, 25), wx = weekday(xmas);
    // Sat: Mon 27 + Tue 28 | Sun: Mon 26 (Boxing Day) + Tue 27 | Fri: Boxing Day Sat -> Mon 28
    if (wx === 6) out.push([xmas + 2, 'Christmas Day'], [xmas + 3, 'Boxing Day']);
    else if (wx === 0) out.push([xmas + 1, 'Boxing Day'], [xmas + 2, 'Christmas Day']);
    else if (wx === 5) out.push([xmas, 'Christmas Day'], [xmas + 3, 'Boxing Day']);
    else out.push([xmas, 'Christmas Day'], [xmas + 1, 'Boxing Day']);
    return out;
  },
  US: (y) => {
    const out = [[usObserved(dayOf(y, 1, 1)), 'New Year’s Day'], [nthWeekday(y, 1, 1, 3), 'Birthday of Martin Luther King, Jr.'],
      [nthWeekday(y, 2, 1, 3), 'Washington’s Birthday'], [nthWeekday(y, 5, 1, -1), 'Memorial Day'],
      [usObserved(dayOf(y, 7, 4)), 'Independence Day'], [nthWeekday(y, 9, 1, 1), 'Labor Day'], [nthWeekday(y, 10, 1, 2), 'Columbus Day'],
      [usObserved(dayOf(y, 11, 11)), 'Veterans Day'], [nthWeekday(y, 11, 4, 4), 'Thanksgiving Day'], [usObserved(dayOf(y, 12, 25)), 'Christmas Day']];
    if (y >= 2021) out.push([usObserved(dayOf(y, 6, 19)), 'Juneteenth National Independence Day']);
    return out;
  },
};

/** The regions offered in the Columns panel: [code, label]. */
export const HOLIDAY_REGIONS = [
  ['DE', 'Germany (nationwide)'],
  ['DE-BW', 'Germany: Baden-Württemberg'], ['DE-BY', 'Germany: Bavaria'], ['DE-BE', 'Germany: Berlin'],
  ['DE-BB', 'Germany: Brandenburg'], ['DE-HB', 'Germany: Bremen'], ['DE-HH', 'Germany: Hamburg'], ['DE-HE', 'Germany: Hesse'],
  ['DE-MV', 'Germany: Mecklenburg-Vorpommern'], ['DE-NI', 'Germany: Lower Saxony'], ['DE-NW', 'Germany: North Rhine-Westphalia'],
  ['DE-RP', 'Germany: Rhineland-Palatinate'], ['DE-SL', 'Germany: Saarland'], ['DE-SN', 'Germany: Saxony'],
  ['DE-ST', 'Germany: Saxony-Anhalt'], ['DE-SH', 'Germany: Schleswig-Holstein'], ['DE-TH', 'Germany: Thuringia'],
  ['AT', 'Austria (nationwide)'], ['CH', 'Switzerland (federal)'], ['FR', 'France (mainland)'],
  ['UK-EW', 'United Kingdom: England and Wales'], ['US', 'United States (federal)'],
];

/** The holidays of a region in one year: Map day -> name. */
export function holidaysOf(region, year) {
  const out = new Map();
  if (!region) return out;
  const [country, state] = region.split('-');
  const base = RULES[region] || RULES[country];
  if (!base) return out;
  for (const [d, n] of base(year)) out.set(d, n);
  if (country === 'DE' && state) {
    for (const [extra, since] of DE_STATES[state] || []) {
      if (since && year < since) continue;
      const [d, n] = DE_EXTRA[extra](year);
      out.set(d, n);
    }
  }
  return out;
}

/** Holidays between two days (inclusive), for a region and/or extra dated rows: Map day -> name. */
export function holidaysBetween(region, from, to, extra = null) {
  const out = new Map();
  if (from == null || to == null) return out;
  for (let y = yearOf(from); y <= yearOf(to); y++) {
    for (const [d, n] of holidaysOf(region, y)) if (d >= from && d <= to) out.set(d, n);
  }
  if (extra) for (const [d, n] of extra) if (d >= from && d <= to && !out.has(d)) out.set(d, n);
  return out;
}

/**
 * The calendar every date calculation goes through. With workdays off it is plain day arithmetic;
 * with it on, weekends and holidays do not count.
 * @param {{workdays?: boolean, holidays?: Map<number,string>, weekend?: number[]}} opts
 */
export function makeCalendar({ workdays = false, holidays = new Map(), weekend = [0, 6] } = {}) {
  const isWork = (d) => !weekend.includes(weekday(d)) && !holidays.has(d);
  if (!workdays) {
    return {
      workdays: false, isWork, holidays,
      /** the last day of a task that starts on `start` and lasts `n` days */
      endAfter: (start, n) => start + Math.max(1, n) - 1,
      /** how many days a task from `a` to `b` lasts */
      length: (a, b) => b - a + 1,
      /** the first day a successor of a task ending on `d` may start */
      after: (d) => d + 1,
      /** move a day by n days, keeping its place in the calendar */
      shift: (d, n) => d + n,
    };
  }
  const nextWork = (d) => { let x = d; for (let i = 0; i < 400 && !isWork(x); i++) x++; return x; };
  return {
    workdays: true, isWork, holidays,
    endAfter: (start, n) => {
      let d = nextWork(start), left = Math.max(1, n) - 1;
      for (let i = 0; left > 0 && i < 20000; i++) { d++; if (isWork(d)) left--; }
      return d;
    },
    length: (a, b) => { let n = 0; for (let d = a; d <= b && d - a < 20000; d++) if (isWork(d)) n++; return Math.max(1, n); },
    after: (d) => nextWork(d + 1),
    shift: (d, n) => {
      let x = d, left = Math.abs(n);
      const step = n < 0 ? -1 : 1;
      for (let i = 0; left > 0 && i < 20000; i++) { x += step; if (isWork(x)) left--; }
      return x;
    },
  };
}
