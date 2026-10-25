// The board: one lane per value of a column, one card per row. Drawing and gestures only; what a
// gesture writes is decided in model/board.js and main.js.
//
//   drag a card              to another lane (writes the lane column) or up and down (writes the rank)
//   drag one of several selected cards: they all go, one after the other
//   swimlanes                rows of lanes, one band for each value of a second column; a drop into another band writes that column too
//   fold a lane              the lane shrinks to a strip with its count; it still takes drops, at the end
//   click / arrow keys       select (Grist's cursor follows)
//   Enter                    quick edit           double-click     Grist's record card
//   Alt + arrows             move the selected card one lane across, or one place up or down
//   Alt + Shift + up / down  with swimlanes, move the selected card to the next band
//   the count in a lane      set the lane's limit of open cards
//   Add card                 a new row in that lane (and band); Enter adds and keeps the box open for the next
//
// Drag uses Sortable.js (vendor/, MIT), in its fallback mode so the card under the pointer is the
// card itself rather than the browser's translucent drag image.

import { el, clear } from '../../core/util.js';
import { initials } from '../../model/board.js';
import { t, tn } from '../../i18n/index.js';

const CAP = 150;   // cards drawn per cell before a "Show all" button
const SEP = '\u0001';
const AT_END = 1e9;   // a drop on a folded lane has no place among cards that are not drawn: it goes last

/**
 * @param on {onSelect(id), onOpen(id), onQuickEdit(id), onMove({id, ids?, toKey, swimKey?, index}), onAdd({laneKey, swimKey?, title}),
 *            onLimit(laneKey), onFold(laneKey), onUndo(), onRedo()}
 */
export function createBoard(host, on) {
  // model: {lanes, swims: [{key, label, none, lanes: [{key, cards}]}] (one band without swimlanes), swimmed, swimLabel, folded: Set of lane keys,
  //         editable, laneLocked, swimLocked, canAdd, canLimit, selectedId, laneLabel, fmtDay(d), fmtRange(a, b), today, fmtHours(h)}
  let model = null;
  let pending = null;                // a model that arrived mid-drag, drawn when the drag ends
  let mates = [];                    // the other selected cards that go with the one being dragged
  let dragging = false;
  let sortables = [];
  let adding = null;                 // {laneKey, swimKey, value}: the open "Add card" box survives a redraw
  let revealAfter = null;            // a card in a folded lane: the lane opens, then the card is scrolled to
  const expanded = new Set();        // cells showing all their cards
  const nodes = new Map();           // card id -> element

  const root = el('div', { class: 'ps-board', tabindex: '0', role: 'region', 'aria-label': t('Board') });
  const lanesBox = el('div', { class: 'ps-board__lanes' });
  root.append(lanesBox);
  clear(host).append(root);

  const Sortable = typeof window !== 'undefined' ? window.Sortable : null;

  const folded = (lane) => !!model.folded?.has(lane.key);
  const cellKey = (laneKey, swimKey) => laneKey + SEP + (swimKey ?? '');
  const laneName = (lane) => (lane.none ? t('No {col}', { col: model.laneLabel }) : String(lane.label ?? ''));
  const bandName = (band) => (band.none ? t('No {col}', { col: model.swimLabel }) : String(band.label ?? ''));

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

  /** A task with sub-tasks says how many are done, in words with a short bar beside them. */
  function subLine(card) {
    const s = card.sub;
    if (!s || !s.total) return null;
    return el('p', { class: 'ps-card__sub' + (s.done >= s.total ? ' is-all' : '') }, [
      el('span', { class: 'ps-card__subbar', 'aria-hidden': 'true' }, [el('span', { style: { width: Math.round((100 * s.done) / s.total) + '%' } })]),
      el('span', { text: s.total === 1 ? t('{done} of 1 sub-task done', { done: s.done }) : t('{done} of {total} sub-tasks done', { done: s.done, total: s.total }) }),
    ]);
  }

  /** The checklist in the card's words: how many items are ticked, with a short bar beside them. */
  function checkLine(card) {
    const c = card.checks;
    if (!c || !c.total) return null;
    return el('p', { class: 'ps-card__sub ps-card__checks' + (c.done >= c.total ? ' is-all' : '') }, [
      el('span', { class: 'ps-card__subbar', 'aria-hidden': 'true' }, [el('span', { style: { width: Math.round((100 * c.done) / c.total) + '%' } })]),
      el('span', { text: t('{done} of {total} checked', { done: c.done, total: c.total }) }),
    ]);
  }

  function cardNode(card) {
    const people = card.people.slice(0, 3);
    const more = card.people.length - people.length;
    const label = [card.title || t('(no name)'), card.done ? t('done') : null, card.people.join(', ') || null].filter(Boolean).join(', ');
    const node = el('article', {
      class: 'ps-card' + (card.done ? ' is-done' : '') + (card.colour ? ' has-stripe' : '') + (card.id === model.selectedId || model.multi?.has(card.id) ? ' is-selected' : ''),
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
      subLine(card),
      checkLine(card),
      card.overDeadline ? el('p', { class: 'ps-card__blocked', text: tn(card.overDeadline, 'Ends {n} day after its due date', 'Ends {n} days after its due date') }) : null,
      card.blocked ? el('p', { class: 'ps-card__blocked', text: t('Blocked') }) : null,
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

  /** The chevron that folds a lane. */
  function foldButton(lane) {
    const f = folded(lane);
    const label = f ? t('Unfold {name}', { name: laneName(lane) }) : t('Fold {name}', { name: laneName(lane) });
    return el('button', {
      type: 'button', class: 'ps-caret ps-lane__fold', 'aria-expanded': f ? 'false' : 'true', 'aria-label': label, title: label,
      onclick: () => on.onFold?.(lane.key),
    }, [el('span', { class: 'ps-caret__chevron' + (f ? ' is-folded' : ''), 'aria-hidden': 'true' })]);
  }

  function laneHead(lane) {
    const name = laneName(lane);
    const f = folded(lane);
    const count = lane.limit != null ? `${lane.open}/${lane.limit}` : lane.hidden ? t('{n} of {total}', { n: lane.cards.length, total: lane.total }) : String(lane.cards.length);
    const countTitle = (lane.limit != null
      ? t('{open} open cards, limit {limit}.', { open: lane.open, limit: lane.limit })
      : tn(lane.cards.length, '{n} card.', '{n} cards.'))
      + (lane.hidden ? ' ' + tn(lane.hidden, '{n} card is hidden by the filters.', '{n} cards are hidden by the filters.') : '');
    const countNode = model.canLimit && !lane.none && !f
      ? el('button', { type: 'button', class: 'ps-lane__count', text: count, title: countTitle + ' ' + t('Click to set a limit of open cards.'), onclick: () => on.onLimit?.(lane.key) })
      : el('span', { class: 'ps-lane__count', text: count, title: countTitle });
    return el('header', { class: 'ps-lane__head' + (f ? ' is-folded' : ''), style: lane.colour ? { '--lane': lane.colour } : {} }, [
      foldButton(lane),
      el('h3', { class: 'ps-lane__name', text: name, title: name }),
      countNode,
    ]);
  }

  const overNote = (lane) => (lane.over && !folded(lane) ? el('p', { class: 'ps-lane__over', text: tn(lane.over, '{n} over the limit', '{n} over the limit') }) : null);

  /** The cards of one lane in one band (the only band without swimlanes). */
  function listNode(lane, band, cards) {
    const swimKey = model.swimmed ? band.key : null;
    const f = folded(lane);
    const label = model.swimmed ? `${bandName(band)}, ${laneName(lane)}` : laneName(lane);
    const dataset = { lane: lane.key };
    if (swimKey != null) dataset.swim = swimKey;
    if (f) dataset.folded = '1';
    const list = el('div', { class: 'ps-lane__list' + (model.swimmed ? ' ps-cell__list' : ''), dataset, role: 'list', 'aria-label': label });
    if (f) {
      // the cards are not drawn, but the strip is still a place to drop one; with bands it says how many are in it
      if (model.swimmed && cards.length) list.append(el('span', { class: 'ps-cell__n', text: String(cards.length), title: tn(cards.length, '{n} card.', '{n} cards.') }));
      return list;
    }
    const key = cellKey(lane.key, swimKey);
    const shown = expanded.has(key) ? cards : cards.slice(0, CAP);
    list.append(...shown.map((c) => { const n = cardNode(c); n.setAttribute('role', 'listitem'); return n; }));
    if (!cards.length && !model.swimmed) {
      list.append(el('p', { class: 'ps-lane__empty', text: lane.hidden ? tn(lane.hidden, '{n} card is hidden by the filters.', '{n} cards are hidden by the filters.') : t('No cards') }));
    }
    if (shown.length < cards.length) {
      list.append(el('button', { type: 'button', class: 'ps-lane__more', text: t('Show all {n}', { n: cards.length }),
        onclick: () => { expanded.add(key); draw(); } }));
    }
    return list;
  }

  /** Without swimlanes: a lane is a column of its own. */
  function laneNode(lane) {
    const f = folded(lane);
    const band = model.swims[0];
    const cards = band.lanes.find((l) => l.key === lane.key)?.cards || lane.cards;
    return el('section', { class: 'ps-lane' + (lane.over ? ' is-over' : '') + (lane.none ? ' is-none' : '') + (f ? ' is-folded' : ''), dataset: { lane: lane.key } }, [
      laneHead(lane),
      overNote(lane),
      listNode(lane, band, cards),
      model.canAdd && !f ? addBox(lane, band) : null,
    ]);
  }

  /** With swimlanes: the lanes' heads in a row that stays on top, then each band's name and its cells. */
  function gridNodes() {
    lanesBox.style.gridTemplateColumns = model.lanes.map((l) => (folded(l) ? '44px' : 'minmax(256px, var(--ps-colmax, 340px))')).join(' ');
    const out = model.lanes.map((lane) => el('div', { class: 'ps-colhead' + (lane.over ? ' is-over' : '') + (lane.none ? ' is-none' : '') + (folded(lane) ? ' is-folded' : ''), dataset: { lane: lane.key } }, [
      laneHead(lane), overNote(lane),
    ]));
    for (const band of model.swims) {
      const n = band.lanes.reduce((a, l) => a + l.cards.length, 0);
      out.push(el('div', { class: 'ps-band' + (band.none ? ' is-none' : ''), dataset: { swim: band.key } }, [
        el('div', { class: 'ps-band__head' }, [
          el('h3', { class: 'ps-band__name', text: bandName(band), title: bandName(band) }),
          el('span', { class: 'ps-band__count', text: n ? tn(n, '{n} card', '{n} cards') : t('No cards') }),
        ]),
      ]));
      model.lanes.forEach((lane, i) => {
        const f = folded(lane);
        out.push(el('div', { class: 'ps-cell' + (f ? ' is-folded' : ''), dataset: { lane: lane.key, swim: band.key } }, [
          listNode(lane, band, band.lanes[i].cards),
          model.canAdd && !f ? addBox(lane, band) : null,
        ]));
      });
    }
    return out;
  }

  function addBox(lane, band) {
    const swimKey = model.swimmed ? band.key : null;
    const where = model.swimmed ? `${bandName(band)}, ${laneName(lane)}` : laneName(lane);
    const mine = () => adding?.laneKey === lane.key && (adding.swimKey ?? null) === swimKey;
    const foot = el('div', { class: 'ps-lane__foot' + (model.swimmed ? ' ps-lane__foot--cell' : '') });
    const openBox = (value = '') => {
      adding = { laneKey: lane.key, swimKey, value };
      const input = el('textarea', { class: 'ps-lane__input', rows: '2', placeholder: t('Card name'), 'aria-label': t('New card in {lane}', { lane: where }) });
      input.value = value;
      const submit = () => {
        const title = input.value.trim();
        if (!title) return;
        input.value = '';
        adding = { laneKey: lane.key, swimKey, value: '' };
        on.onAdd?.({ laneKey: lane.key, ...(swimKey != null ? { swimKey } : {}), title });
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
    if (mine()) {
      const input = openBox(adding.value);
      requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
    } else {
      foot.append(el('button', { type: 'button', class: 'ps-lane__add', 'aria-label': model.swimmed ? t('Add card to {lane}', { lane: where }) : null, onclick: () => { const i = openBox(); i.focus(); } }, [
        el('span', { class: 'ps-lane__plus', 'aria-hidden': 'true' }), el('span', { class: 'ps-lane__addtext', text: t('Add card') }),
      ]));
    }
    return foot;
  }

  function draw() {
    if (!model) return;
    const scrollX = root.scrollLeft, scrollTop = root.scrollTop;
    const scrollY = new Map([...root.querySelectorAll('.ps-lane__list')].map((l) => [cellKey(l.dataset.lane, l.dataset.swim), l.scrollTop]));
    const hadFocus = root.contains(document.activeElement) && document.activeElement !== root;
    for (const s of sortables) s.destroy();
    sortables = [];
    nodes.clear();
    clear(lanesBox);
    lanesBox.className = model.swimmed ? 'ps-board__grid' : 'ps-board__lanes';
    lanesBox.style.gridTemplateColumns = '';
    lanesBox.append(...(model.swimmed ? gridNodes() : model.lanes.map(laneNode)));
    root.classList.toggle('is-editable', !!model.editable);
    root.classList.toggle('has-swims', !!model.swimmed);
    root.scrollLeft = scrollX;
    root.scrollTop = scrollTop;
    for (const l of root.querySelectorAll('.ps-lane__list')) {
      const k = cellKey(l.dataset.lane, l.dataset.swim);
      if (scrollY.has(k)) l.scrollTop = scrollY.get(k);
    }
    if (hadFocus && !adding && model.selectedId != null) nodes.get(model.selectedId)?.focus({ preventScroll: true });
    if (model.editable && Sortable) attachDrag();
    if (revealAfter != null && nodes.has(revealAfter)) { nodes.get(revealAfter).scrollIntoView({ block: 'nearest', inline: 'nearest' }); revealAfter = null; }
  }

  function attachDrag() {
    for (const list of root.querySelectorAll('.ps-lane__list')) {
      // A lane or swim column that is a formula can't be written: cards may then only move where its value stays the same.
      const group = (model.laneLocked ? 'L' + list.dataset.lane : '') + (model.swimLocked ? 'S' + list.dataset.swim : '');
      sortables.push(Sortable.create(list, {
        group: group ? 'ps-' + group : 'ps-board',
        draggable: '.ps-card',
        filter: '.ps-lane__more, .ps-lane__empty, .ps-cell__n',
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
        onStart: (evt) => {
          dragging = true;
          root.classList.add('is-dragging');
          // a card of the selection takes the rest of it along: the others dim where they are, and the lifted card says how many
          const id = Number(evt.item.dataset.id);
          mates = model.multi && model.multi.size > 1 && model.multi.has(id) ? [...model.multi].filter((x) => x !== id) : [];
          for (const m of mates) nodes.get(m)?.classList.add('is-mate');
          const lifted = document.querySelector('.is-lifted');
          if (lifted && mates.length) lifted.dataset.more = '+' + mates.length;
        },
        onEnd: (evt) => {
          dragging = false;
          root.classList.remove('is-dragging');
          for (const m of mates) nodes.get(m)?.classList.remove('is-mate');
          const together = mates.length ? [Number(evt.item.dataset.id), ...mates] : null;
          mates = [];
          const id = Number(evt.item.dataset.id);
          const toKey = evt.to.dataset.lane;
          const swimKey = evt.to.dataset.swim;   // undefined without swimlanes
          const index = evt.to.dataset.folded ? AT_END : evt.newDraggableIndex;
          const moved = evt.from !== evt.to || evt.oldDraggableIndex !== evt.newDraggableIndex;
          // Sortable has moved the element; the drawing goes back to the model's order until the write lands.
          const next = pending || model;
          pending = null;
          model = next;
          draw();
          if (moved) on.onMove?.({ id, ...(together ? { ids: together } : {}), toKey, ...(swimKey != null ? { swimKey } : {}), index });
        },
      }));
    }
  }

  // ---- selecting, keyboard ------------------------------------------------------------------------------
  const cardAt = (target) => target.closest?.('.ps-card');
  root.addEventListener('click', (e) => {
    const n = cardAt(e.target);
    if (n) on.onSelect?.(Number(n.dataset.id), { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  });
  root.addEventListener('dblclick', (e) => {
    const n = cardAt(e.target);
    if (n) on.onOpen?.(Number(n.dataset.id));
  });

  /** Where the selected card is: [band index, lane index, card index]. */
  function position() {
    const id = model?.selectedId;
    if (id == null) return null;
    for (let s = 0; s < model.swims.length; s++) {
      for (let l = 0; l < model.swims[s].lanes.length; l++) {
        const j = model.swims[s].lanes[l].cards.findIndex((c) => c.id === id);
        if (j >= 0) return [s, l, j];
      }
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
    const lanes = model.lanes, bands = model.swims;
    const pos = position();
    const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    const bandPart = (b) => (model.swimmed ? { swimKey: b.key } : {});
    if (e.altKey && pos && arrows.includes(e.key)) {
      e.preventDefault();
      if (!model.editable) return;
      const [si, li, ci] = pos;
      const card = bands[si].lanes[li].cards[ci];
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (e.shiftKey) {
          // to the next band, at the end of the same lane
          const sj = si + (e.key === 'ArrowUp' ? -1 : 1);
          if (model.swimmed && !model.swimLocked && sj >= 0 && sj < bands.length) on.onMove?.({ id: card.id, toKey: lanes[li].key, ...bandPart(bands[sj]), index: bands[sj].lanes[li].cards.length });
        } else {
          const to = ci + (e.key === 'ArrowUp' ? -1 : 1);
          if (to >= 0 && to < bands[si].lanes[li].cards.length) on.onMove?.({ id: card.id, toKey: lanes[li].key, ...bandPart(bands[si]), index: to });
        }
      } else {
        const lj = li + (e.key === 'ArrowLeft' ? -1 : 1);
        if (lj >= 0 && lj < lanes.length && !model.laneLocked) on.onMove?.({ id: card.id, toKey: lanes[lj].key, ...bandPart(bands[si]), index: bands[si].lanes[lj].cards.length });
      }
      return;
    }
    if (e.altKey) return;
    // a cell with cards that are drawn (a folded lane's are not)
    const usable = (si, li) => !!bands[si]?.lanes[li]?.cards.length && !folded(lanes[li]);
    const pick = (si, li, ci) => {
      if (!usable(si, li)) return false;
      const cards = bands[si].lanes[li].cards;
      e.preventDefault();
      on.onSelect?.(cards[Math.max(0, Math.min(cards.length - 1, ci))].id);
      return true;
    };
    if (!pos) {
      if (arrows.includes(e.key) || e.key === 'Home') {
        for (let si = 0; si < bands.length; si++) for (let li = 0; li < lanes.length; li++) if (pick(si, li, 0)) return;
      }
      return;
    }
    const [si, li, ci] = pos;
    const size = bands[si].lanes[li].cards.length;
    if (e.key === 'ArrowDown') {
      if (ci + 1 < size) pick(si, li, ci + 1);
      else for (let sj = si + 1; sj < bands.length; sj++) if (pick(sj, li, 0)) break;   // on into the band below
    } else if (e.key === 'ArrowUp') {
      if (ci > 0) pick(si, li, ci - 1);
      else for (let sj = si - 1; sj >= 0; sj--) if (pick(sj, li, AT_END)) break;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // the nearest lane that has cards, at the same height where it can
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      for (let lj = li + step; lj >= 0 && lj < lanes.length; lj += step) if (pick(si, lj, ci)) break;
    } else if (e.key === 'Home') pick(si, li, 0);
    else if (e.key === 'End') pick(si, li, size - 1);
    else if (e.key === 'Enter') { e.preventDefault(); on.onQuickEdit?.(bands[si].lanes[li].cards[ci].id); }
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
      const lane = model?.lanes.find((l) => l.cards.some((c) => c.id === id));
      if (!lane) return;
      // in a folded lane: open it, and scroll to the card when it is drawn
      if (folded(lane)) { revealAfter = id; on.onFold?.(lane.key); return; }
      // past the cap of its cell: open the cell up
      const card = lane.cards.find((c) => c.id === id);
      const key = cellKey(lane.key, model.swimmed ? card.swim : null);
      if (expanded.has(key)) return;
      expanded.add(key);
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
