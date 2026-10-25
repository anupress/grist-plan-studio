// A small menu that opens at a point (a right-click on a task) or under a button (the toolbar's More). Keyboard: arrows move,
// Enter or Space does it, Escape closes and the focus goes back to where it was. One menu is open at a time.

import { el } from '../core/util.js';

let open = null;

/** Close the menu that is open, if any. */
export function closeMenu() { if (open) open(); }

/**
 * @param host   the element the menu is drawn in (the app; its box is the frame the point is measured against)
 * @param opts   {x, y: a point in the window (clientX/clientY), items: [{label, onClick, hint?, disabled?, danger?} | {separator: true}],
 *                label: what the menu is for (read by a screen reader), anchor: the button that opened it (focus goes back to it)}
 */
export function openMenu(host, { x, y, items, label = '', anchor = null }) {
  closeMenu();
  const before = anchor || document.activeElement;
  // no separator first, last or twice in a row (what an item left out would leave behind)
  const list = [];
  for (const it of items) {
    if (!it || !(it.separator || it.label)) continue;
    if (it.separator && (!list.length || list[list.length - 1].separator)) continue;
    list.push(it);
  }
  while (list.length && list[list.length - 1].separator) list.pop();
  const nodes = [];
  const menu = el('div', { class: 'ps-menu', role: 'menu', 'aria-label': label || null }, list.map((it) => {
    if (it.separator) return el('div', { class: 'ps-menu__sep', role: 'separator' });
    const node = el('button', {
      type: 'button', role: 'menuitem', class: 'ps-menu__item' + (it.danger ? ' is-danger' : ''), disabled: it.disabled ? true : null, tabindex: '-1',
      onclick: () => { done(false); it.onClick?.(); },
    }, [el('span', { class: 'ps-menu__text', text: it.label }), it.hint ? el('span', { class: 'ps-menu__hint', text: it.hint }) : null]);
    nodes.push(node);
    return node;
  }));
  host.append(menu);
  // inside the app's frame, and kept inside it when the point is near an edge
  const frame = host.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const left = Math.max(4, Math.min(x - frame.left, frame.width - w - 4));
  const top = Math.max(4, Math.min(y - frame.top, frame.height - h - 4));
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  const enabled = () => nodes.filter((n) => !n.disabled);
  const move = (step) => {
    const list2 = enabled();
    if (!list2.length) return;
    const at = list2.indexOf(document.activeElement);
    list2[(at + step + list2.length) % list2.length].focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); enabled()[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); enabled().slice(-1)[0]?.focus(); }
    else if (e.key === 'Tab') { done(false); }
  };
  const onDown = (e) => { if (!menu.contains(e.target)) done(false); };
  const onOther = () => done(false);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('blur', onOther);
  window.addEventListener('resize', onOther);
  host.addEventListener('scroll', onOther, true);
  function done(restoreFocus) {
    if (open !== done) return;
    open = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('blur', onOther);
    window.removeEventListener('resize', onOther);
    host.removeEventListener('scroll', onOther, true);
    menu.remove();
    if (restoreFocus && before && typeof before.focus === 'function' && document.contains(before)) before.focus({ preventScroll: true });
  }
  open = done;
  enabled()[0]?.focus();
  return { close: () => done(false) };
}
