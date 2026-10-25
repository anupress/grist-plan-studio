// The board: one lane per value of a column, one card per row. Drawing and gestures only; what a
// gesture writes is decided in model/board.js and main.js.
//
//   drag a card              to another lane (writes the lane column) or up and down (writes the rank)
//   click / arrow keys       select (Grist's cursor follows)
//   Enter                    quick edit           double-click     Grist's record card
//   Alt + arrows             move the selected card one lane across, or one place up or down
//   the count in a lane      set the lane's limit of open cards
//   Add card                 a new row in that lane; Enter adds and keeps the box open for the next
//
// Drag uses Sortable.js (vendor/, MIT), in its fallback mode so the card under the pointer is the
// card itself rather than the browser's translucent drag image.

import { el, clear } from '../../core/util.js';
import { initials } from '../../model/board.js';
import { t, tn } from '../../i18n/index.js';

const CAP = 150;   // cards drawn per lane before a "Show all" button

/**
 * @param on {onSelect(id), onOpen(id), onQuickEdit(id), onMove({id, toKey, index}), onAdd({laneKey, title}),
 *            onLimit(laneKey), onUndo(), onRedo()}
 */
export function createBoard(host, on) {
  // model: {lanes, editable, rankable, canAdd, canLimit, selectedId, laneLabel, fmtDay(d), fmtRange(a, b), today, fmtHours(h)}
  let model = null;
  let pending = null;                // a model that arrived mid-drag, drawn when the drag ends
  let dragging = false;
  let sortables = [];
  let adding = null;                 // {laneKey, value}: the open "Add card" box survives a redraw
  const expanded = new Set();        // lanes showing all their cards
  const nodes = new Map();           // card id -> element

  const root = el('div', { class: 'ps-board', tabindex: '0', role: 'region', 'aria-label': t('Board') });
  const lanesBox = el('div', { class: 'ps-board__lanes' });
  root.append(lanesBox);
  clear(host).append(root);

  const Sortable = typeof window !== 'undefined' ? window.Sortable : null;

  // ---- drawing ---------------------------------------------------------------------------------------
  function personChip(name) {
    // Initials in plain ink: the stripe already carries a colour, and a second one per person turned every card into confetti.
    return el('span', { class: 'ps-av', title: name, 'aria-hidden': 'true' }, [initials(name)]);
  }

  function whenText(card) {
    const m = model;
    let date = null, deadline = null;
    if (card.due != null) { date = t('Due {date}', { date: m.fmtDay(card.due) }); deadline = card.due; }
    else if (card.span) { date = m.fmtRange(card.span[0], card.span[1]); deadline = card.span[1]; }
    if (!date) return null;
    const late = card.late > 0;
    const today = card.late === 0 && deadline === m.today;
    return el('span', { class: 'ps-card__when' + (late ? ' is-late' : today ? ' is-today' : '') }, [
      el('span', { class: 'ps-card__date', text: date }),
      late ? el('span', { class: 'ps-card__late', text: lateText(card.late), title: tn(card.late, '{n} day late', '{n} days late') }) : null,
      today ? el('span', { class: 'ps-card__late', text: t('today') }) : null,
    ]);
  }

  /** Hours logged against the plan (time tracking): "12 of 20 h", and "4 over" in words when it is. */
  function timeLine(card) {
    const tm = card.time;
    if (!tm || !(tm.logged > 0.004) || !model.fmtHours) return null;
    const H = model.fmtHours;
    const over = tm.planned && tm.logged > tm.planned + 0.004;
    return el('p', { class: 'ps-card__time' + (over ? ' is-over' : '') }, [
      el('span', { text: tm.planned ? t('{logged} of {planned} h logged', { logged: H(tm.logged), planned: H(tm.planned) }) : t('{logged} h logged', { logged: H(tm.logged) }) }),
      over ? el('span', { class: 'ps-card__over', text: t('{h} over', { h: H(tm.logged - tm.planned) }) }) : null,
    ]);
  }

  function cardNode(card) {
    const people = card.people.slice(0, 3);
    const more = card.people.length - people.length;
    const label = [card.title || t('(no name)'), card.done ? t('done') : null, card.people.join(', ') || null].filter(Boolean).join(', ');
    const node = el('article', {
      class: 'ps-card' + (card.done ? ' is-done' : '') + (card.colour ? ' has-stripe' : '') + (card.id === model.selectedId ? ' is-selected' : ''),
      dataset: { id: String(card.id) }, tabindex: '-1', 'aria-label': label, 'aria-selected': card.id === model.selectedId ? 'true' : 'false',
      style: card.colour ? { '--stripe': card.colour } : {},
    }, [
      el('div', { class: 'ps-card__title' }, [
        card.done ? el('span', { class: 'ps-card__tick', 'aria-hidden': 'true' }) : null,
        el('span', { text: card.title || t('(no name)') }),
      ]),
      card.fields.length ? el('dl', { class: 'ps-card__fields' }, card.fields.map((f) => el('div', { class: 'ps-card__field' }, [
        el('dt', { text: f.label }), el('dd', { text: f.text }),
      ]))) : null,
      timeLine(card),
      (() => {
        const when = whenText(card);
        if (!when && !people.length) return null;
        return el('div', { class: 'ps-card__meta' }, [
          when || el('span'),
          people.length ? el('span', { class: 'ps-card__people', title: card.people.join(', ') }, [
            ...people.map(personChip),
            more > 0 ? el('span', { class: 'ps-av ps-av--more', text: '+' + more }) : null,
          ]) : null,
        ]);
      })(),
      card.progress != null && card.progress > 0 && !card.done
        ? el('div', { class: 'ps-card__progress', 'aria-hidden': 'true' }, [el('span', { style: { width: Math.round(card.progress * 100) + '%' } })]) : null,
    ]);
    nodes.set(card.id, node);
    return node;
  }

  function laneNode(lane) {
    const name = lane.none ? t('No {col}', { col: model.laneLabel }) : String(lane.label ?? '');
    const count = lane.limit != null ? `${lane.open}/${lane.limit}` : lane.hidden ? t('{n} of {total}', { n: lane.cards.length, total: lane.total }) : String(lane.cards.length);
    const countTitle = (lane.limit != null
      ? t('{open} open cards, limit {limit}.', { open: lane.open, limit: lane.limit })
      : tn(lane.cards.length, '{n} card.', '{n} cards.'))
      + (lane.hidden ? ' ' + tn(lane.hidden, '{n} card is hidden by the filters.', '{n} cards are hidden by the filters.') : '');
    const countNode = model.canLimit && !lane.none
      ? el('button', { type: 'button', class: 'ps-lane__count', text: count, title: countTitle + ' ' + t('Click to set a limit of open cards.'), onclick: () => on.onLimit?.(lane.key) })
      : el('span', { class: 'ps-lane__count', text: count, title: countTitle });

    const shown = expanded.has(lane.key) ? lane.cards : lane.cards.slice(0, CAP);
    const list = el('div', { class: 'ps-lane__list', dataset: { lane: lane.key }, role: 'list', 'aria-label': name },
      shown.map((c) => { const n = cardNode(c); n.setAttribute('role', 'listitem'); return n; }));
    if (!lane.cards.length) list.append(el('p', { class: 'ps-lane__empty', text: lane.hidden ? tn(lane.hidden, '{n} card is hidden by the filters.', '{n} cards are hidden by the filters.') : t('No cards') }));
    if (shown.length < lane.cards.length) {
      list.append(el('button', { type: 'button', class: 'ps-lane__more', text: t('Show all {n}', { n: lane.cards.length }),
        onclick: () => { expanded.add(lane.key); draw(); } }));
    }

    const head = el('header', { class: 'ps-lane__head', style: lane.colour ? { '--lane': lane.colour } : {} }, [
      el('h3', { class: 'ps-lane__name', text: name, title: name }),
      countNode,
    ]);
    return el('section', { class: 'ps-lane' + (lane.over ? ' is-over' : '') + (lane.none ? ' is-none' : ''), dataset: { lane: lane.key } }, [
      head,
      lane.over ? el('p', { class: 'ps-lane__over', text: tn(lane.over, '{n} over the limit', '{n} over the limit') }) : null,
      list,
      model.canAdd ? addBox(lane) : null,
    ]);
  }

  function addBox(lane) {
    const foot = el('div', { class: 'ps-lane__foot' });
    const openBox = (value = '') => {
      adding = { laneKey: lane.key, value };
      const input = el('textarea', { class: 'ps-lane__input', rows: '2', placeholder: t('Card name'), 'aria-label': t('New card in {lane}', { lane: lane.label ?? t('No {col}', { col: model.laneLabel }) }) });
      input.value = value;
      const submit = () => {
        const title = input.value.trim();
        if (!title) return;
        input.value = '';
        adding = { laneKey: lane.key, value: '' };
        on.onAdd?.({ laneKey: lane.key, title });
      };
      input.addEventListener('input', () => { if (adding) adding.value = input.value; });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); adding = null; draw(); root.focus({ preventScroll: true }); }
      });
      clear(foot).append(input, el('div', { class: 'ps-lane__addbar' }, [
        el('button', { type: 'button', class: 'ps-btn ps-btn--primary ps-btn--sm', text: t('Add'), onclick: () => { submit(); input.focus(); } }),
        el('span', { class: 'ps-lane__hint', text: t('Enter adds, Esc closes') }),
      ]));
      return input;
    };
    if (adding?.laneKey === lane.key) {
      const input = openBox(adding.value);
      requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
    } else {
      foot.append(el('button', { type: 'button', class: 'ps-lane__add', onclick: () => { const i = openBox(); i.focus(); } }, [
        el('span', { class: 'ps-lane__plus', 'aria-hidden': 'true' }), el('span', { text: t('Add card') }),
      ]));
    }
    return foot;
  }

  function draw() {
    if (!model) return;
    const scrollX = root.scrollLeft;
    const scrollY = new Map([...lanesBox.querySelectorAll('.ps-lane__list')].map((l) => [l.dataset.lane, l.scrollTop]));
    const hadFocus = root.contains(document.activeElement) && document.activeElement !== root;
    for (const s of sortables) s.destroy();
    sortables = [];
    nodes.clear();
    clear(lanesBox).append(...model.lanes.map(laneNode));
    root.classList.toggle('is-editable', !!model.editable);
    root.scrollLeft = scrollX;
    for (const l of lanesBox.querySelectorAll('.ps-lane__list')) if (scrollY.has(l.dataset.lane)) l.scrollTop = scrollY.get(l.dataset.lane);
    if (hadFocus && !adding && model.selectedId != null) nodes.get(model.selectedId)?.focus({ preventScroll: true });
    if (model.editable && Sortable) attachDrag();
  }

  function attachDrag() {
    for (const list of lanesBox.querySelectorAll('.ps-lane__list')) {
      sortables.push(Sortable.create(list, {
        // A lane column that is a formula can't be written: cards may then only move up and down.
        group: model.laneLocked ? 'ps-lane-' + list.dataset.lane : 'ps-board',
        draggable: '.ps-card',
        filter: '.ps-lane__more, .ps-lane__empty',
        preventOnFilter: false,
        // no sliding cards for someone who asked the system for less motion
        animation: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140,
        easing: 'cubic-bezier(.2, .7, .3, 1)',
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 4,
        delayOnTouchOnly: true,
        delay: 160,
        emptyInsertThreshold: 40,
        scrollSensitivity: 60,
        bubbleScroll: true,
        ghostClass: 'is-ghost',
        chosenClass: 'is-chosen',
        dragClass: 'is-dragged',
        fallbackClass: 'is-lifted',
        onStart: () => { dragging = true; root.classList.add('is-dragging'); },
        onEnd: (evt) => {
          dragging = false;
          root.classList.remove('is-dragging');
          const id = Number(evt.item.dataset.id);
          const toKey = evt.to.dataset.lane;
          const moved = evt.from !== evt.to || evt.oldDraggableIndex !== evt.newDraggableIndex;
          // Sortable has moved the element; the drawing goes back to the model's order until the write lands.
          const next = pending || model;
          pending = null;
          model = next;
          draw();
          if (moved) on.onMove?.({ id, toKey, index: evt.newDraggableIndex });
        },
      }));
    }
  }

  // ---- selecting, keyboard ------------------------------------------------------------------------------
  const cardAt = (target) => target.closest?.('.ps-card');
  root.addEventListener('click', (e) => {
    const n = cardAt(e.target);
    if (n) on.onSelect?.(Number(n.dataset.id));
  });
  root.addEventListener('dblclick', (e) => {
    const n = cardAt(e.target);
    if (n) on.onOpen?.(Number(n.dataset.id));
  });

  /** Where the selected card is: [lane index, card index]. */
  function position() {
    const id = model?.selectedId;
    if (id == null) return null;
    for (let i = 0; i < model.lanes.length; i++) {
      const j = model.lanes[i].cards.findIndex((c) => c.id === id);
      if (j >= 0) return [i, j];
    }
    return null;
  }

  root.addEventListener('keydown', (e) => {
    if (!model || e.target.closest('.ps-lane__foot')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); (e.shiftKey ? on.onRedo : on.onUndo)?.(); return; }
    if (mod && key === 'y') { e.preventDefault(); on.onRedo?.(); return; }
    if (mod) return;
    const lanes = model.lanes;
    const pos = position();
    const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (e.altKey && pos && arrows.includes(e.key)) {
      e.preventDefault();
      if (!model.editable) return;
      const [li, ci] = pos;
      const card = lanes[li].cards[ci];
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const to = ci + (e.key === 'ArrowUp' ? -1 : 1);
        if (to >= 0 && to < lanes[li].cards.length) on.onMove?.({ id: card.id, toKey: lanes[li].key, index: to });
      } else {
        const lj = li + (e.key === 'ArrowLeft' ? -1 : 1);
        if (lj >= 0 && lj < lanes.length && !model.laneLocked) on.onMove?.({ id: card.id, toKey: lanes[lj].key, index: lanes[lj].cards.length });
      }
      return;
    }
    if (e.altKey) return;
    const pick = (li, ci) => {
      const lane = lanes[li];
      if (!lane?.cards.length) return false;
      e.preventDefault();
      on.onSelect?.(lane.cards[Math.max(0, Math.min(lane.cards.length - 1, ci))].id);
      return true;
    };
    if (!pos) {
      if (arrows.includes(e.key) || e.key === 'Home') { const li = lanes.findIndex((l) => l.cards.length); if (li >= 0) pick(li, 0); }
      return;
    }
    const [li, ci] = pos;
    if (e.key === 'ArrowDown') pick(li, ci + 1);
    else if (e.key === 'ArrowUp') pick(li, ci - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // the nearest lane that has cards, at the same height where it can
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      for (let lj = li + step; lj >= 0 && lj < lanes.length; lj += step) if (pick(lj, ci)) break;
    } else if (e.key === 'Home') pick(li, 0);
    else if (e.key === 'End') pick(li, lanes[li].cards.length - 1);
    else if (e.key === 'Enter') { e.preventDefault(); on.onQuickEdit?.(lanes[li].cards[ci].id); }
  });

  // ---- API -----------------------------------------------------------------------------------------------
  function update(next) {
    if (dragging) { pending = next; return; }
    model = next;
    draw();
  }
  function reveal(id) {
    const n = nodes.get(id);
    if (!n) {
      // past the cap of its lane: open the lane up
      const lane = model?.lanes.find((l) => l.cards.some((c) => c.id === id));
      if (!lane || expanded.has(lane.key)) return;
      expanded.add(lane.key);
      draw();
      return reveal(id);
    }
    n.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (root.contains(document.activeElement) && !adding) n.focus({ preventScroll: true });
  }

  return {
    update,
    reveal,
    focus: () => root.focus({ preventScroll: true }),
    isDragging: () => dragging,
    destroy: () => { for (const s of sortables) s.destroy(); sortables = []; clear(host); },
  };
}

/** How late, in the unit a person would say it: days for two weeks, then weeks, months, years. */
function lateText(days) {
  if (days < 14) return tn(days, '{n} day late', '{n} days late');
  if (days < 70) return tn(Math.round(days / 7), '{n} week late', '{n} weeks late');
  if (days < 730) return tn(Math.round(days / 30.44), '{n} month late', '{n} months late');
  return tn(Math.floor(days / 365.25), '{n} year late', '{n} years late');
}
