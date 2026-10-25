// The printout: plain DOM built for paper, not a picture of the screen. Each page repeats its title
// and its header (an HTML table's <thead>, which browsers repeat on every printed page), rows never
// split across a page edge, and colours print as they show (print-color-adjust). Sizes come from
// print/layout.js; styles from styles/print.css.

import { el } from '../core/util.js';
import { onColor } from '../core/theme/apply.js';
import { ticks, xOf } from '../views/gantt/layout.js';
import { formatters, headLabel, topLabel } from '../views/gantt/scale.js';
import { pageArea, fitFrame, slices, unitsFor, periodPages, lanePages, MM } from './layout.js';
import { dateFromDay } from '../model/values.js';
import { t, tn } from '../i18n/index.js';

const TRACK = Math.round(6.6 * MM);   // a row of bars on paper
const BAR = Math.round(4.4 * MM);

function titleRow(s, cols) {
  return el('tr', { class: 'pp-titlerow' }, [el('th', { colSpan: cols, class: 'pp-title' }, [
    el('span', { class: 'pp-title__main', text: s.title }),
    el('span', { class: 'pp-title__sub', text: s.subtitle }),
  ])]);
}

// ---- Gantt chart and timeline ----------------------------------------------------------------------------

/**
 * @param s {title, subtitle, nameHeader, paper, mode: 'fit' | 'pages', zoomPx, weekStart, locale, today, holidays,
 *           span: {from, to}, rows: [{label, sub, depth, kind: 'task'|'group'|'lane', tracks,
 *           bars: [{start, end, kind: 'bar'|'milestone'|'summary', colour, title, track, progress, critical, clash}]}],
 *           labelsInside: true for the timeline (bars share a row, so labels stay in their bar)}
 */
export function renderTimePrint(s) {
  const page = pageArea(s.paper);
  const nameW = Math.round((s.paper === 'A3' ? 78 : 62) * MM);
  const chartW = page.w - nameW;
  const F = formatters(s.locale);
  let frames;
  if (s.mode === 'pages') {
    const base = fitFrame(s.span, chartW, s.weekStart);
    const whole = { ...base, px: s.zoomPx, ...unitsFor(s.zoomPx), width: (base.to - base.from + 1) * s.zoomPx };
    frames = slices(whole, chartW).map((sl) => ({ ...whole, from: sl.from, to: sl.to, width: (sl.to - sl.from + 1) * whole.px }));
  } else frames = [fitFrame(s.span, chartW, s.weekStart)];

  const root = el('div', { class: 'pp-root' });
  frames.forEach((frame, fi) => {
    const sheet = el('table', { class: 'pp-sheet' + (fi ? ' pp-break' : ''), style: { width: nameW + chartW + 'px' } });
    // A fixed table takes its widths from its first row, the title that spans both: say them here.
    sheet.appendChild(el('colgroup', {}, [el('col', { style: { width: nameW + 'px' } }), el('col', { style: { width: chartW + 'px' } })]));
    const scaleRow = (unit, label) => el('div', { class: 'pp-scale__row' }, ticks(frame, unit).map((c) => el('div', {
      class: 'pp-scale__cell', style: { left: c.x + 'px', width: c.w + 'px' },
    }, [label(F, unit, c, c.w)])));
    const sub = frames.length > 1 ? `${s.subtitle} · ${t('page {n} of {m}', { n: fi + 1, m: frames.length })}` : s.subtitle;
    sheet.append(el('thead', {}, [
      titleRow({ ...s, subtitle: sub }, 2),
      el('tr', { class: 'pp-headrow' }, [
        el('th', { class: 'pp-name pp-name--head', style: { width: nameW + 'px' }, text: s.nameHeader || '' }),
        el('th', { class: 'pp-scale', style: { width: chartW + 'px' } }, [
          frame.top ? scaleRow(frame.top, topLabel) : null,
          scaleRow(frame.bottom, headLabel),
        ]),
      ]),
    ]));
    const lines = ticks(frame, frame.top || frame.bottom).map((c) => c.x).filter((x) => x > 0);
    const todayX = s.today >= frame.from && s.today <= frame.to ? xOf(frame, s.today) + frame.px / 2 : null;
    const body = el('tbody');
    for (const row of s.rows) {
      const h = Math.max(1, row.tracks || 1) * TRACK;
      const strip = el('div', { class: 'pp-strip', style: { height: h + 'px', width: chartW + 'px' } });
      for (const x of lines) strip.appendChild(el('div', { class: 'pp-gridline', style: { left: x + 'px' } }));
      if (todayX != null) strip.appendChild(el('div', { class: 'pp-today', style: { left: todayX + 'px' } }));
      for (const b of row.bars) {
        if (b.end < frame.from || b.start > frame.to) continue;
        const a = Math.max(b.start, frame.from), z = Math.min(b.end, frame.to);
        const x = xOf(frame, a), w = Math.max(2, (z - a + 1) * frame.px);
        const top = (b.track || 0) * TRACK + (TRACK - BAR) / 2;
        // the plan under a bar that has moved, and the day it was really done (M18)
        if (b.plan) {
          const pa = Math.max(b.plan.start, frame.from), pz = Math.min(b.plan.end, frame.to);
          if (pz >= pa) strip.appendChild(el('div', { class: 'pp-plan', style: { left: xOf(frame, pa) + 'px', top: top + BAR + 1 + 'px', width: Math.max(2, (pz - pa + 1) * frame.px) + 'px' } }));
        }
        if (b.doneOn != null && b.doneOn >= frame.from && b.doneOn <= frame.to) {
          strip.appendChild(el('div', { class: 'pp-done', style: { left: xOf(frame, b.doneOn) + frame.px / 2 - 4.5 + 'px', top: top + (BAR - 9) / 2 + 'px' } }));
        }
        if (b.kind === 'milestone') {
          strip.appendChild(el('div', { class: 'pp-ms' + (b.critical ? ' is-critical' : '') + (b.clash ? ' is-clash' : ''), style: { left: x + frame.px / 2 - BAR / 2 + 'px', top: top + 'px', width: BAR + 'px', height: BAR + 'px', '--fill': b.colour || '#3d73b8' } }));
          if (!s.labelsInside) strip.appendChild(el('span', { class: 'pp-out', style: { left: x + frame.px / 2 + BAR / 2 + 3 + 'px', top: top + 'px', lineHeight: BAR + 'px' }, text: b.title }));
          continue;
        }
        if (b.kind === 'summary') {
          strip.appendChild(el('div', { class: 'pp-sum' + (b.critical ? ' is-critical' : ''), style: { left: x + 'px', top: top + BAR / 4 + 'px', width: w + 'px' } }));
          continue;
        }
        const fits = w >= Math.min(b.title.length, 50) * 5.6 + 10;
        const fill = b.colour || '#3d73b8';
        strip.appendChild(el('div', {
          class: 'pp-bar' + (b.critical ? ' is-critical' : '') + (b.clash ? ' is-clash' : ''),
          style: { left: x + 'px', top: top + 'px', width: w + 'px', height: BAR + 'px', background: fill, color: onColor(fill) },
        }, [
          b.progress > 0 ? el('span', { class: 'pp-bar__progress', style: { width: Math.round(b.progress * 100) + '%' } }) : null,
          fits || s.labelsInside ? el('span', { class: 'pp-bar__label', text: b.title }) : null,
        ]));
        if (!fits && !s.labelsInside) strip.appendChild(el('span', { class: 'pp-out', style: { left: x + w + 4 + 'px', top: top + 'px', lineHeight: BAR + 'px' }, text: b.title }));
      }
      body.appendChild(el('tr', { class: 'pp-row pp-row--' + row.kind }, [
        el('td', { class: 'pp-name', style: { height: h + 'px' } }, [
          el('span', { class: 'pp-name__label', style: { paddingLeft: (row.depth || 0) * 10 + 'px' }, text: row.label }),
          row.sub ? el('span', { class: 'pp-name__sub', text: row.sub }) : null,
        ]),
        el('td', { class: 'pp-chart' }, [strip]),
      ]));
    }
    sheet.appendChild(body);
    root.appendChild(sheet);
  });
  return root;
}

// ---- board ---------------------------------------------------------------------------------------------

/**
 * @param s {title, subtitle, paper, lanes: [{name, count, over, colour, cards: [{title, when, late, people, fields: [{label, text}], done}]}]}
 */
export function renderBoardPrint(s) {
  const page = pageArea(s.paper);
  const root = el('div', { class: 'pp-root' });
  const pages = lanePages(s.lanes.length, page.w, 62 * MM);
  pages.forEach(([a, b], pi) => {
    const lanes = s.lanes.slice(a, b + 1);
    const sub = pages.length > 1 ? `${s.subtitle} · ${t('page {n} of {m}', { n: pi + 1, m: pages.length })}` : s.subtitle;
    // A table, so the title and the lane heads repeat on every page a long lane runs onto.
    const n = Math.max(1, b - a + 1);
    const colW = Math.floor(page.w / n);
    root.appendChild(el('table', { class: 'pp-sheet pp-board' + (pi ? ' pp-break' : ''), style: { width: n * colW + 'px' } }, [
      el('colgroup', {}, lanes.map(() => el('col', { style: { width: colW + 'px' } }))),
      el('thead', {}, [
        titleRow({ ...s, subtitle: sub }, n),
        el('tr', {}, lanes.map((lane) => el('th', { class: 'pp-lane__head' + (lane.over ? ' is-over' : ''), style: { borderTopColor: lane.colour || '#c3cedb' } }, [
          el('span', { class: 'pp-lane__name', text: lane.name }), el('span', { class: 'pp-lane__count', text: lane.count }),
        ]))),
      ]),
      el('tbody', {}, [el('tr', {}, lanes.map((lane) => el('td', { class: 'pp-lane' }, [
        ...lane.cards.map((c) => el('div', { class: 'pp-card' + (c.done ? ' is-done' : ''), style: c.colour ? { borderLeftColor: c.colour } : {} }, [
          el('div', { class: 'pp-card__title', text: (c.done ? '✓ ' : '') + c.title }),
          c.fields.length ? el('div', { class: 'pp-card__fields', text: c.fields.map((f) => `${f.label}: ${f.text}`).join(' · ') }) : null,
          c.when || c.people ? el('div', { class: 'pp-card__meta' }, [
            c.when ? el('span', { class: c.late ? 'is-late' : '', text: c.when }) : null,
            c.people ? el('span', { text: c.people }) : null,
          ]) : null,
        ])),
      ])))]),
    ]));
  });
  return root;
}

// ---- booking grid --------------------------------------------------------------------------------------

/**
 * @param s {title, subtitle, paper, resourceHeader, periods: [{label, sub}], free: [n], resources: [{name, tracks,
 *           items: [{first, last, track, label, clash}]}]}
 */
export function renderBookingPrint(s) {
  const page = pageArea(s.paper);
  const nameW = Math.round(42 * MM);
  const pages = periodPages(s.periods.length, page.w - nameW, 24 * MM);
  const root = el('div', { class: 'pp-root' });
  pages.forEach(([a, b], pi) => {
    const n = b - a + 1;
    // the same width on every page, set by the fullest one
    const colW = Math.floor((page.w - nameW) / Math.max(1, pages[0][1] - pages[0][0] + 1));
    const sub = pages.length > 1 ? `${s.subtitle} · ${t('page {n} of {m}', { n: pi + 1, m: pages.length })}` : s.subtitle;
    const sheet = el('table', { class: 'pp-sheet pp-grid' + (pi ? ' pp-break' : ''), style: { width: nameW + n * colW + 'px' } });
    sheet.appendChild(el('colgroup', {}, [el('col', { style: { width: nameW + 'px' } }), ...s.periods.slice(a, b + 1).map(() => el('col', { style: { width: colW + 'px' } }))]));
    sheet.appendChild(el('thead', {}, [
      titleRow({ ...s, subtitle: sub }, n + 1),
      el('tr', { class: 'pp-headrow' }, [
        el('th', { class: 'pp-name pp-name--head', text: s.resourceHeader || '' }),
        ...s.periods.slice(a, b + 1).map((p, i) => el('th', { class: 'pp-period' }, [
          el('span', { class: 'pp-period__label', text: p.label }),
          p.sub ? el('span', { class: 'pp-period__sub', text: p.sub }) : null,
          el('span', { class: 'pp-period__free' + (s.free[a + i] ? '' : ' is-full'), text: s.free[a + i] ? tn(s.free[a + i], '{n} free [one]', '{n} free') : t('full') }),
        ])),
      ]),
    ]));
    const body = el('tbody');
    for (const r of s.resources) {
      const tracks = Math.max(1, r.tracks);
      for (let tr = 0; tr < tracks; tr++) {
        const cells = [];
        if (tr === 0) cells.push(el('td', { class: 'pp-name', rowSpan: tracks }, [el('span', { class: 'pp-name__label', text: r.name }), r.clashes ? el('span', { class: 'pp-name__clash', text: t('{n} double booked', { n: r.clashes }) }) : null]));
        for (let i = a; i <= b;) {
          const it = r.items.find((x) => x.track === tr && x.first <= i && x.last >= i);
          if (it) {
            const span = Math.min(it.last, b) - i + 1;
            cells.push(el('td', { class: 'pp-booked' + (it.clash ? ' is-clash' : ''), colSpan: span }, [
              el('span', { text: it.label }), it.clash ? el('span', { class: 'pp-flag', text: ' · ' + t('double booked') }) : null,
            ]));
            i += span;
          } else {
            const free = !r.items.some((x) => x.first <= i && x.last >= i);
            cells.push(el('td', { class: free ? 'pp-free' : 'pp-empty' }));
            i++;
          }
        }
        body.appendChild(el('tr', { class: 'pp-row' + (tr === tracks - 1 ? ' pp-row--last' : '') }, cells));
      }
    }
    sheet.appendChild(body);
    root.appendChild(sheet);
  });
  return root;
}

/**
 * The workload on paper: a person per row, a period per column, and in each cell the hours asked
 * against the hours there are, "6 over" in words where it is too much. Columns share the pages as in
 * the booking grid; a day with no capacity is grey.
 * @param s {title, subtitle, paper, rowHeader, locale, periods: [{label, sub}],
 *           people: [{name, perWeek (null for "not assigned"), overDays, cells: [{load, cap, over, off}]}]}
 */
export function renderWorkloadPrint(s) {
  const page = pageArea(s.paper);
  const nameW = Math.round(42 * MM);
  const pages = periodPages(s.periods.length, page.w - nameW, 20 * MM);
  const nf = new Intl.NumberFormat(s.locale, { maximumFractionDigits: 1 });
  const h = (x) => nf.format(Math.round(x * 10) / 10);
  const root = el('div', { class: 'pp-root' });
  pages.forEach(([a, b], pi) => {
    const n = b - a + 1;
    const colW = Math.floor((page.w - nameW) / Math.max(1, pages[0][1] - pages[0][0] + 1));
    const sub = pages.length > 1 ? `${s.subtitle} · ${t('page {n} of {m}', { n: pi + 1, m: pages.length })}` : s.subtitle;
    const sheet = el('table', { class: 'pp-sheet pp-grid pp-wl' + (pi ? ' pp-break' : ''), style: { width: nameW + n * colW + 'px' } });
    sheet.appendChild(el('colgroup', {}, [el('col', { style: { width: nameW + 'px' } }), ...s.periods.slice(a, b + 1).map(() => el('col', { style: { width: colW + 'px' } }))]));
    sheet.appendChild(el('thead', {}, [
      titleRow({ ...s, subtitle: sub }, n + 1),
      el('tr', { class: 'pp-headrow' }, [
        el('th', { class: 'pp-name pp-name--head', text: s.rowHeader || '' }),
        ...s.periods.slice(a, b + 1).map((p) => el('th', { class: 'pp-period' }, [
          el('span', { class: 'pp-period__label', text: p.label }), p.sub ? el('span', { class: 'pp-period__sub', text: p.sub }) : null,
        ])),
      ]),
    ]));
    const body = el('tbody');
    for (const p of s.people) {
      const cells = [el('td', { class: 'pp-name' }, [
        el('span', { class: 'pp-name__label', text: p.name }),
        p.overDays ? el('span', { class: 'pp-name__clash', text: tn(p.overDays, '{n} day over capacity', '{n} days over capacity') })
          : p.perWeek != null ? el('span', { class: 'pp-name__sub', text: t('{h} h a week', { h: h(p.perWeek) }) }) : null,
      ])];
      for (const x of p.cells.slice(a, b + 1)) {
        const over = x.cap != null && x.load > x.cap + 0.02;
        if (x.load <= 0.02) { cells.push(el('td', { class: x.off ? 'pp-off' : 'pp-empty' })); continue; }
        // a week can fit in total and still have days that do not, as on screen
        const overDays = !over && x.over > 0;
        cells.push(el('td', { class: 'pp-load' + (over ? ' is-over' : overDays ? ' has-overdays' : '') }, [
          el('span', { text: x.cap == null ? h(x.load) + ' h' : t('{load} of {cap} h', { load: h(x.load), cap: h(x.cap) }) }),
          over ? el('span', { class: 'pp-flag', text: ' · ' + t('{h} over', { h: h(x.load - x.cap) }) }) : overDays ? el('span', { class: 'pp-flag', text: ' · ' + tn(x.over, '{n} day over', '{n} days over') }) : null,
        ]));
      }
      body.appendChild(el('tr', { class: 'pp-row pp-row--last' }, cells));
    }
    sheet.appendChild(body);
    root.appendChild(sheet);
  });
  return root;
}

// ---- calendar ------------------------------------------------------------------------------------------

/**
 * A month or a week: rows of seven days, a bar for each task on the days it covers, as on screen.
 * @param s {title, subtitle, paper, weekdays: [7], weeks: [{days: [{text, outside, off}], tracks, more: [7 texts, '' for none],
 *           segments: [{col0, col1, track, title, colour, done, milestone, fromLeft, toRight}]}]}
 */
export function renderCalendarPrint(s) {
  const page = pageArea(s.paper);
  const bar = Math.round(4.6 * MM);
  const root = el('div', { class: 'pp-root' });
  const sheet = el('div', { class: 'pp-sheet pp-cal', style: { width: page.w + 'px' } }, [
    el('div', { class: 'pp-title' }, [el('span', { class: 'pp-title__main', text: s.title }), el('span', { class: 'pp-title__sub', text: s.subtitle })]),
    el('div', { class: 'pp-cal__weekdays' }, s.weekdays.map((d) => el('span', { text: d }))),
  ]);
  for (const w of s.weeks) {
    const rows = `${Math.round(4.8 * MM)}px repeat(${w.tracks}, ${bar}px) auto`;
    const week = el('div', { class: 'pp-cal__week', style: { gridTemplateRows: rows } });
    w.days.forEach((d, i) => week.appendChild(el('div', { class: 'pp-cal__day' + (d.off ? ' is-off' : '') + (d.outside ? ' is-outside' : ''), style: { gridColumn: String(i + 1) } }, [
      el('span', { class: 'pp-cal__num', text: d.text }),
    ])));
    for (const g of w.segments) {
      week.appendChild(el('div', {
        class: 'pp-cal__chip' + (g.done ? ' is-done' : '') + (g.milestone ? ' is-milestone' : '') + (g.fromLeft ? ' is-from-left' : '') + (g.toRight ? ' is-to-right' : ''),
        style: { gridColumn: `${g.col0 + 1} / ${g.col1 + 2}`, gridRow: String(g.track + 2), ...(g.colour ? { borderLeftColor: g.colour } : {}) },
      }, [el('span', { text: (g.milestone ? '◆ ' : '') + g.title })]));
    }
    w.more.forEach((text, i) => { if (text) week.appendChild(el('div', { class: 'pp-cal__more', style: { gridColumn: String(i + 1), gridRow: String(w.tracks + 2) }, text })); });
    sheet.appendChild(week);
  }
  root.appendChild(sheet);
  return root;
}

/** "Gantt chart · 21 tasks · printed 24 Oct 2026" */
export function subtitleFor(view, count, locale, today) {
  const printed = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(dateFromDay(today));
  return [view, count, t('printed {date}', { date: printed })].filter(Boolean).join(' · ');
}

