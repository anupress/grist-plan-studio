// The booking grid: resources down the side, periods across, bookings as blocks across the cells they
// cover (model/booking.js). Free cells are tinted and counted per period, so the gaps are what the
// eye finds first, as in a spreadsheet of stores × weekends.
//
//   click a free cell        book it (a new row with that resource and period)
//   drag a booking           to another resource or period
//   arrow keys               move cell by cell; Enter books a free cell or edits the booking there
//   double-click             Grist's record card
//
// One scroll container; the period header sticks to the top and the resource names to the left. Only
// the cells in view are drawn, so a year of days for a hundred rooms stays light.

import { el, clear } from '../../core/util.js';
import { formatters, rangeText } from '../gantt/scale.js';
import { dateFromDay } from '../../model/values.js';
import { isoWeek } from '../gantt/layout.js';
import { isFree } from '../../model/booking.js';
import { t, tn } from '../../i18n/index.js';

const HEAD_H = 46;
const TRACK_H = 30;
const ROW_PAD = 8;
const COL_W = { day: 52, week: 104, month: 116, table: 150, column: 150 };
const DRAG_START = 4;
const resWidthFor = (w) => Math.round(Math.max(130, Math.min(220, w * 0.2)));

/**
 * @param on {onSelect(id), onOpen(id), onQuickEdit(id), onMove({id, from, to, first, period}), onBook({resource, period}),
 *            onAnnounce(text) (what the keyboard's cell holds, for a screen reader), onUndo(), onRedo()}
 */
export function createBooking(host, on = {}) {
  const corner = el('div', { class: 'ps-book__corner' });
  const head = el('div', { class: 'ps-book__head' });
  const side = el('div', { class: 'ps-book__side', role: 'list' });
  const body = el('div', { class: 'ps-book__body' });
  const canvas = el('div', { class: 'ps-book__canvas' }, [corner, head, side, body]);
  const scroll = el('div', { class: 'ps-book__scroll', tabindex: '0', role: 'region', 'aria-label': t('Bookings') }, [canvas]);
  const tip = el('div', { class: 'ps-tip', role: 'tooltip', hidden: true });
  const root = el('div', { class: 'ps-book' }, [scroll, tip]);
  clear(host).appendChild(root);

  // {resources, periods, free, unit, mode, today, editable, canBook, selectedId, resourceLabel, noneLabel, locale, labelOf(task)}
  let model = null;
  let TH = TRACK_H;   // this person's track height (model/display.js: comfortable or compact)
  let F = null;
  let colW = 104, resW = 180;
  let tops = [];      // resource i -> its top in the body
  let heights = [];
  let drawn = '';
  let raf = 0;
  let drag = null;
  let swallowUntil = 0;
  let cursor = null;   // {ri, pi}: the keyboard's cell, ringed; Enter books it or edits what is there

  const rowH = (r) => Math.max(1, r.tracks) * TH + ROW_PAD;
  const resName = (r) => (r.none ? model.noneLabel : String(r.label ?? ''));
  const items = () => model.resources.flatMap((r, ri) => r.items.map((it) => ({ r, ri, it }))).sort((a, b) => a.ri - b.ri || a.it.first - b.it.first || a.it.track - b.it.track);
  const findItem = (id, resKey = null) => items().find((x) => x.it.task.id === id && (resKey == null || x.r.key === resKey)) || null;
  const viewW = () => Math.max(0, scroll.clientWidth - resW);

  function size() {
    resW = resWidthFor(scroll.clientWidth || 900);
    // Few columns (four weekends) widen to fill the widget, up to about twice their size.
    const base = COL_W[model.unit] || 120;
    const n = Math.max(1, model.periods.length);
    colW = Math.round(Math.min(base * 2.2, Math.max(base, (Math.max(0, (scroll.clientWidth || 900) - resW) - 2) / n)));
    tops = [];
    heights = [];
    let y = 0;
    for (const r of model.resources) { tops.push(y); heights.push(rowH(r)); y += rowH(r); }
    canvas.style.setProperty('--res-w', resW + 'px');
    canvas.style.setProperty('--grid-w', Math.max(1, model.periods.length) * colW + 'px');
    canvas.style.setProperty('--head-h', HEAD_H + 'px');
    canvas.style.setProperty('--body-h', Math.max(TH, y) + 'px');
    canvas.style.setProperty('--col-w', colW + 'px');
  }

  // ---- labels -------------------------------------------------------------------------------------------
  function periodLabel(p, i) {
    if (model.unit === 'table' || model.unit === 'column') return [p.label || shortRange(p), p.label && p.start != null ? shortRange(p) : null];
    const d = dateFromDay(p.start);
    if (model.unit === 'day') return [F.weekdayDay.format(d) + (i === 0 || d.getUTCDate() === 1 ? ' · ' + F.monthShort.format(d) : ''), null];
    // numbered by its middle day: a week from Sunday 25 Oct is mostly ISO week 44, not 43
    if (model.unit === 'week') return [t('W{n}', { n: isoWeek(p.start + 3).week }) + ' · ' + F.dayMonth.format(d), null];
    return [F.monthYearShort.format(d), null];
  }
  /** "6–21 Oct", with the year only when it is not this one */
  const shortRange = (s) => {
    const y = new Date().getUTCFullYear();
    const sameYear = dateFromDay(s.start).getUTCFullYear() === y && dateFromDay(s.end).getUTCFullYear() === y;
    if (!sameYear) return rangeText(F, s);
    return s.start === s.end ? F.dayMonth.format(dateFromDay(s.start)) : `${F.dayMonth.format(dateFromDay(s.start))} – ${F.dayMonth.format(dateFromDay(s.end))}`;
  };
  const isToday = (p) => p.start != null && model.today >= p.start && model.today <= p.end;

  // ---- drawing --------------------------------------------------------------------------------------------
  function drawHead(c0, c1) {
    clear(head);
    for (let i = c0; i <= c1; i++) {
      const p = model.periods[i];
      const [label, sub] = periodLabel(p, i);
      const free = model.free[i];
      head.appendChild(el('div', {
        class: 'ps-book__col' + (isToday(p) ? ' is-today' : '') + (model.unit === 'day' && dateFromDay(p.start).getUTCDate() === 1 ? ' is-month' : ''),
        style: { left: i * colW + 'px', width: colW + 'px' }, title: p.start != null ? rangeText(F, p) : label,
      }, [
        el('span', { class: 'ps-book__label', text: label, title: sub || null }),
        el('span', { class: 'ps-book__free' + (free ? '' : ' is-full'), text: free ? tn(free, '{n} free [one]', '{n} free') : t('full') }),
      ]));
    }
  }

  function drawSide(r0, r1) {
    clear(side);
    for (let ri = r0; ri <= r1; ri++) {
      const r = model.resources[ri];
      const clashes = r.items.filter((it) => it.clash).length;
      side.appendChild(el('div', {
        class: 'ps-book__res' + (r.none ? ' is-none' : '') + (drag?.to?.key === r.key && drag.to.key !== drag.r.key ? ' is-drop' : ''),
        role: 'listitem', style: { top: tops[ri] + 'px', height: heights[ri] + 'px', '--lane': r.colour || 'transparent' },
      }, [
        el('span', { class: 'ps-book__resname', text: resName(r), title: resName(r) }),
        clashes ? el('span', { class: 'ps-book__clash', text: tn(clashes, '{n} double booked', '{n} double booked') }) : null,
      ]));
    }
  }

  function drawBody(r0, r1, c0, c1) {
    clear(body);
    if (cursor && cursor.ri >= r0 && cursor.ri <= r1 && cursor.pi >= c0 && cursor.pi <= c1) {
      body.appendChild(el('div', { class: 'ps-book__cursor', 'aria-hidden': 'true', style: { left: cursor.pi * colW + 'px', top: tops[cursor.ri] + 'px', width: colW + 'px', height: heights[cursor.ri] + 'px' } }));
    }
    const today = model.periods.findIndex(isToday);
    if (today >= 0) body.appendChild(el('div', { class: 'ps-book__todaycol', style: { left: today * colW + 'px', width: colW + 'px' } }));
    for (let ri = r0; ri <= r1; ri++) {
      const r = model.resources[ri];
      body.appendChild(el('div', { class: 'ps-book__row' + (ri % 2 ? ' is-alt' : ''), style: { top: tops[ri] + 'px', height: heights[ri] + 'px' } }));
      if (!r.none) {
        for (let i = c0; i <= c1; i++) {
          if (!isFree(r, i)) continue;
          body.appendChild(el('div', {
            class: 'ps-book__cell' + (model.canBook ? ' can-book' : ''), dataset: { res: String(ri), period: String(i) },
            style: { left: i * colW + 'px', top: tops[ri] + 'px', width: colW + 'px', height: heights[ri] + 'px' },
            title: model.canBook ? t('Free. Click to book {res} for {period}.', { res: resName(r), period: periodLabel(model.periods[i], i)[0] }) : t('Free'),
          }, model.canBook ? [el('span', { class: 'ps-book__plus', text: t('Book') })] : []));
        }
      }
      for (const it of r.items) {
        if (it.last < c0 || it.first > c1) continue;
        const task = it.task;
        const x = it.first * colW + 3, w = (it.last - it.first + 1) * colW - 6;
        const label = model.labelOf(task) || t('(no name)');
        const dates = model.mode === 'dates' && task.start != null ? shortRange(task) : null;
        // a booking that starts left of the view keeps its name in view
        // (only one cut by the edge, and never by more than leaves room for a few letters: padding wider than
        // the block would stretch it back into view)
        const sl = scroll.scrollLeft;
        const inset = x < sl && x + w > sl ? Math.max(0, Math.min(sl - x, w - 70)) : 0;
        body.appendChild(el('div', {
          class: 'ps-blk' + (task.id === model.selectedId ? ' is-selected' : '') + (it.clash ? ' is-clash' : '') + (task.colour ? ' has-stripe' : '') + (model.editable ? ' can-move' : ''),
          dataset: { id: String(task.id), res: String(ri) },
          style: { left: x + 'px', top: tops[ri] + ROW_PAD / 2 + it.track * TH + 'px', width: w + 'px', height: TH - 4 + 'px', '--stripe': task.colour || 'transparent', paddingLeft: inset ? inset + 11 + 'px' : null },
          role: 'img', 'aria-label': [label, resName(r), dates, it.clash ? t('double booked') : null].filter(Boolean).join(', '),
        }, [
          el('span', { class: 'ps-blk__label', text: label }),
          dates && w - inset > 200 ? el('span', { class: 'ps-blk__dates', text: dates }) : null,
          it.clash ? el('span', { class: 'ps-blk__flag', text: w - inset > 190 ? t('double booked') : '!', title: t('double booked') }) : null,
        ]));
      }
    }
  }

  function windowOf() {
    const y0 = scroll.scrollTop - 200, y1 = scroll.scrollTop + scroll.clientHeight + 200;
    let r0 = 0, r1 = model.resources.length - 1;
    while (r0 < r1 && tops[r0] + heights[r0] < y0) r0++;
    while (r1 > r0 && tops[r1] > y1) r1--;
    const c0 = Math.max(0, Math.floor(scroll.scrollLeft / colW) - 1);
    const c1 = Math.min(model.periods.length - 1, Math.ceil((scroll.scrollLeft + viewW()) / colW) + 3);
    return { r0, r1, c0, c1 };
  }

  function draw(force = false) {
    if (!model || drag) return;
    if (!model.periods.length || !model.resources.length) { clear(head); clear(side); clear(body); return; }
    const { r0, r1, c0, c1 } = windowOf();
    const key = `${r0}:${r1}:${c0}:${c1}`;
    if (!force && key === drawn) return;
    drawn = key;
    drawHead(c0, c1);
    drawSide(r0, r1);
    drawBody(r0, r1, c0, c1);
  }

  // ---- tooltip ---------------------------------------------------------------------------------------------
  function placeTip(x, y) {
    const r = root.getBoundingClientRect();
    tip.style.left = Math.min(r.width - tip.offsetWidth - 8, Math.max(8, x - r.left + 12)) + 'px';
    tip.style.top = (y - r.top + 18 + tip.offsetHeight > r.height ? y - r.top - tip.offsetHeight - 10 : y - r.top + 18) + 'px';
  }
  function showTip(f, x, y) {
    const task = f.it.task;
    const lines = [el('strong', { text: model.labelOf(task) || t('(no name)') }), el('div', { text: resName(f.r) })];
    if (task.start != null) lines.push(el('div', { text: rangeText(F, task) }));
    if (model.mode === 'column') lines.push(el('div', { text: model.periods[f.it.first].label }));
    if (task.status) lines.push(el('div', { text: task.status }));
    if (f.it.clash) lines.push(el('div', { class: 'ps-tip__warn', text: t('Double booked: another booking of {res} overlaps it.', { res: resName(f.r) }) }));
    tip.classList.remove('ps-tip--drag');
    clear(tip).append(...lines);
    tip.hidden = false;
    placeTip(x, y);
  }
  const hideTip = () => { tip.hidden = true; };

  // ---- dragging ---------------------------------------------------------------------------------------------
  const bodyXY = (e) => { const b = body.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const resAt = (y) => { for (let i = 0; i < tops.length; i++) if (y >= tops[i] && y < tops[i] + heights[i]) return i; return y < 0 ? 0 : tops.length - 1; };

  body.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !model?.editable) return;
    const n = e.target.closest && e.target.closest('.ps-blk');
    if (!n) return;
    const f = findItem(Number(n.dataset.id), model.resources[Number(n.dataset.res)]?.key);
    if (!f) return;
    e.preventDefault();
    scroll.focus({ preventScroll: true });
    const [x] = bodyXY(e);
    drag = { ...f, el: n, x0: e.clientX, y0: e.clientY, moved: false, pointerId: e.pointerId, grab: Math.floor(x / colW) - f.it.first, period: f.it.first, to: f.r, ghost: null };
  });
  body.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < DRAG_START && Math.abs(e.clientY - d.y0) < DRAG_START) return;
    if (!d.moved) {
      d.moved = true;
      root.classList.add('is-dragging');
      try { body.setPointerCapture(d.pointerId); } catch { /* fine */ }
      d.ghost = el('div', { class: 'ps-blk ps-blk--ghost' });
      body.appendChild(d.ghost);
      d.el.classList.add('is-lifted');
    }
    const r = scroll.getBoundingClientRect();
    if (e.clientX > r.right - 30) scroll.scrollLeft += 14; else if (e.clientX < r.left + resW + 30) scroll.scrollLeft -= 14;
    if (e.clientY > r.bottom - 24) scroll.scrollTop += 12; else if (e.clientY < r.top + HEAD_H + 24) scroll.scrollTop -= 12;
    const [x, y] = bodyXY(e);
    const span = d.it.last - d.it.first;
    d.period = Math.max(0, Math.min(model.periods.length - 1 - span, Math.floor(x / colW) - d.grab));
    const ri = resAt(y);
    d.to = model.resources[ri];
    Object.assign(d.ghost.style, { left: d.period * colW + 3 + 'px', width: (span + 1) * colW - 6 + 'px', top: tops[ri] + ROW_PAD / 2 + 'px', height: heights[ri] - ROW_PAD + 'px' });
    const where = (model.mode === 'column' ? model.periods[d.period].label : rangeText(F, model.periods[d.period]));
    tip.classList.add('ps-tip--drag');
    clear(tip).append(el('strong', { text: `${resName(d.to)} · ${where}` }));
    tip.hidden = false;
    placeTip(e.clientX, e.clientY);
  });
  const finish = (cancelled) => {
    const d = drag;
    drag = null;
    try { body.releasePointerCapture(d.pointerId); } catch { /* fine */ }
    root.classList.remove('is-dragging');
    d.ghost?.remove();
    d.el.classList.remove('is-lifted');
    hideTip();
    if (!d.moved) return;
    swallowUntil = performance.now() + 300;
    if (!cancelled && (d.to.key !== d.r.key || d.period !== d.it.first)) {
      on.onMove?.({ id: d.it.task.id, from: d.r.key, to: d.to.key, first: d.it.first, period: d.period });
    }
    draw(true);
  };
  body.addEventListener('pointerup', () => { if (drag) finish(false); });
  body.addEventListener('pointercancel', () => { if (drag) finish(true); });

  // ---- other events ----------------------------------------------------------------------------------------
  scroll.addEventListener('scroll', () => { if (!drag) hideTip(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });
  body.addEventListener('click', (e) => {
    if (performance.now() < swallowUntil || !model) return;
    const n = e.target.closest && e.target.closest('.ps-blk[data-id]');
    if (n) {
      const f = findItem(Number(n.dataset.id), model.resources[Number(n.dataset.res)]?.key);
      if (f) cursor = { ri: f.ri, pi: f.it.first };
      on.onSelect?.(Number(n.dataset.id));
      return;
    }
    const cell = e.target.closest && e.target.closest('.ps-book__cell.can-book');
    if (cell) cursor = { ri: Number(cell.dataset.res), pi: Number(cell.dataset.period) };
    if (cell) on.onBook?.({ resource: model.resources[Number(cell.dataset.res)].key, period: Number(cell.dataset.period) });
  });
  body.addEventListener('dblclick', (e) => { const n = e.target.closest && e.target.closest('.ps-blk[data-id]'); if (n) on.onOpen?.(Number(n.dataset.id)); });
  body.addEventListener('mousemove', (e) => {
    if (drag || !model) return;
    const n = e.target.closest && e.target.closest('.ps-blk[data-id]');
    const f = n ? findItem(Number(n.dataset.id), model.resources[Number(n.dataset.res)]?.key) : null;
    if (f) showTip(f, e.clientX, e.clientY); else hideTip();
  });
  body.addEventListener('mouseleave', () => { if (!drag) hideTip(); });

  scroll.addEventListener('keydown', (e) => {
    if (!model) return;
    if (drag) { if (e.key === 'Escape') { e.preventDefault(); finish(true); } return; }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); (e.shiftKey ? on.onRedo : on.onUndo)?.(); return; }
    if (mod && key === 'y') { e.preventDefault(); on.onRedo?.(); return; }
    if (mod || e.altKey || !model.resources.length || !model.periods.length) return;
    // The keyboard moves a cell cursor, as in a spreadsheet: it starts on the selected booking, or on today.
    const R = model.resources.length, P = model.periods.length;
    if (!cursor) {
      const f = model.selectedId != null ? findItem(model.selectedId) : null;
      cursor = f ? { ri: f.ri, pi: f.it.first } : { ri: 0, pi: Math.max(0, model.periods.findIndex(isToday)) };
    }
    const at = () => model.resources[cursor.ri].items.filter((it) => it.first <= cursor.pi && it.last >= cursor.pi);
    const move = (dr, dp) => {
      e.preventDefault();
      cursor = { ri: Math.max(0, Math.min(R - 1, cursor.ri + dr)), pi: Math.max(0, Math.min(P - 1, cursor.pi + dp)) };
      const here = at();
      revealCell(cursor);
      if (here.length) on.onSelect?.(here[0].task.id);
      else { drawn = ''; draw(true); }
      const r = model.resources[cursor.ri];
      on.onAnnounce?.(`${resName(r)}, ${periodLabel(model.periods[cursor.pi], cursor.pi)[0]}: ` + (here.length ? here.map((it) => model.labelOf(it.task) || t('(no name)')).join(', ') : t('Free')));
    };
    if (e.key === 'ArrowRight') move(0, 1);
    else if (e.key === 'ArrowLeft') move(0, -1);
    else if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'Home') move(0, -P);
    else if (e.key === 'End') move(0, P);
    else if (e.key === 'Enter') {
      e.preventDefault();
      const here = at();
      const r = model.resources[cursor.ri];
      if (here.length) on.onQuickEdit?.(here[0].task.id);
      else if (model.canBook && !r.none) on.onBook?.({ resource: r.key, period: cursor.pi });
    }
  });
  /** Scroll a cell into view (the cursor's). */
  function revealCell(c) {
    const top = tops[c.ri], h = heights[c.ri], viewH = scroll.clientHeight - HEAD_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top; else if (top + h > scroll.scrollTop + viewH) scroll.scrollTop = top + h - viewH;
    const x = c.pi * colW;
    if (x < scroll.scrollLeft) scroll.scrollLeft = x; else if (x + colW > scroll.scrollLeft + viewW()) scroll.scrollLeft = x + colW - viewW();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (model) { size(); draw(true); } }) : null;
  ro?.observe(scroll);

  // ---- API ---------------------------------------------------------------------------------------------------
  function scrollToPeriod(i) { if (i >= 0) scroll.scrollLeft = Math.max(0, i * colW - colW); }
  function reveal(id) {
    const f = model && findItem(id);
    if (!f) return;
    const top = tops[f.ri], h = heights[f.ri], viewH = scroll.clientHeight - HEAD_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top; else if (top + h > scroll.scrollTop + viewH) scroll.scrollTop = top + h - viewH;
    const x = f.it.first * colW, xe = (f.it.last + 1) * colW;
    if (x < scroll.scrollLeft || xe > scroll.scrollLeft + viewW()) scrollToPeriod(f.it.first);
  }
  function update(next, { first = false, startAt = null } = {}) {
    if (drag) finish(true);
    if (cursor && (cursor.ri >= next.resources.length || cursor.pi >= next.periods.length)) cursor = null;
    model = next;
    TH = next.trackH || TRACK_H;
    F = formatters(next.locale);
    corner.textContent = next.resourceLabel || '';
    root.classList.toggle('is-editable', !!next.editable);
    size();
    if (first) scrollToPeriod(startAt ?? next.periods.findIndex(isToday));
    drawn = '';
    draw(true);
  }

  return {
    update,
    reveal,
    scrollToToday: () => model && scrollToPeriod(model.periods.findIndex(isToday)),
    focus: () => scroll.focus({ preventScroll: true }),
    destroy: () => { ro?.disconnect(); clear(host); },
  };
}
