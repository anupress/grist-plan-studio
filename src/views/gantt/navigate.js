// Getting around the Gantt chart and the timeline (M21), shared by both:
//
//   drag the empty part of the chart      move across it (a mouse or a pen; a finger already scrolls it)
//   Ctrl + wheel, or a pinch              zoom, keeping the day under the pointer where it is
//   drag the edge of the names, in the    change the width of the names; the arrow keys do it too (Shift for big steps),
//   heading                               a double click or Home puts it back
//
// A view hands over its scroll box and its chart and says what each gesture means (zoom a step, take this width); this
// file draws nothing but the splitter, and writes nothing.

import { el } from '../../core/util.js';
import { dayAt } from './layout.js';
import { t } from '../../i18n/index.js';

export const NAMES_MIN = 140;
/** The widest the names may be: 720 px, and always a good part of the box left for the chart. */
export const clampNames = (w, boxW) => Math.round(Math.max(NAMES_MIN, Math.min(720, Math.max(NAMES_MIN, boxW - 160), w)));

/**
 * @param o {scroll, chart, root, getFrame(), getNamesW(), setNamesLive(w), onZoomStep(dir), onNamesWidth(w | null)}
 * @returns {{splitter: HTMLElement, takeAnchor(): {day, x} | null}}
 */
export function createNavigation(o) {
  const { scroll, chart, root } = o;

  // ---- drag to move across ------------------------------------------------------------------------------
  let pan = null;
  chart.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch' || e.defaultPrevented) return;
    if (e.target.closest && e.target.closest('[data-id], [data-toggle], .ps-arrow__hit')) return;
    e.preventDefault();   // no text selection while dragging
    scroll.focus({ preventScroll: true });
    pan = { x: e.clientX, y: e.clientY, left: scroll.scrollLeft, top: scroll.scrollTop, id: e.pointerId, moved: false };
  });
  chart.addEventListener('pointermove', (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      pan.moved = true;
      root.classList.add('is-panning');
      try { chart.setPointerCapture(pan.id); } catch { /* fine without */ }
    }
    scroll.scrollLeft = pan.left - dx;
    scroll.scrollTop = pan.top - dy;
  });
  const endPan = () => {
    if (!pan) return;
    try { chart.releasePointerCapture(pan.id); } catch { /* released already */ }
    root.classList.remove('is-panning');
    pan = null;
  };
  chart.addEventListener('pointerup', endPan);
  chart.addEventListener('pointercancel', endPan);

  // ---- Ctrl + wheel zooms around the pointer ------------------------------------------------------------
  let anchor = null, anchorTimer = 0, acc = 0;
  scroll.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;   // the plain wheel, and Shift + wheel, scroll as they always did
    e.preventDefault();
    // a mouse wheel is a step a click; a trackpad's pinch is many small ones, so they are added up
    acc += e.deltaY * (e.deltaMode === 1 ? 33 : 1);
    if (Math.abs(acc) < 50) return;
    const dir = acc > 0 ? 1 : -1;
    acc = 0;
    const frame = o.getFrame();
    const x = e.clientX - scroll.getBoundingClientRect().left - o.getNamesW();
    if (frame && x >= 0) {
      anchor = { day: dayAt(frame, scroll.scrollLeft + x), x };
      clearTimeout(anchorTimer);
      anchorTimer = setTimeout(() => { anchor = null; }, 500);
    }
    o.onZoomStep?.(dir);
  }, { passive: false });

  // ---- the width of the names ---------------------------------------------------------------------------
  const splitter = el('div', {
    class: 'ps-split', role: 'separator', 'aria-orientation': 'vertical', tabindex: '0',
    'aria-label': t('Width of the names'), title: t('Drag to change the width of the names. Double-click to reset.'),
  });
  const boxW = () => scroll.clientWidth || 900;
  splitter.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const w0 = o.getNamesW(), x0 = e.clientX;
    let now = w0;
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('is-dragging');
    const move = (ev) => { now = clampNames(w0 + ev.clientX - x0, boxW()); o.setNamesLive(now); };
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      splitter.removeEventListener('pointercancel', up);
      splitter.classList.remove('is-dragging');
      try { splitter.releasePointerCapture(e.pointerId); } catch { /* released already */ }
      if (now !== w0) o.onNamesWidth?.(now);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
    splitter.addEventListener('pointercancel', up);
  });
  splitter.addEventListener('dblclick', () => o.onNamesWidth?.(null));
  splitter.addEventListener('keydown', (e) => {
    // the heading is drawn again with every change, which takes the focus away: it is given back at once
    const again = () => splitter.focus({ preventScroll: true });
    if (e.key === 'Home') { e.preventDefault(); o.onNamesWidth?.(null); again(); return; }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? 64 : 16) * (e.key === 'ArrowLeft' ? -1 : 1);
    o.onNamesWidth?.(clampNames(o.getNamesW() + step, boxW()));
    again();
  });

  return { splitter, takeAnchor() { const a = anchor; anchor = null; return a; } };
}
