// Selecting several tasks (M26): what a click with Ctrl or Shift does to the selection. Pure: tests/selection.test.mjs.
//
//   click               one task (the caller clears the rest)
//   Ctrl (or Cmd) click add the task, or take it away when it is in
//   Shift click         every task between the one clicked before and this one, in the order they are drawn
//   Ctrl + Shift click  the same, added to what is selected
//
// The task clicked last is the primary one (the edit window and Grist's cursor follow it); the anchor is where a range starts.

/**
 * @param s     {multi: Set<number>, primary: number | null, anchor: number | null}
 * @param click {id, ctrl, shift, order: ids in the order they are drawn}
 * @returns {{multi: Set<number>, primary: number | null, anchor: number | null}}  a selection of one task has an empty `multi`
 */
export function clickSelection(s, { id, ctrl = false, shift = false, order = [] }) {
  let multi = new Set(s.multi);
  let { primary, anchor } = s;
  if (!multi.size && primary != null) multi.add(primary);
  if (shift && (anchor ?? primary) != null) {
    const from = order.indexOf(anchor ?? primary), to = order.indexOf(id);
    if (from >= 0 && to >= 0) {
      const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
      multi = ctrl ? new Set([...multi, ...range]) : new Set(range);
      return settle({ multi, primary: id, anchor: anchor ?? primary });
    }
  }
  if (multi.has(id)) {
    multi.delete(id);
    // the one clicked is gone: the primary is the last one still in
    primary = multi.size ? [...multi].pop() : null;
  } else { multi.add(id); primary = id; }
  return settle({ multi, primary, anchor: id });
}

/** A selection of one or none is no selection of several: `multi` is then empty and `primary` the one task. */
function settle({ multi, primary, anchor }) {
  if (multi.size <= 1) return { multi: new Set(), primary: multi.size ? [...multi][0] : primary, anchor };
  return { multi, primary, anchor };
}

/** The selection of everything drawn. */
export const selectAll = (order) => settle({ multi: new Set(order), primary: order.length ? order[order.length - 1] : null, anchor: order[0] ?? null });

/** Keep only the tasks that still exist (a row deleted by someone else, a filter that now hides it). */
export function pruneSelection(s, exists) {
  const multi = new Set([...s.multi].filter(exists));
  const primary = s.primary != null && exists(s.primary) ? s.primary : null;
  return settle({ multi, primary: multi.size > 1 && (primary == null || !multi.has(primary)) ? [...multi].pop() : primary, anchor: s.anchor });
}
