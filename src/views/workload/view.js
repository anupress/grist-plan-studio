// The workload: people down the side, days, weeks or months across, and in each cell the hours asked
// of that person against the hours they have (model/workload.js). A cell is a line of a resource
// sheet: the numbers, then a thin meter whose track is the capacity; past it the meter turns the
// warning colour, and the cell says how many hours over in words.
//
//   click a cell            the tasks behind it, with their hours; pick one to select it
//   arrow keys              move from cell to cell; Enter lists the tasks there
//   double-click a task     quick edit
//
// Built like the booking grid (one scroll container, sticky period header and names, only the cells
// in view drawn), and it borrows that grid's layout styles.

import { el, clear } from '../../core/util.js';
import { formatters, rangeText } from '../gantt/scale.js';
import { dateFromDay } from '../../model/values.js';
import { isoWeek } from '../gantt/layout.js';
import { EPS } from '../../model/workload.js';
import { t, tn } from '../../i18n/index.js';

const HEAD_H = 50;
const ROW_H = 58;
const COL_W = { day: 64, week: 112, month: 124 };
const resWidthFor = (w) => Math.round(Math.max(140, Math.min(230, w * 0.2)));

/** Hours as people write them in this language: 8, 7.5 (7,5 in German and French), at most one decimal. */
const NUMBERS = new Map();
export function hoursText(h, locale) {
  if (!NUMBERS.has(locale)) NUMBERS.set(locale, new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
  return NUMBERS.get(locale).format(Math.round(h * 10) / 10);
}

/**
 * @param on {onSelect(id), onQuickEdit(id), onAnnounce(text), onUndo(), onRedo()}
 */
export function createWorkload(host, on = {}) {
  const corner = el('div', { class: 'ps-book__corner' });
  const head = el('div', { class: 'ps-book__head' });
  const side = el('div', { class: 'ps-book__side', role: 'list' });
  const body = el('div', { class: 'ps-book__body' });
  const canvas = el('div', { class: 'ps-book__canvas' }, [corner, head, side, body]);
  const scroll = el('div', { class: 'ps-book__scroll', tabindex: '0', role: 'region', 'aria-label': t('Workload') }, [canvas]);
  const tip = el('div', { class: 'ps-tip', role: 'tooltip', hidden: true });
  const root = el('div', { class: 'ps-book ps-wl' }, [scroll, tip]);
  clear(host).appendChild(root);

  // {people: [{key, label, colour, none, perDay, totals: [{load, cap, over, off}], overDays}], periods, unit, team: [{load, cap}],
  //  today, selectedId, rowLabel, noneLabel, locale, workdays (per period: a working day in the calendar; days only),
  //  tasksAt(ri, pi) -> [{task, hours}], locate(id) -> {ri, pi} | null}
  let model = null;
  let F = null;
  let colW = 112, resW = 180;
  let drawn = '';
  let raf = 0;
  let cursor = null;   // {ri, pi}
  let pop = null;      // the open list of a cell's tasks: {el, ri, pi, release}

  const name = (p) => (p.none ? model.noneLabel : String(p.label ?? ''));
  const hours = (h) => hoursText(h, model.locale);
  const viewW = () => Math.max(0, scroll.clientWidth - resW);

  function size() {
    resW = resWidthFor(scroll.clientWidth || 900);
    const base = COL_W[model.unit] || 112;
    const n = Math.max(1, model.periods.length);
    colW = Math.round(Math.min(base * 1.8, Math.max(base, (Math.max(0, (scroll.clientWidth || 900) - resW) - 2) / n)));
    canvas.style.setProperty('--res-w', resW + 'px');
    canvas.style.setProperty('--grid-w', n * colW + 'px');
    canvas.style.setProperty('--head-h', HEAD_H + 'px');
    canvas.style.setProperty('--body-h', Math.max(ROW_H, model.people.length * ROW_H) + 'px');
    canvas.style.setProperty('--col-w', colW + 'px');
  }

  // ---- words ---------------------------------------------------------------------------------------------
  function periodLabel(p, i) {
    const d = dateFromDay(p.start);
    if (model.unit === 'day') return F.weekdayDay.format(d) + (i === 0 || d.getUTCDate() === 1 ? ' · ' + F.monthShort.format(d) : '');
    if (model.unit === 'week') return t('W{n}', { n: isoWeek(p.start + 3).week }) + ' · ' + F.dayMonth.format(d);
    return F.monthYearShort.format(d);
  }
  const isToday = (p) => model.today >= p.start && model.today <= p.end;
  /** "46 of 40 hours, 6 over", for a screen reader and the tooltip */
  function cellWords(p, x) {
    if (x.cap == null) return t('{h} hours, not assigned to anyone', { h: hours(x.load) });
    if (x.off && x.load <= EPS) return t('Day off');
    const base = t('{load} of {cap} hours', { load: hours(x.load), cap: hours(x.cap) });
    if (x.load > x.cap + EPS) return base + ', ' + t('{h} over', { h: hours(x.load - x.cap) });
    if (x.over > 0) return base + ', ' + tn(x.over, 'but {n} day is over capacity', 'but {n} days are over capacity');
    return base + (x.cap - x.load > EPS ? ', ' + t('{h} free', { h: hours(x.cap - x.load) }) : '');
  }

  // ---- drawing --------------------------------------------------------------------------------------------
  function drawHead(c0, c1) {
    clear(head);
    for (let i = c0; i <= c1; i++) {
      const p = model.periods[i];
      const team = model.team[i];
      head.appendChild(el('div', {
        class: 'ps-book__col' + (isToday(p) ? ' is-today' : '') + (model.unit === 'day' && dateFromDay(p.start).getUTCDate() === 1 ? ' is-month' : ''),
        style: { left: i * colW + 'px', width: colW + 'px' }, title: rangeText(F, p),
      }, [
        el('span', { class: 'ps-book__label', text: periodLabel(p, i) }),
        el('span', { class: 'ps-wl__team' + (team.load > team.cap + EPS ? ' is-over' : ''), text: model.unit === 'day' ? hours(team.load) : t('{load} of {cap} h', { load: hours(team.load), cap: hours(team.cap) }),
          title: t('Everyone: {load} of {cap} hours', { load: hours(team.load), cap: hours(team.cap) }) }),
      ]));
    }
  }

  function drawSide(r0, r1) {
    clear(side);
    for (let ri = r0; ri <= r1; ri++) {
      const p = model.people[ri];
      side.appendChild(el('div', {
        class: 'ps-book__res ps-wl__person' + (p.none ? ' is-none' : ''), role: 'listitem',
        style: { top: ri * ROW_H + 'px', height: ROW_H + 'px', '--lane': p.colour || 'transparent' },
      }, [
        el('span', { class: 'ps-book__resname', text: name(p), title: name(p) }),
        p.none ? el('span', { class: 'ps-wl__cap', text: t('no one to measure against') })
          : el('span', { class: 'ps-wl__cap' + (p.overDays ? ' is-over' : ''), text: p.overDays ? tn(p.overDays, '{n} day over capacity', '{n} days over capacity') : t('{h} h a week', { h: hours(p.perDay * 5) }) }),
      ]));
    }
  }

  function cell(p, ri, i) {
    const x = p.totals[i];
    const over = x.cap != null && x.load > x.cap + EPS;
    const left = i * colW, top = ri * ROW_H;
    const base = { dataset: { ri: String(ri), pi: String(i) }, style: { left: left + 'px', top: top + 'px', width: colW + 'px', height: ROW_H + 'px' } };
    if (x.load <= EPS) {
      // Weekends and public holidays are off for everyone and the header says which day it is; the word marks
      // only a working day this person is away (a row of the holidays table naming them).
      return x.off ? el('div', { ...base, class: 'ps-wl__cell is-off', title: t('Day off') }, [model.unit === 'day' && model.workdays?.[i] ? el('span', { class: 'ps-wl__offword', text: t('off') }) : null]) : null;
    }
    const ratio = x.cap ? x.load / x.cap : 1;
    const day = model.unit === 'day';
    // A week can fit in total and still have days that do not: the cell says so.
    const overDays = !over && x.over > 0;
    const text = x.cap == null ? hours(x.load) + ' h' : day ? `${hours(x.load)}/${hours(x.cap)}` : t('{load} of {cap} h', { load: hours(x.load), cap: hours(x.cap) });
    // The meter's track is the capacity (100 %); an overload runs past a tick at the end of it, up to half again.
    const fill = Math.min(1, ratio) * (over ? 100 / 1.5 : 100);
    const extra = over ? Math.min(0.5, ratio - 1) * (100 / 1.5) : 0;
    return el('div', {
      ...base, class: 'ps-wl__cell' + (over ? ' is-over' : overDays || ratio > 0.85 ? ' is-high' : '') + (x.cap == null ? ' is-free' : '') + (x.off ? ' is-offday' : ''),
      role: 'img', 'aria-label': `${name(p)}, ${periodLabel(model.periods[i], i)}: ${cellWords(p, x)}`,
    }, [
      el('span', { class: 'ps-wl__num', text }),
      over ? el('span', { class: 'ps-wl__note', text: day ? '+' + hours(x.load - x.cap) : t('{h} h over', { h: hours(x.load - x.cap) }) })
        : overDays ? el('span', { class: 'ps-wl__note', text: tn(x.over, '{n} day over', '{n} days over') }) : null,
      x.cap == null ? null : el('span', { class: 'ps-wl__meter' + (over ? ' has-tick' : '') }, [
        el('span', { class: 'ps-wl__fill', style: { width: fill + '%' } }),
        over ? el('span', { class: 'ps-wl__spill', style: { left: 100 / 1.5 + '%', width: extra + '%' } }) : null,
      ]),
    ]);
  }

  function drawBody(r0, r1, c0, c1) {
    clear(body);
    const today = model.periods.findIndex(isToday);
    if (today >= 0) body.appendChild(el('div', { class: 'ps-book__todaycol', style: { left: today * colW + 'px', width: colW + 'px' } }));
    for (let ri = r0; ri <= r1; ri++) {
      const p = model.people[ri];
      body.appendChild(el('div', { class: 'ps-book__row' + (ri % 2 ? ' is-alt' : ''), style: { top: ri * ROW_H + 'px', height: ROW_H + 'px' } }));
      for (let i = c0; i <= c1; i++) { const c = cell(p, ri, i); if (c) body.appendChild(c); }
    }
    if (cursor && cursor.ri >= r0 && cursor.ri <= r1 && cursor.pi >= c0 && cursor.pi <= c1) {
      body.appendChild(el('div', { class: 'ps-book__cursor', 'aria-hidden': 'true', style: { left: cursor.pi * colW + 'px', top: cursor.ri * ROW_H + 'px', width: colW + 'px', height: ROW_H + 'px' } }));
    }
  }

  function windowOf() {
    const r0 = Math.max(0, Math.floor(scroll.scrollTop / ROW_H) - 3);
    const r1 = Math.min(model.people.length - 1, Math.ceil((scroll.scrollTop + scroll.clientHeight) / ROW_H) + 3);
    const c0 = Math.max(0, Math.floor(scroll.scrollLeft / colW) - 1);
    const c1 = Math.min(model.periods.length - 1, Math.ceil((scroll.scrollLeft + viewW()) / colW) + 3);
    return { r0, r1, c0, c1 };
  }

  function draw(force = false) {
    if (!model) return;
    if (!model.periods.length || !model.people.length) { clear(head); clear(side); clear(body); return; }
    const { r0, r1, c0, c1 } = windowOf();
    const key = `${r0}:${r1}:${c0}:${c1}`;
    if (!force && key === drawn) return;
    drawn = key;
    drawHead(c0, c1);
    drawSide(r0, r1);
    drawBody(r0, r1, c0, c1);
  }

  // ---- the tasks behind a cell ---------------------------------------------------------------------------
  function closePop(refocus = true) {
    if (!pop) return;
    const p = pop;
    pop = null;
    p.el.remove();
    document.removeEventListener('keydown', p.onKey, true);
    if (refocus) scroll.focus({ preventScroll: true });
  }
  function openPop(ri, pi, { focus = false } = {}) {
    closePop(false);
    const p = model.people[ri], x = p.totals[pi];
    const list = model.tasksAt(ri, pi);
    if (!list.length) return;
    const items = list.map(({ task, hours: h }) => el('button', {
      type: 'button', class: 'ps-wl__task' + (task.id === model.selectedId ? ' is-selected' : ''), dataset: { id: String(task.id) },
      onclick: () => on.onSelect?.(task.id), ondblclick: () => { closePop(); on.onQuickEdit?.(task.id); },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); closePop(); on.onQuickEdit?.(task.id); } },
    }, [
      el('span', { class: 'ps-wl__tname', text: task.title || t('(no name)') }),
      el('span', { class: 'ps-wl__th', text: hours(h) + ' h' }),
    ]));
    const box = el('div', { class: 'ps-wl__pop', role: 'dialog', 'aria-label': `${name(p)}, ${periodLabel(model.periods[pi], pi)}` }, [
      el('div', { class: 'ps-wl__pophead' }, [
        el('strong', { text: `${name(p)} · ${periodLabel(model.periods[pi], pi)}` }),
        el('span', { class: x.cap != null && x.load > x.cap + EPS ? 'is-over' : '', text: cellWords(p, x) }),
      ]),
      el('div', { class: 'ps-wl__tasks' }, items),
      el('p', { class: 'ps-wl__pophint', text: t('Double-click a task, or press Enter, to edit it.') }),
    ]);
    root.appendChild(box);
    // next to the cell, inside the widget
    const r = root.getBoundingClientRect(), s = scroll.getBoundingClientRect();
    const x0 = s.left - r.left + resW + pi * colW - scroll.scrollLeft;
    const y0 = s.top - r.top + HEAD_H + (ri + 1) * ROW_H - scroll.scrollTop;
    box.style.left = Math.max(8, Math.min(r.width - box.offsetWidth - 8, x0)) + 'px';
    box.style.top = (y0 + box.offsetHeight > r.height - 8 ? Math.max(8, y0 - ROW_H - box.offsetHeight - 4) : y0 + 2) + 'px';
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const bs = [...box.querySelectorAll('.ps-wl__task')];
        const i = bs.indexOf(document.activeElement);
        if (i >= 0) { e.preventDefault(); bs[Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    pop = { el: box, ri, pi, onKey };
    if (focus) items[0]?.focus();
  }

  // ---- tooltip ---------------------------------------------------------------------------------------------
  function showTip(ri, pi, e) {
    const p = model.people[ri], x = p.totals[pi];
    clear(tip).append(el('strong', { text: `${name(p)} · ${periodLabel(model.periods[pi], pi)}` }), el('div', { text: cellWords(p, x) }));
    if (x.load > EPS) tip.append(el('div', { class: 'ps-tip__hint', text: t('Click for the tasks behind it.') }));
    tip.hidden = false;
    const r = root.getBoundingClientRect();
    tip.style.left = Math.min(r.width - tip.offsetWidth - 8, Math.max(8, e.clientX - r.left + 12)) + 'px';
    tip.style.top = (e.clientY - r.top + 18 + tip.offsetHeight > r.height ? e.clientY - r.top - tip.offsetHeight - 10 : e.clientY - r.top + 18) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  // ---- events ----------------------------------------------------------------------------------------------
  scroll.addEventListener('scroll', () => { hideTip(); closePop(false); if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });
  body.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.ps-wl__cell');
    if (!c || !model) return;
    cursor = { ri: Number(c.dataset.ri), pi: Number(c.dataset.pi) };
    hideTip();
    draw(true);
    openPop(cursor.ri, cursor.pi);
  });
  body.addEventListener('mousemove', (e) => {
    if (!model || pop) return;
    const c = e.target.closest && e.target.closest('.ps-wl__cell');
    if (c) showTip(Number(c.dataset.ri), Number(c.dataset.pi), e); else hideTip();
  });
  body.addEventListener('mouseleave', hideTip);
  root.addEventListener('pointerdown', (e) => { if (pop && !pop.el.contains(e.target) && !(e.target.closest && e.target.closest('.ps-wl__cell'))) closePop(false); });

  scroll.addEventListener('keydown', (e) => {
    if (!model) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); (e.shiftKey ? on.onRedo : on.onUndo)?.(); return; }
    if (mod && key === 'y') { e.preventDefault(); on.onRedo?.(); return; }
    if (mod || e.altKey || !model.people.length || !model.periods.length) return;
    const R = model.people.length, P = model.periods.length;
    if (!cursor) cursor = { ri: 0, pi: Math.max(0, model.periods.findIndex(isToday)) };
    const move = (dr, dp) => {
      e.preventDefault();
      closePop(false);
      cursor = { ri: Math.max(0, Math.min(R - 1, cursor.ri + dr)), pi: Math.max(0, Math.min(P - 1, cursor.pi + dp)) };
      revealCell(cursor);
      drawn = '';
      draw(true);
      const p = model.people[cursor.ri];
      on.onAnnounce?.(`${name(p)}, ${periodLabel(model.periods[cursor.pi], cursor.pi)}: ${cellWords(p, p.totals[cursor.pi])}`);
    };
    if (e.key === 'ArrowRight') move(0, 1);
    else if (e.key === 'ArrowLeft') move(0, -1);
    else if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'Home') move(0, -P);
    else if (e.key === 'End') move(0, P);
    else if (e.key === 'Enter') { e.preventDefault(); openPop(cursor.ri, cursor.pi, { focus: true }); }
  });
  function revealCell(c) {
    const top = c.ri * ROW_H, viewH = scroll.clientHeight - HEAD_H;
    if (top < scroll.scrollTop) scroll.scrollTop = top; else if (top + ROW_H > scroll.scrollTop + viewH) scroll.scrollTop = top + ROW_H - viewH;
    const x = c.pi * colW;
    if (x < scroll.scrollLeft) scroll.scrollLeft = x; else if (x + colW > scroll.scrollLeft + viewW()) scroll.scrollLeft = x + colW - viewW();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (model) { size(); draw(true); } }) : null;
  ro?.observe(scroll);

  // ---- API ---------------------------------------------------------------------------------------------------
  function scrollToPeriod(i) { if (i >= 0) scroll.scrollLeft = Math.max(0, i * colW - colW); }
  function reveal(id) {
    const at = model?.locate(id);
    if (!at) return;
    revealCell(at);
  }
  function update(next, { first = false, startAt = null } = {}) {
    if (cursor && (cursor.ri >= next.people.length || cursor.pi >= next.periods.length)) cursor = null;
    const reopen = pop && next.people[pop.ri] ? { ri: pop.ri, pi: pop.pi } : null;
    closePop(false);
    model = next;
    F = formatters(next.locale);
    corner.textContent = next.rowLabel || '';
    size();
    if (first) scrollToPeriod(startAt ?? next.periods.findIndex(isToday));
    drawn = '';
    draw(true);
    if (reopen && reopen.pi < next.periods.length) openPop(reopen.ri, reopen.pi);
  }

  return {
    update,
    reveal,
    scrollToToday: () => model && scrollToPeriod(model.periods.findIndex(isToday)),
    scrollToCell: (c) => { if (model && c) { cursor = c; revealCell(c); drawn = ''; draw(true); } },
    focus: () => scroll.focus({ preventScroll: true }),
    destroy: () => { closePop(false); ro?.disconnect(); clear(host); },
  };
}
