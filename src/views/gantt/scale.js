// The calendar both date views share: the two-row header (months over days, years over weeks...),
// weekend and holiday shading, and the today line. Used by the Gantt chart and the timeline.

import { el, clear } from '../../core/util.js';
import { ticks, weekendDays, xOf, dayAt, ZOOMS } from './layout.js';
import { dateFromDay } from '../../model/values.js';
import { t } from '../../i18n/index.js';

export function formatters(locale) {
  const f = (o) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o });
  return {
    monthYear: f({ month: 'long', year: 'numeric' }),
    monthYearShort: f({ month: 'short', year: 'numeric' }),
    month: f({ month: 'long' }),
    monthShort: f({ month: 'short' }),
    dayMonth: f({ day: 'numeric', month: 'short' }),
    dayMonthYear: f({ day: 'numeric', month: 'short', year: 'numeric' }),
    weekdayDay: f({ weekday: 'short', day: 'numeric' }),
    full: f({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/** "2 Nov – 6 Nov 2026", "Fri, 20 Nov 2026" */
export function rangeText(F, span) {
  if (span.start === span.end) return F.full.format(dateFromDay(span.start));
  const a = dateFromDay(span.start), b = dateFromDay(span.end);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  return `${(sameYear ? F.dayMonth : F.dayMonthYear).format(a)} – ${F.dayMonthYear.format(b)}`;
}

/** show.weekNumbers off: a week is named by the day it starts, as most calendars do without numbers. */
export function headLabel(F, unit, c, w, show = {}) {
  switch (unit) {
    case 'day': return String(c.d);
    case 'week':
      if (show.weekNumbers === false) return w >= 44 ? F.dayMonth.format(dateFromDay(c.start)) : String(c.d);
      return w >= 70 ? t('W{n}', { n: c.wk }) + ' · ' + F.dayMonth.format(dateFromDay(c.start)) : t('W{n}', { n: c.wk });
    case 'month': return (w >= 80 ? F.month : F.monthShort).format(dateFromDay(c.start));
    case 'quarter': return t('Q{n}', { n: c.q });
    case 'year': return String(c.y);
    default: return '';
  }
}
export function topLabel(F, unit, c, w) {
  if (unit === 'month') return (w >= 120 ? F.monthYear : F.monthYearShort).format(dateFromDay(c.start));
  return String(c.y);
}

/** The header cells between x0 and x1 (chart pixels). */
export function drawScale({ frame, top, bottom, F, today, holidays, x0, x1, show = {} }) {
  const z = ZOOMS[frame.zoom];
  const cells = (row, unit, label) => {
    clear(row);
    for (const c of ticks(frame, unit, x0, x1)) {
      const isToday = unit === 'day' && c.start === today;
      const weekend = show.weekends !== false && unit === 'day' && frame.px >= 6 && [0, 6].includes(new Date(c.start * 864e5).getUTCDay());
      const holiday = unit === 'day' && holidays?.get(c.start);
      row.appendChild(el('div', {
        class: 'ps-scale__cell' + (isToday ? ' is-today' : '') + (weekend ? ' is-weekend' : '') + (holiday ? ' is-holiday' : ''),
        style: { left: c.x + 'px', width: c.w + 'px' },
        title: holiday || (unit === 'week' ? rangeText(F, { start: c.start, end: c.end }) : null),
      }, [el('span', { text: label(F, unit, c, c.w, show) })]));
    }
  };
  if (z.top) cells(top, z.top, topLabel); else clear(top);
  cells(bottom, z.bottom, headLabel);
}

/** Weekends and holidays between x0 and x1, and where today's line goes. */
export function drawShade({ frame, shade, todayLine, holidays, today, x0, x1, show = {} }) {
  clear(shade);
  for (const d of show.weekends === false ? [] : weekendDays(frame, x0, x1)) {
    shade.appendChild(el('div', { class: 'ps-chart__weekend', style: { left: xOf(frame, d) + 'px', width: frame.px + 'px' } }));
  }
  if (holidays && frame.px >= 3) {
    const a = dayAt(frame, Math.max(0, x0)), b = dayAt(frame, x1);
    for (const [d, name] of holidays) {
      if (d < a || d > b) continue;
      shade.appendChild(el('div', { class: 'ps-chart__holiday', title: name, style: { left: xOf(frame, d) + 'px', width: Math.max(2, frame.px) + 'px' } }));
    }
  }
  const inFrame = today >= frame.from && today <= frame.to;
  todayLine.hidden = !inFrame || show.today === false;
  if (inFrame) todayLine.style.left = Math.round(xOf(frame, today) + frame.px / 2) + 'px';
}
