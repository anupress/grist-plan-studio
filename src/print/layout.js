// Print geometry, as numbers: the page, the scale that fits the plan across it, and how a plan too
// wide for one page splits into page-wide slices. No DOM, so it is tested in Node
// (tests/print.test.mjs); print/render.js draws what these return.
//
// Pages are landscape with 10 mm margins. CSS pixels are 1/96 inch on paper, so millimetres convert
// exactly: a printout is the same size whatever the screen it was started from.

import { startOfUnit, nextUnit } from '../views/gantt/layout.js';

export const MM = 96 / 25.4;
export const PAPERS = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
};
const MARGIN = 10;

/** The printable area of a landscape page, in CSS pixels. */
export function pageArea(paper = 'A4') {
  const p = PAPERS[paper] || PAPERS.A4;
  return { w: Math.floor((p.w - 2 * MARGIN) * MM), h: Math.floor((p.h - 2 * MARGIN) * MM) };
}

/** The @page rule for a paper. */
export const pageRule = (paper = 'A4') => `@page { size: ${PAPERS[paper] ? paper : 'A4'} landscape; margin: ${MARGIN}mm; }`;

/** The header rows that suit a scale of `px` per day: finer units when there is room for them. */
export function unitsFor(px) {
  if (px >= 16) return { top: 'month', bottom: 'day' };
  if (px >= 2.4) return { top: 'month', bottom: 'week' };
  if (px >= 0.75) return { top: 'year', bottom: 'month' };
  if (px >= 0.22) return { top: 'year', bottom: 'quarter' };
  return { top: null, bottom: 'year' };
}

/**
 * A frame (the shape views/gantt/layout.js uses) that fits `span` into `width` pixels: a day or two
 * of air on either side, snapped to whole weeks so the header starts on a clean edge.
 */
export function fitFrame(span, width, weekStart = 1) {
  const from = startOfUnit(span.from - 1, 'week', weekStart);
  const to = nextUnit(span.to + 1, 'week', weekStart) - 1;
  const px = width / (to - from + 1);
  return { zoom: null, ...unitsFor(px), px, from, to, weekStart, width };
}

/**
 * The page-wide slices of a frame drawn at its own scale (several pages, keeping the zoom). Each
 * slice is whole header units wide, so no week or month is cut in two at a page edge unless a single
 * one is wider than the page.
 * @returns {Array<{from, to}>}  day ranges, inclusive
 */
export function slices(frame, width) {
  const unit = frame.bottom || 'week';
  const out = [];
  let a = frame.from;
  for (let guard = 0; a <= frame.to && guard < 500; guard++) {
    let b = a - 1;
    for (let n = nextUnit(a, unit, frame.weekStart); n - 1 <= frame.to && (n - a) * frame.px <= width; n = nextUnit(n, unit, frame.weekStart)) b = n - 1;
    if (b < a) b = Math.min(frame.to, a + Math.max(1, Math.floor(width / frame.px)) - 1);   // one unit wider than a page
    out.push({ from: a, to: Math.min(b, frame.to) });
    a = b + 1;
  }
  return out;
}

/**
 * Columns of the booking grid per page: no narrower than `min` pixels, shared out evenly, so 18 weeks
 * that need two pages print 9 and 9 rather than 14 and a lonely 4.
 * @returns {Array<[first, last]>}  period indexes, inclusive
 */
export function periodPages(n, width, min) {
  const most = Math.max(1, Math.floor(width / min));
  const per = Math.ceil(n / Math.max(1, Math.ceil(n / most)));
  const out = [];
  for (let i = 0; i < n; i += per) out.push([i, Math.min(n, i + per) - 1]);
  return out;
}

/** Board lanes per page: as many as fit at `min` pixels wide. */
export function lanePages(n, width, min) {
  return periodPages(n, width, min);
}
