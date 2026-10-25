// Dates written the way the table writes them (M29). A Date column in Grist has a format ("DD/MM/YYYY", "MMM D, YYYY");
// with this the plan can use it too, instead of the interface language's own short date. Pure: no DOM, no Grist.

/** What Grist writes a Date column in when its settings name no format. */
export const DEFAULT_PATTERN = 'YYYY-MM-DD';

/** The pattern a Date column asks for, or the default. Only what a person could have typed is kept: no tags, nothing very long. */
export function tablePattern(col) {
  const p = col && typeof col.dateFormat === 'string' ? col.dateFormat.trim() : '';
  return p && p.length <= 40 ? p : DEFAULT_PATTERN;
}

// the tokens of a moment-style pattern that mean something in a date, longest first; [text] is kept as it is
const TOKENS = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|dd|d/g;

/** The ordinal of a day in the language's habit: 1st, 2nd, 3rd; 1er, 2; 1., 2. */
export function ordinal(n, locale) {
  const lang = String(locale || 'en').toLowerCase().split('-')[0];
  if (lang === 'en') {
    const m100 = n % 100;
    if (m100 >= 11 && m100 <= 13) return n + 'th';
    return n + (({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
  }
  if (lang === 'fr') return n === 1 ? '1er' : String(n);
  return n + '.';
}

const names = new Map();
/** The names of the twelve months or seven weekdays, in the language, as 'long', 'short' or 'narrow'. */
function nameList(locale, kind, style) {
  const key = locale + '|' + kind + '|' + style;
  let list = names.get(key);
  if (!list) {
    const f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', [kind]: style });
    // 2026-01-01 was a Thursday: 2026-01-04 is a Sunday, and the months run on from the 1st
    list = kind === 'month'
      ? Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2026, i, 1))))
      : Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 0, 4 + i))));
    names.set(key, list);
  }
  return list;
}

/** One day (a Date at UTC midnight) in a moment-style pattern, with the names in the given language. */
export function formatDate(date, pattern, locale = 'en') {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate(), wd = date.getUTCDay();
  const two = (n) => String(n).padStart(2, '0');
  return String(pattern || DEFAULT_PATTERN).replace(TOKENS, (tok, literal) => {
    if (literal !== undefined) return literal;
    switch (tok) {
      case 'YYYY': return String(y).padStart(4, '0');
      case 'YY': return two(y % 100);
      case 'MMMM': return nameList(locale, 'month', 'long')[m];
      case 'MMM': return nameList(locale, 'month', 'short')[m];
      case 'MM': return two(m + 1);
      case 'M': return String(m + 1);
      case 'Do': return ordinal(d, locale);
      case 'DD': return two(d);
      case 'D': return String(d);
      case 'dddd': return nameList(locale, 'weekday', 'long')[wd];
      case 'ddd': return nameList(locale, 'weekday', 'short')[wd];
      case 'dd': return nameList(locale, 'weekday', 'short')[wd].slice(0, 2);
      case 'd': return String(wd);
      default: return tok;
    }
  });
}

/** An object that formats like an Intl.DateTimeFormat for one day (`format(date)`), written in the pattern. */
export function patternFormatter(pattern, locale) {
  return { format: (date) => formatDate(date, pattern, locale) };
}
