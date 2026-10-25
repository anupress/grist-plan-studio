// The calendar: a month or a week in rows of seven days, a bar for each task on the days it covers.
// Drawing and gestures only; which bar goes where is decided in model/calgrid.js, and what a move
// writes in main.js (the same planDates the Gantt chart uses).
//
//   drag a bar            to another day: the task keeps its length and moves there
//   click a bar, Enter    quick edit
//   arrow keys            the previous or next task; Alt+← → move it a day, Alt+↑ ↓ a week
//   PageUp, PageDown      the previous or next month (week)
//   a day's number        that day's week;   "+3 more"   the same, where every bar fits
//
// A touch drag starts after a half-second hold, so a swipe still scrolls.

import { el, clear } from '../../core/util.js';
import { t, tn } from '../../i18n/index.js';

const HOLD_MS = 350;      // a touch has to rest this long on a bar before it drags
const MOVE_MOUSE = 4;     // px a mouse has to travel before a press becomes a drag

/**
 * @param on {onSelect(id), onQuickEdit(id), onMove({id, delta}), onNav(dir), onToday(), onMode('month' | 'week'), onDay(day), onNewOn(day) (a task on a day: the + of a day, or a double click on its empty part),
 *            onFind(id) (the bar is not in this month or week), onAnnounce(text), onUndo(), onRedo()}
 */
export function createCalendar(host, on = {}) {
  // model: {grid (model/calgrid.js), mode, title, weekdays: [7 names], today, selectedId, canDrag(task), isOff(day),
  //   dayText(day, first), dayLabel(day), describe(task), meta(task), fmtRange(a, b), fmtDay(day)}
  let model = null;
  let pending = null;       // a model that arrived mid-drag, drawn when the drag ends
  let drag = null;
  let suppressClick = false;
  let weekNodes = [];       // [{start, node}] for hit tests
  let dayNodes = new Map(); // day -> its cell
  let ghost = null;

  const head = el('div', { class: 'ps-cal__head' });
  const weekdays = el('div', { class: 'ps-cal__weekdays', 'aria-hidden': 'true' });
  const weeks = el('div', { class: 'ps-cal__weeks' });
  const root = el('div', { class: 'ps-cal', role: 'region', 'aria-label': t('Calendar'), tabindex: '-1' }, [head, weekdays, weeks]);
  clear(host).appendChild(root);

  // ---- drawing --------------------------------------------------------------------------------------------
  function drawHead() {
    const m = model;
    const nav = (text, label, dir) => el('button', { type: 'button', class: 'ps-btn ps-cal__nav', text, 'aria-label': label, title: label, onclick: () => on.onNav?.(dir) });
    const month = m.mode === 'month';
    clear(head).append(
      nav('‹', month ? t('Previous month') : t('Previous week'), -1),
      nav('›', month ? t('Next month') : t('Next week'), 1),
      el('button', { type: 'button', class: 'ps-btn', text: t('Today'), title: t('Show today'), onclick: () => on.onToday?.() }),
      el('h2', { class: 'ps-cal__title', 'aria-live': 'polite', text: m.title }),
      el('div', { class: 'ps-seg', role: 'group', 'aria-label': t('Show') }, [['month', t('Month')], ['week', t('Week')]].map(([id, text]) => el('button', {
        type: 'button', class: 'ps-seg__btn' + (id === m.mode ? ' is-on' : ''), 'aria-pressed': id === m.mode ? 'true' : 'false', text,
        onclick: () => { if (id !== m.mode) on.onMode?.(id); },
      }))),
    );
    clear(weekdays).append(...m.weekdays.map((d) => el('span', { text: d })));
  }

  function chip(seg, week) {
    const x = seg.task;
    const label = [model.describe(x), x.finished ? t('done') : null, x.kind === 'milestone' ? t('milestone') : null].filter(Boolean).join(', ');
    const node = el('button', {
      type: 'button', tabindex: '-1', dataset: { id: String(x.id), week: String(week.start) },
      class: 'ps-cal__chip' + (x.id === model.selectedId ? ' is-selected' : '') + (x.finished ? ' is-done' : '') + (x.kind === 'milestone' ? ' is-milestone' : '')
        + (seg.fromLeft ? ' is-from-left' : '') + (seg.toRight ? ' is-to-right' : '') + (model.canDrag(x) ? ' is-movable' : ''),
      style: { gridColumn: `${seg.col0 + 1} / ${seg.col1 + 2}`, gridRow: String(seg.track + 2), ...(x.colour ? { '--stripe': x.colour } : {}) },
      'aria-label': label, 'aria-pressed': x.id === model.selectedId ? 'true' : 'false', title: label,
      onclick: () => { if (suppressClick) return; on.onSelect?.(x.id); on.onQuickEdit?.(x.id); },
      onpointerdown: (e) => pressed(e, seg),
    }, [
      el('span', { class: 'ps-cal__chip-text', text: x.title || t('(no name)') }),
      // a week has the room: who, and in what state
      model.mode === 'week' && model.meta(x) ? el('span', { class: 'ps-cal__chip-meta', text: model.meta(x) }) : null,
    ]);
    return node;
  }

  function weekNode(w) {
    const tracks = model.mode === 'month' ? model.maxTracks : Math.max(3, w.tracks);
    const node = el('div', { class: 'ps-cal__week', style: { '--tracks': String(tracks) }, dataset: { start: String(w.start) } });
    w.days.forEach((day, i) => {
      const today = day === model.today;
      const outside = model.grid.month && (day < model.grid.month.first || day > model.grid.month.last);
      const cell = el('div', { class: 'ps-cal__day' + (model.isOff(day) ? ' is-off' : '') + (outside ? ' is-outside' : ''), style: { gridColumn: String(i + 1) }, dataset: { day: String(day) } }, [
        el('button', {
          type: 'button', class: 'ps-cal__num' + (today ? ' is-today' : ''), text: model.dayText(day, i === 0 || (model.grid.month && day === model.grid.month.first)),
          'aria-label': (today ? t('Today') + ', ' : '') + model.dayLabel(day), title: t('Show the week of {date}', { date: model.fmtDay(day) }), tabindex: '-1',
          onclick: () => on.onDay?.(day),
        }),
        model.canAdd ? el('button', {
          type: 'button', class: 'ps-cal__add', text: '+', tabindex: '-1',
          'aria-label': t('Add a task on {date}', { date: model.dayLabel(day) }), title: t('Add a task on {date}', { date: model.fmtDay(day) }),
          onclick: (e) => { e.stopPropagation(); on.onNewOn?.(day); },
        }) : null,
      ]);
      if (model.canAdd) cell.addEventListener('dblclick', (e) => { if (e.target === cell) on.onNewOn?.(day); });
      dayNodes.set(day, cell);
      node.appendChild(cell);
    });
    for (const seg of w.segments) node.appendChild(chip(seg, w));
    w.more.forEach((n, i) => {
      if (n) node.appendChild(el('button', {
        type: 'button', class: 'ps-cal__more', text: t('+{n} more', { n }), style: { gridColumn: String(i + 1), gridRow: String(tracks + 2) }, tabindex: '-1',
        'aria-label': tn(n, '{n} more task on {date}, show the week', '{n} more tasks on {date}, show the week').replace('{date}', model.fmtDay(w.days[i])),
        onclick: () => on.onDay?.(w.days[i]),
      }));
    });
    weekNodes.push({ start: w.start, node });
    return node;
  }

  function render() {
    const focused = document.activeElement?.closest?.('.ps-cal__chip')?.dataset.id;
    const hadFocus = root.contains(document.activeElement);
    root.dataset.mode = model.mode;
    root.className = 'ps-cal ps-cal--' + model.mode;
    drawHead();
    weekNodes = [];
    dayNodes = new Map();
    clear(weeks).append(...model.grid.weeks.map(weekNode));
    // one tab stop: the selected task's bar, else the first; the arrow keys go from there
    const chips = orderedChips();
    const stop = chips.find((c) => c.dataset.id === String(model.selectedId)) || chips[0];
    if (stop) stop.tabIndex = 0;
    if (focused) weeks.querySelector(`.ps-cal__chip[data-id="${focused}"]`)?.focus({ preventScroll: true });
    // A bar that moved out of this month or week took the focus with it: keep it here, so Ctrl+Z and the arrows still work.
    if (hadFocus && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
  }

  /** The bars in reading order, a task that runs over several weeks once. */
  function orderedChips() {
    const seen = new Set();
    return [...weeks.querySelectorAll('.ps-cal__chip')].filter((c) => !seen.has(c.dataset.id) && seen.add(c.dataset.id));
  }

  // ---- dragging -------------------------------------------------------------------------------------------
  function dayAt(x, y) {
    if (!weekNodes.length) return null;
    let hit = weekNodes[0], best = Infinity;
    for (const w of weekNodes) {
      const r = w.node.getBoundingClientRect();
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < best) { best = d; hit = w; }
    }
    const r = hit.node.getBoundingClientRect();
    const col = Math.max(0, Math.min(6, Math.floor(((x - r.left) / r.width) * 7)));
    return hit.start + col;
  }

  function pressed(e, seg) {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0) || !model.canDrag(seg.task)) return;
    drag = { id: seg.task.id, task: seg.task, x: e.clientX, y: e.clientY, grab: dayAt(e.clientX, e.clientY), type: e.pointerType, pointerId: e.pointerId, node: e.currentTarget, active: false, delta: 0, timer: 0 };
    if (drag.type !== 'mouse') drag.timer = setTimeout(() => { if (drag && !drag.active) begin(); }, HOLD_MS);
    window.addEventListener('pointermove', moved);
    window.addEventListener('pointerup', released);
    window.addEventListener('pointercancel', cancelled);
    document.addEventListener('keydown', escape, true);
  }

  function begin() {
    drag.active = true;
    try { drag.node.setPointerCapture(drag.pointerId); } catch { /* the pointer is gone */ }
    drag.node.classList.add('is-dragging');
    root.classList.add('is-dragging');
    ghost = el('div', { class: 'ps-cal__ghost', 'aria-hidden': 'true' });
    document.body.appendChild(ghost);
  }

  function moved(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const travelled = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.active) {
      if (drag.type === 'mouse' ? travelled > MOVE_MOUSE : travelled > 8) { if (drag.type === 'mouse') begin(); else { stop(); return; } }
      else return;
    }
    const day = dayAt(e.clientX, e.clientY);
    drag.delta = day == null ? 0 : day - drag.grab;
    const a = drag.task.start + drag.delta, b = drag.task.end + drag.delta;
    for (const [d, node] of dayNodes) node.classList.toggle('is-drop', drag.delta !== 0 && d >= a && d <= b);
    ghost.textContent = `${drag.task.title || t('(no name)')} · ${model.fmtRange(a, b)}`;
    ghost.style.left = Math.min(window.innerWidth - ghost.offsetWidth - 8, e.clientX + 14) + 'px';
    ghost.style.top = Math.min(window.innerHeight - ghost.offsetHeight - 8, e.clientY + 16) + 'px';
  }

  function released() {
    if (!drag) return;
    const { active, id, delta } = drag;
    stop();
    if (!active) return;
    swallowClick();
    if (delta) on.onMove?.({ id, delta });
  }
  /** The release that ends a drag is also a click on the bar it began on: swallow it. */
  function swallowClick() {
    suppressClick = true;
    const off = () => { window.removeEventListener('pointerup', off, true); setTimeout(() => { suppressClick = false; }, 0); };
    window.addEventListener('pointerup', off, true);
  }
  const cancelled = () => { if (drag) stop(); };
  const escape = (e) => { if (e.key === 'Escape' && drag?.active) { e.preventDefault(); e.stopPropagation(); swallowClick(); stop(); } };

  /** End a press, a drag or not, and draw what arrived meanwhile. */
  function stop() {
    clearTimeout(drag.timer);
    drag.node.classList.remove('is-dragging');
    root.classList.remove('is-dragging');
    for (const node of dayNodes.values()) node.classList.remove('is-drop');
    ghost?.remove();
    ghost = null;
    window.removeEventListener('pointermove', moved);
    window.removeEventListener('pointerup', released);
    window.removeEventListener('pointercancel', cancelled);
    document.removeEventListener('keydown', escape, true);
    drag = null;
    if (pending) { const next = pending; pending = null; update(next); }
  }
  // a touch drag must not also scroll the page
  root.addEventListener('touchmove', (e) => { if (drag?.active) e.preventDefault(); }, { passive: false });

  // ---- keys -----------------------------------------------------------------------------------------------
  root.addEventListener('keydown', (e) => {
    if (!model) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); (e.shiftKey ? on.onRedo : on.onUndo)?.(); return; }
    if (mod && key === 'y') { e.preventDefault(); on.onRedo?.(); return; }
    if (mod) return;
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); on.onNav?.(e.key === 'PageUp' ? -1 : 1); return; }
    const chipNode = document.activeElement?.closest?.('.ps-cal__chip');
    if (!chipNode || !e.key.startsWith('Arrow')) return;
    const id = Number(chipNode.dataset.id);
    if (e.altKey) {
      e.preventDefault();
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      const task = model.grid.weeks.flatMap((w) => w.segments).find((s) => s.task.id === id)?.task;
      if (task && model.canDrag(task)) on.onMove?.({ id, delta });
      return;
    }
    const chips = orderedChips();
    const at = chips.findIndex((c) => c.dataset.id === chipNode.dataset.id);
    const next = chips[Math.max(0, Math.min(chips.length - 1, at + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next || next === chips[at]) return;
    e.preventDefault();
    for (const c of chips) c.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
    on.onSelect?.(Number(next.dataset.id));
    on.onAnnounce?.(next.getAttribute('aria-label'));
  });

  // ---- API ------------------------------------------------------------------------------------------------
  function update(next) {
    if (drag?.active) { pending = next; return; }
    model = next;
    render();
  }
  return {
    update,
    reveal(id) {
      const node = weeks.querySelector(`.ps-cal__chip[data-id="${id}"]`);
      if (node) node.scrollIntoView({ block: 'nearest' }); else on.onFind?.(id);
    },
    scrollToToday() { on.onToday?.(); },
    focus() { (weeks.querySelector('.ps-cal__chip[tabindex="0"]') || root).focus?.({ preventScroll: true }); },
    destroy() { if (drag) stop(); clear(host); },
  };
}
