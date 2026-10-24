// The Gantt chart on screen: draws, scrolls, zooms, selects, edits by dragging (M2), and shows the
// plan's structure (M3): parents above their children, groups, dependency arrows, the critical path,
// weekends and holidays.
//
// One scroll container holds everything, so the task list, the header and the bars can never drift
// apart: the header sticks to the top, the task list to the left (CSS position: sticky). Only the
// rows and header cells that are on screen exist in the DOM, so 5,000 tasks cost what 40 do.
// All positions come from layout.js; the row order comes from model/tree.js.
//
// Gestures, all offered only where model/edits.js allows them:
//   drag a bar            move it            drag its left or right edge   change the start or end
//   drag a milestone      move it            drag across an undated row     give that task dates
//   drag the dot at a bar's end onto another bar                            link them (finish -> start)
//   click an arrow        remove the link    click a ▸ / ▾                  fold or unfold a parent or group
//   Alt+←/→               move by a day      Alt+Shift+←/→                  change the end by a day
// The view writes nothing itself: it reports what was done (onEdit, onLink, onArrow, onToggle) and
// the caller decides what that means for the table.

import { el, clear } from '../../core/util.js';
import { onColor } from '../../core/theme/apply.js';
import { makeFrame, barBox, rowWindow, scrollLeftFor, xOf, dayAt, ROW_H } from './layout.js';
import { formatters, rangeText, drawScale, drawShade } from './scale.js';
import { dateFromDay } from '../../model/values.js';
import { t } from '../../i18n/index.js';

export const HEAD_H = 52;
// The task list takes about a third of the widget, within limits: a narrow widget still shows bars.
const listWidthFor = (w) => Math.round(Math.max(150, Math.min(300, w * 0.32)));
const DRAG_START = 3;  // px the pointer must travel before a press becomes a drag
const INDENT = 14;     // px per level in the task list
const NO_CAPS = { move: false, start: false, end: false, draw: false };
const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/**
 * @param on {onSelect(id), onOpen(id), onQuickEdit(id), onEdit({id, mode, start, end}), onLink({from, to}),
 *            onArrow({from, to}), onToggle(key), onZoomStep(dir), onToday(), onUndo(), onRedo()}
 */
export function createGantt(host, on = {}) {
  const scaleTop = el('div', { class: 'ps-scale__row ps-scale__row--top' });
  const scaleBottom = el('div', { class: 'ps-scale__row ps-scale__row--bottom' });
  const corner = el('div', { class: 'ps-gantt__corner' });
  const scale = el('div', { class: 'ps-gantt__scale', 'aria-hidden': 'true' }, [scaleTop, scaleBottom]);
  const list = el('div', { class: 'ps-gantt__list', role: 'list' });
  const shade = el('div', { class: 'ps-chart__shade', 'aria-hidden': 'true' });
  const bars = el('div', { class: 'ps-chart__bars' });
  const todayLine = el('div', { class: 'ps-chart__today', 'aria-hidden': 'true' });
  const arrows = svgEl('svg', { class: 'ps-chart__arrows' });
  const chart = el('div', { class: 'ps-gantt__chart' }, [shade, todayLine, arrows, bars]);
  const canvas = el('div', { class: 'ps-gantt__canvas' }, [corner, scale, list, chart]);
  const scroll = el('div', { class: 'ps-gantt__scroll', tabindex: '0' }, [canvas]);
  const tip = el('div', { class: 'ps-tip', role: 'tooltip', hidden: true });
  const root = el('div', { class: 'ps-gantt' }, [scroll, tip]);
  clear(host).appendChild(root);

  // {entries, span, links, critical, criticalLinks, holidays, caps(task), length(a, b), workdays,
  //  linkable, editable, showCritical, today, zoom, weekStart, locale, selectedId, titleLabel}
  let model = null;
  let rows = [];      // model.entries
  let frame = null;
  let F = null;
  let drawn = '';     // what the last draw covered, so a scroll inside it costs nothing
  let raf = 0;
  let listW = 280;
  let drag = null;    // the gesture in progress
  let swallowUntil = 0;  // the click a drag's release produces is not a click on what is under it
  const indexOf = new Map();   // task id -> row
  const caps = (task) => (model?.caps ? model.caps(task) : NO_CAPS);
  const entryOf = (id) => { const i = indexOf.get(id); return i == null ? null : rows[i]; };
  const spanOf = (e) => (e.summary ? e.summary : e.task);   // a parent's bar spans its children

  const chartViewW = () => Math.max(0, scroll.clientWidth - listW);
  const centreDay = () => (frame ? dayAt(frame, scroll.scrollLeft + chartViewW() / 2) : null);

  function size() {
    listW = listWidthFor(scroll.clientWidth || 900);
    canvas.style.setProperty('--list-w', listW + 'px');
    canvas.style.setProperty('--chart-w', frame.width + 'px');
    canvas.style.setProperty('--head-h', HEAD_H + 'px');
    canvas.style.setProperty('--body-h', Math.max(1, rows.length) * ROW_H + 'px');
    canvas.style.setProperty('--row-h', ROW_H + 'px');
    arrows.setAttribute('width', String(frame.width));
    arrows.setAttribute('height', String(Math.max(1, rows.length) * ROW_H));
  }

  function drawScaleRange(x0, x1) {
    drawScale({ frame, top: scaleTop, bottom: scaleBottom, F, today: model.today, holidays: model.holidays, x0, x1 });
  }
  function drawShadeRange(x0, x1) {
    drawShade({ frame, shade, todayLine, holidays: model.holidays, today: model.today, x0, x1 });
  }

  const labelFits = (title, w) => w >= Math.min(title.length, 60) * 7 + 16;
  const whenText = (s) => (s.start == null ? t('No dates')
    : s.start === s.end ? F.dayMonth.format(dateFromDay(s.start))
      : `${F.dayMonth.format(dateFromDay(s.start))} – ${F.dayMonth.format(dateFromDay(s.end))}`);

  function caret(key, collapsed, label) {
    return el('button', {
      type: 'button', class: 'ps-caret', dataset: { toggle: key }, 'aria-expanded': collapsed ? 'false' : 'true',
      'aria-label': collapsed ? t('Unfold {name}', { name: label }) : t('Fold {name}', { name: label }),
    }, [el('span', { class: 'ps-caret__chevron' + (collapsed ? ' is-folded' : ''), 'aria-hidden': 'true' })]);
  }

  function barElements(e, i, selected) {
    const task = e.task;
    const span = spanOf(e);
    const box = barBox(frame, { kind: e.summary ? 'bar' : task.kind, start: span.start, end: span.end }, i);
    const title = task.title || t('(no name)');
    const label = `${title}, ${rangeText(F, span)}`;
    const critical = model.showCritical && model.critical?.has(task.id);
    const link = model.linkable && !e.summary ? el('span', { class: 'ps-bar__link', dataset: { id: String(task.id), part: 'link' }, title: t('Drag onto another task: it starts after this one ends') }) : null;
    const out = [];
    if (e.summary) {
      out.push(el('div', {
        class: 'ps-sum' + (selected ? ' is-selected' : '') + (critical ? ' is-critical' : ''),
        dataset: { id: String(task.id), part: 'summary' },
        style: { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px' }, role: 'img', 'aria-label': label,
      }));
      out.push(el('span', { class: 'ps-bar__out ps-bar__out--sum', dataset: { id: String(task.id) }, style: { left: box.x + box.w + 6 + 'px', top: box.y + 'px' }, text: title }));
      return out;
    }
    const c = caps(task);
    const fill = task.colour || 'var(--ps-bar)';
    const ink = task.colour ? onColor(task.colour) : 'var(--ps-bar-ink)';
    if (task.kind === 'milestone') {
      out.push(el('div', {
        class: 'ps-ms' + (task.fromDue ? ' ps-ms--due' : '') + (selected ? ' is-selected' : '') + (c.move ? ' can-move' : '') + (critical ? ' is-critical' : ''),
        dataset: { id: String(task.id), part: 'body' }, style: { left: box.x + 'px', top: box.y + 'px', '--fill': fill },
        role: 'img', 'aria-label': label,
      }, [link]));
      out.push(el('span', { class: 'ps-bar__out', dataset: { id: String(task.id) }, style: { left: box.x + box.w + 4 + 'px', top: box.y + 'px' }, text: title }));
      return out;
    }
    const inside = labelFits(title, box.w);
    out.push(el('div', {
      class: 'ps-bar' + (selected ? ' is-selected' : '') + (task.flag ? ' ps-bar--flag' : '') + (c.move ? ' can-move' : '') + (critical ? ' is-critical' : ''),
      dataset: { id: String(task.id), part: 'body' },
      style: { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', '--fill': fill, '--ink': ink },
      role: 'img', 'aria-label': label,
    }, [
      task.progress != null && task.progress > 0 ? el('span', { class: 'ps-bar__progress', style: { width: Math.round(task.progress * 100) + '%' } }) : null,
      inside ? el('span', { class: 'ps-bar__label', text: title }) : null,
      c.start ? el('span', { class: 'ps-bar__h ps-bar__h--l', dataset: { part: 'start' } }) : null,
      c.end ? el('span', { class: 'ps-bar__h ps-bar__h--r', dataset: { part: 'end' } }) : null,
      link,
    ]));
    if (!inside) out.push(el('span', { class: 'ps-bar__out', dataset: { id: String(task.id) }, style: { left: box.x + box.w + (link ? 14 : 6) + 'px', top: box.y + 'px' }, text: title }));
    return out;
  }

  function drawRows(first, last) {
    clear(list);
    clear(bars);
    const sel = model.selectedId;
    const firstUndated = rows.findIndex((e) => e.kind === 'task' && e.undated);
    for (let i = first; i <= last; i++) {
      const e = rows[i];
      if (!e) continue;
      if (e.kind === 'group') {
        const label = e.label || t('(none)');
        list.appendChild(el('div', { class: 'ps-row ps-row--group', role: 'listitem', dataset: { toggle: 'g:' + e.key }, style: { top: i * ROW_H + 'px' } }, [
          caret('g:' + e.key, e.collapsed, label),
          el('span', { class: 'ps-row__title', text: label }),
          el('span', { class: 'ps-row__when', text: String(e.count) }),
        ]));
        if (e.start != null && Number.isFinite(e.start)) {
          const box = barBox(frame, { kind: 'bar', start: e.start, end: e.end }, i);
          bars.appendChild(el('div', { class: 'ps-grpbar', dataset: { toggle: 'g:' + e.key }, style: { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px' }, title: `${label} · ${rangeText(F, e)}` }));
        }
        continue;
      }
      const task = e.task;
      const selected = task.id === sel;
      const title = task.title || t('(no name)');
      const span = spanOf(e);
      list.appendChild(el('div', {
        class: 'ps-row' + (selected ? ' is-selected' : '') + (task.flag ? ' is-flagged' : '') + (e.undated ? ' is-undated' : '')
          + (i === firstUndated ? ' is-first-undated' : '') + (e.summary ? ' is-summary' : ''),
        role: 'listitem', dataset: { id: String(task.id) }, style: { top: i * ROW_H + 'px' },
        'aria-label': `${title}, ${e.undated ? t('No dates') : rangeText(F, span)}`, 'aria-current': selected ? 'true' : null,
        'aria-level': String(e.depth + 1),
      }, [
        e.depth ? el('span', { class: 'ps-row__indent', style: { width: e.depth * INDENT + 'px' } }) : null,
        e.kids ? caret('p:' + task.id, e.collapsed, title) : null,
        el('span', { class: 'ps-row__title', text: title }),
        el('span', { class: 'ps-row__when', text: whenText(e.undated ? task : span) }),
      ]));
      if (selected) bars.appendChild(el('div', { class: 'ps-chart__selrow', style: { top: i * ROW_H + 'px' } }));
      if (e.undated) {
        const c = caps(task);
        bars.appendChild(el('div', {
          class: 'ps-drawrow' + (c.draw ? ' can-draw' : '') + (i === firstUndated ? ' is-first-undated' : ''),
          dataset: { id: String(task.id), part: 'draw' }, style: { top: i * ROW_H + 'px' },
        }, [el('span', { class: 'ps-drawrow__hint', text: c.draw ? t('Drag across the chart to give this task dates') : t('No dates') })]));
        continue;
      }
      bars.append(...barElements(e, i, selected));
    }
  }

  // ---- arrows ------------------------------------------------------------------------------------------
  /** Where a link leaves a task (its end) and arrives (its start), in chart coordinates. */
  function anchor(id, side) {
    const i = indexOf.get(id);
    if (i == null) return null;
    const e = rows[i];
    if (e.kind !== 'task' || e.undated) return null;
    const span = spanOf(e);
    const ms = !e.summary && e.task.kind === 'milestone';
    const box = barBox(frame, { kind: ms ? 'milestone' : 'bar', start: span.start, end: span.end }, i);
    const y = i * ROW_H + ROW_H / 2;
    if (ms) return { x: side === 'out' ? box.cx + 8 : box.cx - 8, y };
    return { x: side === 'out' ? box.x + box.w : box.x, y };
  }

  function arrowPath(a, b) {
    const r = 6;
    if (b.x - a.x >= 2 * r + 4) return `M${a.x},${a.y} H${a.x + r} V${b.y} H${b.x - 1}`;
    // The successor starts before the predecessor ends (or too close): go round, between the rows.
    const mid = b.y > a.y ? a.y + ROW_H / 2 : a.y - ROW_H / 2;
    return `M${a.x},${a.y} H${a.x + r} V${mid} H${b.x - 2 * r} V${b.y} H${b.x - 1}`;
  }

  function drawArrows(first, last) {
    clear(arrows);
    if (!model.links?.length) return;
    const defs = svgEl('defs');
    for (const [id, cls] of [['ps-head', ''], ['ps-head-late', ' is-late'], ['ps-head-crit', ' is-critical']]) {
      const m = svgEl('marker', { id, viewBox: '0 0 8 8', refX: '7', refY: '4', markerWidth: '7', markerHeight: '7', orient: 'auto' });
      m.appendChild(svgEl('path', { d: 'M0,0 L8,4 L0,8 z', class: 'ps-arrowhead' + cls }));
      defs.appendChild(m);
    }
    arrows.appendChild(defs);
    const lo = first - 40, hi = last + 40;
    for (const l of model.links) {
      const ia = indexOf.get(l.from), ib = indexOf.get(l.to);
      if (ia == null || ib == null || Math.max(ia, ib) < lo || Math.min(ia, ib) > hi) continue;
      const a = anchor(l.from, 'out'), b = anchor(l.to, 'in');
      if (!a || !b) continue;
      const crit = model.showCritical && model.criticalLinks?.has(l.from + '>' + l.to);
      const cls = 'ps-arrow' + (l.late ? ' is-late' : '') + (crit ? ' is-critical' : '');
      const d = arrowPath(a, b);
      arrows.appendChild(svgEl('path', { d, class: cls, 'marker-end': `url(#${l.late ? 'ps-head-late' : crit ? 'ps-head-crit' : 'ps-head'})` }));
      if (model.editable) arrows.appendChild(svgEl('path', { d, class: 'ps-arrow__hit', 'data-from': String(l.from), 'data-to': String(l.to) }));
    }
  }

  function draw(force = false) {
    if (!model || !frame || drag) return;
    const x0 = Math.max(0, scroll.scrollLeft - 200);
    const x1 = scroll.scrollLeft + chartViewW() + 200;
    const { first, last } = rowWindow(scroll.scrollTop, scroll.clientHeight - HEAD_H, rows.length);
    const bucket = Math.floor(x0 / 400);
    const key = `${first}:${last}:${bucket}`;
    if (!force && key === drawn) return;
    drawn = key;
    drawScaleRange(x0 - 400, x1 + 400);
    drawShadeRange(x0 - 400, x1 + 400);
    drawRows(first, last);
    drawArrows(first, last);
  }

  // ---- tooltip -------------------------------------------------------------------------------------
  function placeTip(x, y) {
    const r = root.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(r.width - w - 8, Math.max(8, x - r.left + 12)) + 'px';
    tip.style.top = (y - r.top + 18 + h > r.height ? y - r.top - h - 10 : y - r.top + 18) + 'px';
  }
  function showTip(e, x, y) {
    const task = e.task;
    const span = spanOf(e);
    const len = model.length ? model.length(span.start, span.end) : span.end - span.start + 1;
    const lines = [el('strong', { text: task.title || t('(no name)') }),
      el('div', { text: rangeText(F, span) + (span.start !== span.end ? ' · ' + (model.workdays ? t('{n} working days', { n: len }) : t('{n} days', { n: len })) : '') })];
    if (e.summary) lines.push(el('div', { class: 'ps-tip__note', text: t('Spans its {n} subtasks', { n: e.summary.count }) }));
    if (task.fromDue) lines.push(el('div', { class: 'ps-tip__note', text: t('Due date only') }));
    if (task.status) lines.push(el('div', { text: task.status }));
    if (task.people.length) lines.push(el('div', { text: task.people.join(', ') }));
    if (task.project) lines.push(el('div', { text: task.project }));
    if (task.progress != null) lines.push(el('div', { text: t('{n}% done', { n: Math.round(task.progress * 100) }) }));
    if (model.showCritical && model.critical?.has(task.id)) lines.push(el('div', { class: 'ps-tip__crit', text: t('On the critical path: a day late here is a day late at the end') }));
    if (task.flag === 'endBeforeStart') lines.push(el('div', { class: 'ps-tip__warn', text: t('The end date is before the start date. Drawn as one day.') }));
    const c = caps(task);
    if (!e.summary && model.editable && !c.move && !c.start && !c.end) lines.push(el('div', { class: 'ps-tip__note', text: t('Its dates come from formulas, so they can’t be dragged.') }));
    tip.classList.remove('ps-tip--drag');
    clear(tip).append(...lines);
    tip.hidden = false;
    placeTip(x, y);
  }
  const hideTip = () => { tip.hidden = true; };

  // ---- dragging ------------------------------------------------------------------------------------
  const chartX = (clientX) => clientX - chart.getBoundingClientRect().left;
  const chartY = (clientY) => clientY - chart.getBoundingClientRect().top;

  function dragPreview(d) {
    const { task, mode, start, end } = d;
    if (mode === 'link') {
      const a = d.from;
      if (a) d.line.setAttribute('d', `M${a.x},${a.y} L${d.cx},${d.cy}`);
      const target = d.target != null ? entryOf(d.target) : null;
      tip.classList.add('ps-tip--drag');
      clear(tip).append(el('strong', { text: target ? t('“{b}” starts after “{a}” ends', { a: task.title, b: target.task.title }) : t('Drop on the task that follows') }));
      tip.hidden = false;
      return;
    }
    const shown = { ...task, start, end };
    if (mode === 'draw') {
      if (!d.ghost) { d.ghost = el('div', { class: 'ps-bar ps-bar--ghost', style: { '--fill': 'var(--ps-bar)' } }); bars.appendChild(d.ghost); }
      const box = barBox(frame, { kind: 'bar', start, end }, d.row);
      Object.assign(d.ghost.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px' });
    } else if (task.kind === 'milestone') {
      d.el.style.left = barBox(frame, shown, d.row).x + 'px';
    } else {
      const box = barBox(frame, shown, d.row);
      d.el.style.left = box.x + 'px';
      d.el.style.width = box.w + 'px';
    }
    if (d.outLabel) d.outLabel.hidden = true;
    const shift = mode === 'move' ? start - task.start : mode === 'start' ? start - task.start : mode === 'end' ? end - task.end : null;
    const parts = [rangeText(F, shown)];
    if (shift) parts.push((shift > 0 ? '+' : '−') + t('{n} days', { n: Math.abs(shift) }));
    else if (end > start) parts.push(t('{n} days', { n: end - start + 1 }));
    tip.classList.add('ps-tip--drag');
    clear(tip).append(el('strong', { text: parts.join(' · ') }));
    tip.hidden = false;
  }

  function beginDrag(e, task, mode, row, node) {
    const day0 = dayAt(frame, chartX(e.clientX));
    drag = {
      task, mode, row, el: node, x0: e.clientX, scroll0: scroll.scrollLeft, day0, moved: false, pointerId: e.pointerId,
      start: task.start ?? day0, end: task.end ?? day0,
      outLabel: node ? bars.querySelector(`.ps-bar__out[data-id="${task.id}"]`) : null,
    };
    if (mode === 'link') {
      drag.from = anchor(task.id, 'out');
      drag.line = svgEl('path', { class: 'ps-arrow ps-arrow--draft' });
      arrows.appendChild(drag.line);
    }
  }

  function moveDrag(e) {
    const d = drag;
    if (!d.moved && Math.abs(e.clientX - d.x0) < DRAG_START) return;
    if (!d.moved) {
      d.moved = true;
      root.classList.add('is-dragging');
      hideTip();
      // Captured only now that it is a drag: a capture from the press would send the click and the
      // double-click to the chart instead of the bar, and double-click opens the task.
      try { chart.setPointerCapture(d.pointerId); } catch { /* fine without */ }
    }
    // Near an edge of the visible chart, scroll it along.
    const r = scroll.getBoundingClientRect();
    if (e.clientX > r.right - 30) scroll.scrollLeft += 12;
    else if (e.clientX < r.left + listW + 30) scroll.scrollLeft -= 12;
    if (d.mode === 'link') {
      d.cx = chartX(e.clientX); d.cy = chartY(e.clientY);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const n = under && under.closest && under.closest('.ps-bar[data-id], .ps-ms[data-id], .ps-sum[data-id]');
      const id = n ? Number(n.dataset.id) : null;
      d.target = id != null && id !== d.task.id ? id : null;
      for (const x of bars.querySelectorAll('.is-link-target')) x.classList.remove('is-link-target');
      if (n && d.target != null) n.classList.add('is-link-target');
      dragPreview(d);
      placeTip(e.clientX, e.clientY);
      return;
    }
    const delta = Math.round((e.clientX - d.x0 + scroll.scrollLeft - d.scroll0) / frame.px);
    const { task } = d;
    if (d.mode === 'move') { d.start = task.start + delta; d.end = task.end + delta; }
    else if (d.mode === 'start') { d.start = Math.min(task.end, task.start + delta); d.end = task.end; }
    else if (d.mode === 'end') { d.start = task.start; d.end = Math.max(task.start, task.end + delta); }
    else { const cur = d.day0 + delta; d.start = Math.min(d.day0, cur); d.end = Math.max(d.day0, cur); }
    dragPreview(d);
    placeTip(e.clientX, e.clientY);
  }

  function endDrag(e, cancelled = false) {
    const d = drag;
    drag = null;
    try { chart.releasePointerCapture(d.pointerId); } catch { /* released already */ }
    root.classList.remove('is-dragging');
    hideTip();
    if (d.ghost) d.ghost.remove();
    if (d.line) d.line.remove();
    if (!d.moved) return false;
    // A time window, not a flag: when the release lands outside the element pressed, the browser sends
    // no click at all, and a flag would then swallow the next real click (a fold caret, found in M3).
    swallowUntil = performance.now() + 300;
    if (d.mode === 'link') {
      if (!cancelled && d.target != null) on.onLink?.({ from: d.task.id, to: d.target });
      draw(true);
      return true;
    }
    const changed = d.mode === 'draw' || d.start !== d.task.start || d.end !== d.task.end;
    if (!cancelled && changed) on.onEdit?.({ id: d.task.id, mode: d.mode, start: d.start, end: d.end });
    draw(true);
    return true;
  }

  chart.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !model?.editable) return;
    const n = e.target.closest && e.target.closest('[data-id]');
    if (!n) return;
    const entry = entryOf(Number(n.dataset.id));
    if (!entry || entry.kind !== 'task') return;
    const task = entry.task;
    const c = caps(task);
    const part = e.target.dataset.part || n.dataset.part;
    let mode = null;
    if (part === 'link') mode = model.linkable ? 'link' : null;
    else if (entry.summary) mode = null;
    else if (part === 'draw') mode = c.draw ? 'draw' : null;
    else if (part === 'start' && c.start) mode = 'start';
    else if (part === 'end' && c.end) mode = 'end';
    else if (part === 'body' && c.move) mode = 'move';
    if (!mode) return;
    e.preventDefault();
    e.stopPropagation();
    // preventDefault also stops the press from focusing the chart; keyboard shortcuts (Ctrl+Z) need it.
    scroll.focus({ preventScroll: true });
    beginDrag(e, task, mode, indexOf.get(task.id), part === 'draw' || part === 'link' ? null : n.closest('.ps-bar, .ps-ms'));
  });
  chart.addEventListener('pointermove', (e) => { if (drag) moveDrag(e); });
  chart.addEventListener('pointerup', (e) => { if (drag) endDrag(e); });
  chart.addEventListener('pointercancel', (e) => { if (drag) endDrag(e, true); });

  // ---- other events ----------------------------------------------------------------------------------
  const entryFrom = (target) => {
    const n = target.closest && target.closest('[data-id]');
    return n && model ? entryOf(Number(n.dataset.id)) : null;
  };
  scroll.addEventListener('scroll', () => { if (!drag) hideTip(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });
  canvas.addEventListener('click', (e) => {
    if (performance.now() < swallowUntil) return;
    const toggle = e.target.closest && e.target.closest('[data-toggle]');
    if (toggle) { on.onToggle?.(toggle.dataset.toggle); return; }
    const hit = e.target.closest && e.target.closest('.ps-arrow__hit');
    if (hit) { on.onArrow?.({ from: Number(hit.getAttribute('data-from')), to: Number(hit.getAttribute('data-to')) }); return; }
    const entry = entryFrom(e.target);
    if (entry) on.onSelect?.(entry.task.id);
  });
  canvas.addEventListener('dblclick', (e) => {
    if (e.target.closest && e.target.closest('[data-toggle], .ps-arrow__hit')) return;
    const entry = entryFrom(e.target);
    if (entry) on.onOpen?.(entry.task.id);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (drag) return;
    const entry = e.target.closest && e.target.closest('.ps-bar, .ps-ms, .ps-sum, .ps-bar__out') ? entryFrom(e.target) : null;
    if (entry && !entry.undated) showTip(entry, e.clientX, e.clientY); else hideTip();
  });
  canvas.addEventListener('mouseleave', () => { if (!drag) hideTip(); });

  scroll.addEventListener('keydown', (e) => {
    if (!model) return;
    if (drag) { if (e.key === 'Escape') { e.preventDefault(); endDrag(e, true); } return; }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); (e.shiftKey ? on.onRedo : on.onUndo)?.(); return; }
    if (mod && key === 'y') { e.preventDefault(); on.onRedo?.(); return; }
    if (mod) return;
    const taskRows = rows.filter((r) => r.kind === 'task');
    const n = taskRows.length;
    const cur = model.selectedId != null ? taskRows.findIndex((r) => r.task.id === model.selectedId) : -1;
    const sel = cur >= 0 ? taskRows[cur] : null;
    if (e.altKey && sel && !sel.undated && !sel.summary && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const task = sel.task;
      const step = e.key === 'ArrowRight' ? 1 : -1;
      const c = caps(task);
      if (e.shiftKey && c.end && task.end + step >= task.start) on.onEdit?.({ id: task.id, mode: 'end', start: task.start, end: task.end + step });
      else if (!e.shiftKey && c.move) on.onEdit?.({ id: task.id, mode: 'move', start: task.start + step, end: task.end + step });
      return;
    }
    if (e.altKey) return;
    const go = (j) => { if (n) { e.preventDefault(); on.onSelect?.(taskRows[Math.max(0, Math.min(n - 1, j))].task.id); } };
    if (e.key === 'ArrowDown') go(cur + 1);
    else if (e.key === 'ArrowUp') go(cur < 0 ? 0 : cur - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(n - 1);
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && sel?.kids) {
      // ← folds an open parent, → unfolds a folded one
      if ((e.key === 'ArrowLeft') !== sel.collapsed) { e.preventDefault(); on.onToggle?.('p:' + sel.task.id); }
    } else if (e.key === 'Enter' && sel) { e.preventDefault(); on.onQuickEdit?.(sel.task.id); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); on.onZoomStep?.(-1); }
    else if (e.key === '-') { e.preventDefault(); on.onZoomStep?.(1); }
    else if (key === 't') { e.preventDefault(); on.onToday?.(); }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (model && frame) { size(); draw(true); } }) : null;
  ro?.observe(scroll);

  // ---- API -------------------------------------------------------------------------------------------
  function scrollToDay(day) {
    if (!frame) return;
    scroll.scrollLeft = scrollLeftFor(frame, day, chartViewW());
  }

  /** Bring a task into view: its row vertically, its bar's start horizontally (only if off screen). */
  function reveal(id) {
    const i = indexOf.get(id);
    if (i == null || !frame) return;
    const top = i * ROW_H, viewH = scroll.clientHeight - HEAD_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (top + ROW_H > scroll.scrollTop + viewH) scroll.scrollTop = top + ROW_H - viewH;
    const e = rows[i];
    if (e.kind !== 'task' || e.undated) return;
    const span = spanOf(e);
    const x = xOf(frame, span.start), xe = xOf(frame, span.end + 1);
    if (x < scroll.scrollLeft || xe > scroll.scrollLeft + chartViewW()) scroll.scrollLeft = Math.max(0, x - 40);
  }

  /**
   * @param next see `model` above; `span` = {from, to} of everything dated (for the frame)
   * @param opts {first} first draw: scroll to today (or to the work, if today is far away);
   *             {fit} scroll so the first task starts the visible chart
   */
  function update(next, { first = false, fit = false } = {}) {
    if (drag) endDrag(null, true);
    const zoomChanged = !model || model.zoom !== next.zoom || model.weekStart !== next.weekStart;
    const keep = !first && !fit && frame ? centreDay() : null;
    model = next;
    rows = next.entries;
    F = formatters(next.locale);
    indexOf.clear();
    rows.forEach((e, i) => { if (e.kind === 'task') indexOf.set(e.task.id, i); });
    corner.textContent = next.titleLabel || t('Task');
    root.classList.toggle('is-editable', !!next.editable);
    const span = next.span;
    frame = makeFrame(span, next.today, next.zoom, next.weekStart);
    size();
    if (fit && span) scroll.scrollLeft = Math.max(0, xOf(frame, span.from) - 24);
    else if (first) {
      const near = !span || (next.today >= span.from - 30 && next.today <= span.to + 30);
      scrollToDay(near ? next.today : span.from);
    } else if (zoomChanged && keep != null) {
      scroll.scrollLeft = Math.max(0, xOf(frame, keep) - chartViewW() / 2);
    }
    drawn = '';
    draw(true);
  }

  return {
    update,
    reveal,
    chartWidth: () => chartViewW(),
    scrollToToday: () => model && scrollToDay(model.today),
    scrollToUndated: () => {
      const i = rows.findIndex((e) => e.kind === 'task' && e.undated);
      if (i >= 0) { scroll.scrollTop = i * ROW_H; draw(true); }
    },
    focus: () => scroll.focus({ preventScroll: true }),
    destroy: () => { ro?.disconnect(); clear(host); },
  };
}
