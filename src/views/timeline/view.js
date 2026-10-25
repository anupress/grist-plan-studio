// The timeline: the Gantt chart's calendar with one band per person, room or project. Bars that
// overlap in a band stack in tracks (model/timeline.js), so a busy week reads as a taller band.
//
//   drag a bar            move it in time, or down into another band (writes that column)
//   drag its edges        change the start or the end
//   click / ↑ ↓           select (Grist's cursor follows)      Enter    quick edit
//   Alt+←/→               a day earlier or later               double-click   Grist's record card
//
// It shares the Gantt chart's layout (layout.js), header and shading (scale.js) and its CSS, so the
// two views line up day for day when someone switches between them.

import { el, clear } from '../../core/util.js';
import { onColor } from '../../core/theme/apply.js';
import { makeFrame, barBox, rowWindow, scrollLeftFor, xOf, dayAt, ROW_H, BAR_H } from '../gantt/layout.js';
import { createNavigation, clampNames } from '../gantt/navigate.js';
import { formatters, rangeText, drawScale, drawShade } from '../gantt/scale.js';
import { laneAtTrack } from '../../model/timeline.js';
import { t, tn } from '../../i18n/index.js';

const HEAD_H = 52;
const listWidthFor = (w) => Math.round(Math.max(140, Math.min(240, w * 0.22)));
const DRAG_START = 3;
const NO_CAPS = { move: false, start: false, end: false, draw: false };

/**
 * @param on {onSelect(id), onOpen(id), onQuickEdit(id), onEdit({id, mode, start, end, from, to}), onUndo(), onRedo()}
 *   from, to: the keys of the lane the bar was dragged out of and into (equal when it stayed)
 */
export function createTimeline(host, on = {}) {
  const scaleTop = el('div', { class: 'ps-scale__row ps-scale__row--top' });
  const scaleBottom = el('div', { class: 'ps-scale__row ps-scale__row--bottom' });
  const corner = el('div', { class: 'ps-gantt__corner' });
  const scale = el('div', { class: 'ps-gantt__scale', 'aria-hidden': 'true' }, [scaleTop, scaleBottom]);
  const list = el('div', { class: 'ps-gantt__list ps-tl__list', role: 'list' });
  const bands = el('div', { class: 'ps-tl__bands', 'aria-hidden': 'true' });
  const shade = el('div', { class: 'ps-chart__shade', 'aria-hidden': 'true' });
  const bars = el('div', { class: 'ps-chart__bars' });
  const todayLine = el('div', { class: 'ps-chart__today', 'aria-hidden': 'true' });
  const chart = el('div', { class: 'ps-gantt__chart ps-tl__chart' }, [bands, shade, todayLine, bars]);
  const canvas = el('div', { class: 'ps-gantt__canvas' }, [corner, scale, list, chart]);
  const scroll = el('div', { class: 'ps-gantt__scroll', tabindex: '0', role: 'region', 'aria-label': t('Timeline') }, [canvas]);
  const tip = el('div', { class: 'ps-tip', role: 'tooltip', hidden: true });
  const root = el('div', { class: 'ps-gantt ps-tl' }, [scroll, tip]);
  clear(host).appendChild(root);
  const nav = createNavigation({
    scroll, chart, root, getFrame: () => frame, getNamesW: () => listW,
    setNamesLive: (w) => { listW = w; canvas.style.setProperty('--list-w', w + 'px'); nav.splitter.setAttribute('aria-valuenow', String(w)); drawn = ''; draw(true); },
    onZoomStep: (d) => on.onZoomStep?.(d), onNamesWidth: (w) => on.onLaneWidth?.(w),
  });

  // {lanes, tracks, span, holidays, caps(task), length(a, b), workdays, editable, laneMovable, today,
  //  zoom, weekStart, locale, selectedId, laneLabel, noneLabel}
  let model = null;
  let frame = null;
  let F = null;
  let drawn = '';
  let raf = 0;
  let listW = 200;
  let drag = null;
  let swallowUntil = 0;
  const caps = (task) => (model?.caps ? model.caps(task) : NO_CAPS);
  const chartViewW = () => Math.max(0, scroll.clientWidth - listW);
  const centreDay = () => (frame ? dayAt(frame, scroll.scrollLeft + chartViewW() / 2) : null);
  const laneName = (lane) => (lane.none ? model.noneLabel : String(lane.label ?? ''));
  /** every bar in reading order: band by band, then by start */
  const order = () => model.lanes.flatMap((l) => l.bars.map((b) => ({ lane: l, bar: b })));
  const findBar = (id, laneKey) => {
    for (const lane of model.lanes) {
      if (laneKey != null && lane.key !== laneKey) continue;
      const bar = lane.bars.find((b) => b.task.id === id);
      if (bar) return { lane, bar };
    }
    return null;
  };

  let RH = ROW_H, BH = BAR_H;   // this person's row and bar heights (model/display.js)
  function size() {
    listW = model?.laneW ? clampNames(model.laneW, scroll.clientWidth || 900) : listWidthFor(scroll.clientWidth || 900);
    canvas.style.setProperty('--list-w', listW + 'px');
    nav.splitter.setAttribute('aria-valuenow', String(listW));
    canvas.style.setProperty('--chart-w', frame.width + 'px');
    canvas.style.setProperty('--head-h', HEAD_H + 'px');
    canvas.style.setProperty('--body-h', Math.max(1, model.tracks) * RH + 'px');
    canvas.style.setProperty('--row-h', RH + 'px');
    canvas.style.setProperty('--bar-h', BH + 'px');
  }

  // ---- drawing ------------------------------------------------------------------------------------------
  const labelFits = (title, w) => w >= Math.min(title.length, 60) * 7 + 16;

  function drawLanes(firstTrack, lastTrack) {
    clear(list);
    clear(bands);
    model.lanes.forEach((lane, i) => {
      const top = lane.offset * RH, h = lane.tracks * RH;
      if (lane.offset + lane.tracks <= firstTrack || lane.offset > lastTrack) return;
      const clashes = lane.bars.filter((b) => b.clash).length;
      const name = laneName(lane);
      list.appendChild(el('div', {
        class: 'ps-tlane' + (lane.none ? ' is-none' : '') + (drag?.toKey === lane.key && drag.toKey !== drag.fromKey ? ' is-drop' : ''),
        role: 'listitem', dataset: { lane: lane.key }, style: { top: top + 'px', height: h + 'px', '--lane': lane.colour || 'transparent' },
        'aria-label': `${name}, ${tn(lane.bars.length, '{n} task', '{n} tasks')}`,
      }, [
        el('span', { class: 'ps-tlane__name', text: name, title: name }),
        el('span', { class: 'ps-tlane__count', text: String(lane.bars.length) }),
        clashes ? el('span', { class: 'ps-tlane__clash', text: tn(clashes, '{n} overlapping', '{n} overlapping') }) : null,
      ]));
      bands.appendChild(el('div', { class: 'ps-tl__band' + (i % 2 ? ' is-alt' : ''), style: { top: top + 'px', height: h + 'px' } }));
    });
  }

  function drawBars(firstTrack, lastTrack, x0, x1) {
    clear(bars);
    const sel = model.selectedId;
    for (const lane of model.lanes) {
      if (lane.offset + lane.tracks <= firstTrack || lane.offset > lastTrack) continue;
      // per track, where the next bar starts, so a label outside a bar never runs into the next one
      const nextStart = new Map();
      const byTrack = new Map();
      for (const b of lane.bars) { if (!byTrack.has(b.track)) byTrack.set(b.track, []); byTrack.get(b.track).push(b); }
      for (const list of byTrack.values()) list.forEach((b, i) => nextStart.set(b, list[i + 1] ? xOf(frame, list[i + 1].task.start) : Infinity));
      for (const b of lane.bars) {
        // only the rows on screen: a person's band can be a hundred rows deep
        if (lane.offset + b.track < firstTrack || lane.offset + b.track > lastTrack) continue;
        const task = b.task;
        const box = barBox(frame, { kind: task.kind === 'milestone' ? 'milestone' : 'bar', start: task.start, end: task.end }, lane.offset + b.track, RH, BH);
        if (box.x > x1 || box.x + box.w < x0) continue;
        const title = task.title || t('(no name)');
        const c = caps(task);
        const fill = task.colour || 'var(--ps-bar)';
        const selected = task.id === sel || !!model.multi?.has(task.id);
        const attrs = { dataset: { id: String(task.id), lane: lane.key, part: 'body' }, role: 'img', 'aria-label': `${title}, ${rangeText(F, task)}${b.clash ? ', ' + t('overlaps another booking') : ''}` };
        if (task.kind === 'milestone') {
          bars.appendChild(el('div', {
            class: 'ps-ms' + (selected ? ' is-selected' : '') + (c.move ? ' can-move' : '') + (b.clash ? ' is-clash' : ''),
            ...attrs, style: { left: box.x + 'px', top: box.y + 'px', '--fill': fill },
          }));
          continue;
        }
        const labels = model.labels || 'auto';
        const inside = labels === 'auto' && labelFits(title, box.w);
        bars.appendChild(el('div', {
          class: 'ps-bar' + (selected ? ' is-selected' : '') + (task.blocked ? ' is-blocked' : '') + (c.move ? ' can-move' : '') + (b.clash ? ' is-clash' : ''),
          ...attrs, style: { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', '--fill': fill, '--ink': task.colour ? onColor(task.colour) : 'var(--ps-bar-ink)' },
        }, [
          task.progress != null && task.progress > 0 ? el('span', { class: 'ps-bar__progress', style: { width: Math.round(task.progress * 100) + '%' } }) : null,
          inside ? el('span', { class: 'ps-bar__label', text: title }) : null,
          c.start ? el('span', { class: 'ps-bar__h ps-bar__h--l', dataset: { part: 'start' } }) : null,
          c.end ? el('span', { class: 'ps-bar__h ps-bar__h--r', dataset: { part: 'end' } }) : null,
        ]));
        const room = nextStart.get(b) - (box.x + box.w) - 12;
        if (!inside && labels !== 'off' && room > 40) {
          bars.appendChild(el('span', { class: 'ps-bar__out', dataset: { id: String(task.id), lane: lane.key }, style: { left: box.x + box.w + 6 + 'px', top: box.y + 'px', maxWidth: Math.min(320, room) + 'px' }, text: title }));
        }
      }
    }
  }

  function draw(force = false) {
    if (!model || !frame || drag) return;
    const x0 = Math.max(0, scroll.scrollLeft - 200);
    const x1 = scroll.scrollLeft + chartViewW() + 200;
    const { first, last } = rowWindow(scroll.scrollTop, scroll.clientHeight - HEAD_H, model.tracks, 8, RH);
    const key = `${first}:${last}:${Math.floor(x0 / 400)}`;
    if (!force && key === drawn) return;
    drawn = key;
    drawScale({ frame, top: scaleTop, bottom: scaleBottom, F, today: model.today, holidays: model.holidays, x0: x0 - 400, x1: x1 + 400, show: model.show });
    drawShade({ frame, shade, todayLine, holidays: model.holidays, today: model.today, x0: x0 - 400, x1: x1 + 400, show: model.show });
    drawLanes(first, last);
    drawBars(first, last, x0 - 400, x1 + 400);
  }

  // ---- tooltip --------------------------------------------------------------------------------------
  function placeTip(x, y) {
    const r = root.getBoundingClientRect();
    tip.style.left = Math.min(r.width - tip.offsetWidth - 8, Math.max(8, x - r.left + 12)) + 'px';
    tip.style.top = (y - r.top + 18 + tip.offsetHeight > r.height ? y - r.top - tip.offsetHeight - 10 : y - r.top + 18) + 'px';
  }
  function showTip(found, x, y) {
    const { lane, bar } = found;
    const task = bar.task;
    const len = model.length ? model.length(task.start, task.end) : task.end - task.start + 1;
    const lines = [
      el('strong', { text: task.title || t('(no name)') }),
      el('div', { text: rangeText(F, task) + (task.start !== task.end ? ' · ' + (model.workdays ? t('{n} working days', { n: len }) : t('{n} days', { n: len })) : '') }),
      el('div', { text: laneName(lane) }),
    ];
    if (task.status) lines.push(el('div', { text: task.status }));
    if (bar.clash) lines.push(el('div', { class: 'ps-tip__warn', text: t('Overlaps another booking of {lane}.', { lane: laneName(lane) }) }));
    tip.classList.remove('ps-tip--drag');
    clear(tip).append(...lines);
    tip.hidden = false;
    placeTip(x, y);
  }
  const hideTip = () => { tip.hidden = true; };

  // ---- dragging -----------------------------------------------------------------------------------------
  const chartX = (clientX) => clientX - chart.getBoundingClientRect().left;
  const chartY = (clientY) => clientY - chart.getBoundingClientRect().top;

  function preview(d) {
    const { task } = d.bar;
    const target = model.lanes.find((l) => l.key === d.toKey) || d.lane;
    const track = target === d.lane ? d.bar.track : 0;
    const box = barBox(frame, { kind: task.kind === 'milestone' ? 'milestone' : 'bar', start: d.start, end: d.end }, target.offset + track);
    d.el.style.left = box.x + 'px';
    d.el.style.top = box.y + 'px';
    if (task.kind !== 'milestone') d.el.style.width = box.w + 'px';
    for (const n of list.querySelectorAll('.ps-tlane')) n.classList.toggle('is-drop', n.dataset.lane === d.toKey && d.toKey !== d.fromKey);
    const shift = d.start - task.start;
    const parts = [rangeText(F, { start: d.start, end: d.end })];
    if (d.mode === 'move' && shift) parts.push((shift > 0 ? '+' : '−') + t('{n} days', { n: Math.abs(shift) }));
    if (d.toKey !== d.fromKey) parts.push('→ ' + laneName(target));
    tip.classList.add('ps-tip--drag');
    clear(tip).append(el('strong', { text: parts.join(' · ') }));
    tip.hidden = false;
  }

  chart.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !model?.editable) return;
    const n = e.target.closest && e.target.closest('.ps-bar[data-id], .ps-ms[data-id]');
    if (!n) return;
    const found = findBar(Number(n.dataset.id), n.dataset.lane);
    if (!found) return;
    const c = caps(found.bar.task);
    const part = e.target.dataset.part || 'body';
    const mode = part === 'start' && c.start ? 'start' : part === 'end' && c.end ? 'end' : part === 'body' && (c.move || model.laneMovable) ? 'move' : null;
    if (!mode) return;
    e.preventDefault();
    scroll.focus({ preventScroll: true });
    drag = {
      ...found, el: n, mode, x0: e.clientX, y0: e.clientY, scroll0: scroll.scrollLeft, moved: false, pointerId: e.pointerId,
      start: found.bar.task.start, end: found.bar.task.end, fromKey: found.lane.key, toKey: found.lane.key, canMove: c.move,
    };
  });
  chart.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < DRAG_START && Math.abs(e.clientY - d.y0) < DRAG_START) return;
    if (!d.moved) { d.moved = true; root.classList.add('is-dragging'); try { chart.setPointerCapture(d.pointerId); } catch { /* fine */ } }
    const r = scroll.getBoundingClientRect();
    if (e.clientX > r.right - 30) scroll.scrollLeft += 12; else if (e.clientX < r.left + listW + 30) scroll.scrollLeft -= 12;
    if (e.clientY > r.bottom - 24) scroll.scrollTop += 10; else if (e.clientY < r.top + HEAD_H + 24) scroll.scrollTop -= 10;
    const delta = Math.round((e.clientX - d.x0 + scroll.scrollLeft - d.scroll0) / frame.px);
    const task = d.bar.task;
    if (d.mode === 'move') {
      if (d.canMove) { d.start = task.start + delta; d.end = task.end + delta; }
      if (model.laneMovable) d.toKey = laneAtTrack(model, Math.floor(chartY(e.clientY) / RH))?.key ?? d.toKey;
    } else if (d.mode === 'start') d.start = Math.min(task.end, task.start + delta);
    else d.end = Math.max(task.start, task.end + delta);
    preview(d);
    placeTip(e.clientX, e.clientY);
  });
  const finish = (cancelled) => {
    const d = drag;
    drag = null;
    try { chart.releasePointerCapture(d.pointerId); } catch { /* fine */ }
    root.classList.remove('is-dragging');
    hideTip();
    if (!d.moved) return;
    swallowUntil = performance.now() + 300;
    const task = d.bar.task;
    const changed = d.start !== task.start || d.end !== task.end || d.toKey !== d.fromKey;
    if (!cancelled && changed) on.onEdit?.({ id: task.id, mode: d.mode, start: d.start, end: d.end, from: d.fromKey, to: d.toKey });
    draw(true);
  };
  chart.addEventListener('pointerup', () => { if (drag) finish(false); });
  chart.addEventListener('pointercancel', () => { if (drag) finish(true); });

  // ---- other events -------------------------------------------------------------------------------------
  const barFrom = (target) => {
    const n = target.closest && target.closest('[data-id][data-lane]');
    return n && model ? findBar(Number(n.dataset.id), n.dataset.lane) : null;
  };
  scroll.addEventListener('scroll', () => { if (!drag) hideTip(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });
  canvas.addEventListener('click', (e) => {
    if (performance.now() < swallowUntil) return;
    const f = barFrom(e.target);
    if (f) on.onSelect?.(f.bar.task.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  });
  canvas.addEventListener('dblclick', (e) => { const f = barFrom(e.target); if (f) on.onOpen?.(f.bar.task.id); });
  canvas.addEventListener('mousemove', (e) => {
    if (drag) return;
    const f = e.target.closest && e.target.closest('.ps-bar, .ps-ms, .ps-bar__out') ? barFrom(e.target) : null;
    if (f) showTip(f, e.clientX, e.clientY); else hideTip();
  });
  canvas.addEventListener('mouseleave', () => { if (!drag) hideTip(); });

  scroll.addEventListener('keydown', (e) => {
    if (!model) return;
    if (drag) { if (e.key === 'Escape') { e.preventDefault(); finish(true); } return; }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); (e.shiftKey ? on.onRedo : on.onUndo)?.(); return; }
    if (mod && key === 'y') { e.preventDefault(); on.onRedo?.(); return; }
    if (mod) return;
    const all = order();
    const cur = all.findIndex((x) => x.bar.task.id === model.selectedId);
    const sel = cur >= 0 ? all[cur] : null;
    if (e.altKey && sel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const task = sel.bar.task;
      const step = e.key === 'ArrowRight' ? 1 : -1;
      if (caps(task).move) on.onEdit?.({ id: task.id, mode: 'move', start: task.start + step, end: task.end + step, from: sel.lane.key, to: sel.lane.key });
      return;
    }
    if (e.altKey) return;
    const go = (j) => { if (all.length) { e.preventDefault(); on.onSelect?.(all[Math.max(0, Math.min(all.length - 1, j))].bar.task.id); } };
    if (e.key === 'ArrowDown') go(cur + 1);
    else if (e.key === 'ArrowUp') go(cur < 0 ? 0 : cur - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Enter' && sel) { e.preventDefault(); on.onQuickEdit?.(sel.bar.task.id); }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (model && frame) { size(); draw(true); } }) : null;
  ro?.observe(scroll);

  // ---- API ------------------------------------------------------------------------------------------------
  const scrollToDay = (d) => { if (frame) scroll.scrollLeft = scrollLeftFor(frame, d, chartViewW()); };
  function reveal(id) {
    const f = findBar(id);
    if (!f || !frame) return;
    const top = (f.lane.offset + f.bar.track) * RH, viewH = scroll.clientHeight - HEAD_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (top + RH > scroll.scrollTop + viewH) scroll.scrollTop = top + RH - viewH;
    const x = xOf(frame, f.bar.task.start), xe = xOf(frame, f.bar.task.end + 1);
    if (x < scroll.scrollLeft || xe > scroll.scrollLeft + chartViewW()) scroll.scrollLeft = Math.max(0, x - 40);
  }
  function update(next, { first = false, fit = false } = {}) {
    if (drag) finish(true);
    const zoomChanged = !model || model.zoom !== next.zoom || model.weekStart !== next.weekStart;
    const keep = !first && !fit && frame ? centreDay() : null;
    model = next;
    RH = next.rowH || ROW_H;
    BH = next.barH || BAR_H;
    F = formatters(next.locale, next.datePattern);
    clear(corner).append(next.laneLabel || '', nav.splitter);
    root.classList.toggle('is-editable', !!next.editable);
    frame = makeFrame(next.span, next.today, next.zoom, next.weekStart);
    size();
    const span = next.span;
    if (fit && span) scroll.scrollLeft = Math.max(0, xOf(frame, span.from) - 24);
    else if (first) scrollToDay(!span || (next.today >= span.from - 30 && next.today <= span.to + 30) ? next.today : span.from);
    else if (zoomChanged && keep != null) { const a = nav.takeAnchor(); scroll.scrollLeft = Math.max(0, a ? xOf(frame, a.day) - a.x : xOf(frame, keep) - chartViewW() / 2); }
    drawn = '';
    draw(true);
  }

  return {
    update,
    reveal,
    chartWidth: () => chartViewW(),
    scrollToToday: () => model && scrollToDay(model.today),
    focus: () => scroll.focus({ preventScroll: true }),
    destroy: () => { ro?.disconnect(); clear(host); },
  };
}
