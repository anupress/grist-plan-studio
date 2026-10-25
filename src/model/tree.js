// The order rows appear in: groups, parents above their children, collapsed parts left out.
//
// Input is every task in Grist's row order (dated and undated); output is the list of entries the
// views draw, top to bottom. A parent's bar is a summary: it spans its children (and its own dates,
// if it has any), so a parent with no dates of its own still shows where its work lies.
//
//   {kind: 'group', key, label, count, start, end, collapsed}
//   {kind: 'task', task, depth, kids, collapsed, summary: {start, end, count} | null, undated}
//
// Rules: a parent link that loops (A under B under A) is ignored at the point it closes; a child sits
// under its parent only when both are in the same group; tasks with no dates at all (and no dated
// children) go to the end, flat, as in M2. Pure: tests/tree.test.mjs.

/**
 * @param {Array} tasks  all tasks, each with {id, index, start, end, parentId}
 * @param {{group?: {key: (t) => string|null, label: (k) => string, order?: string[]}, collapsed?: Set<string>, sort?: (a, b) => number}} opts
 *   sort: the order of siblings (and of the tasks with no dates), in place of the table's own; model/display.js makes it
 * @returns {{entries: Array, summaries: Map<number, {start, end, count}>, visibleIds: Set<number>}}
 */
export function arrange(tasks, { group = null, collapsed = new Set(), sort = null } = {}) {
  const all = [...tasks].sort(sort || ((a, b) => (a.index ?? 0) - (b.index ?? 0)));
  const byId = new Map(all.map((t) => [t.id, t]));
  const keyOf = (t) => (group ? group.key(t) ?? '' : '');

  // A parent link counts when the parent is here, in the same group, and the chain does not loop.
  const parentOf = new Map();
  for (const t of all) {
    const p = t.parentId != null ? byId.get(t.parentId) : null;
    if (!p || p === t || keyOf(p) !== keyOf(t)) continue;
    let x = p, loops = false;
    for (let i = 0; x && i <= all.length; i++) {
      if (x === t) { loops = true; break; }
      const up = parentOf.get(x.id);
      x = up != null ? byId.get(up) : null;
    }
    if (!loops) parentOf.set(t.id, p.id);
  }
  const kids = new Map();
  for (const t of all) {
    const p = parentOf.get(t.id);
    if (p != null) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(t); }
  }

  // Span of a task with everything under it.
  const span = new Map();
  const spanOf = (t) => {
    if (span.has(t.id)) return span.get(t.id);
    span.set(t.id, null);   // a guard; loops were cut above, this only stops a surprise
    let start = t.start, end = t.end, count = 0;
    for (const k of kids.get(t.id) || []) {
      const s = spanOf(k);
      count += 1 + (s ? s.count : 0);
      if (!s || s.start == null) continue;
      start = start == null ? s.start : Math.min(start, s.start);
      end = end == null ? s.end : Math.max(end, s.end);
    }
    const out = start == null ? null : { start, end, count };
    span.set(t.id, out);
    return out;
  };
  for (const t of all) spanOf(t);
  const summaries = new Map();
  for (const t of all) if (kids.has(t.id) && span.get(t.id)) summaries.set(t.id, span.get(t.id));
  const dated = (t) => !!span.get(t.id);

  // Groups, in the order the grouping column defines, then by first appearance; "no value" last.
  const groups = new Map();
  for (const t of all) {
    if (!dated(t) || parentOf.has(t.id)) continue;
    const k = keyOf(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const keys = [...groups.keys()];
  if (group?.order) {
    const rank = new Map(group.order.map((k, i) => [k, i]));
    keys.sort((a, b) => (a === '') - (b === '') || (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  } else keys.sort((a, b) => (a === '') - (b === ''));

  const entries = [];
  const visibleIds = new Set();
  const walk = (t, depth) => {
    const ks = (kids.get(t.id) || []).filter(dated);
    const isCollapsed = ks.length > 0 && collapsed.has('p:' + t.id);
    entries.push({ kind: 'task', task: t, depth, kids: ks.length, collapsed: isCollapsed, summary: summaries.get(t.id) || null, undated: false });
    visibleIds.add(t.id);
    if (!isCollapsed) for (const k of ks) walk(k, depth + 1);
  };
  for (const k of keys) {
    const tops = groups.get(k);
    if (group) {
      let start = Infinity, end = -Infinity, count = 0;
      for (const t of tops) { const s = span.get(t.id); start = Math.min(start, s.start); end = Math.max(end, s.end); count += 1 + (summaries.get(t.id)?.count || 0); }
      const gc = collapsed.has('g:' + k);
      entries.push({ kind: 'group', key: k, label: group.label(k), count, start, end, collapsed: gc });
      if (gc) continue;
    }
    for (const t of tops) walk(t, 0);
  }
  for (const t of all) {
    if (dated(t)) continue;
    entries.push({ kind: 'task', task: t, depth: 0, kids: 0, collapsed: false, summary: null, undated: true });
    visibleIds.add(t.id);
  }
  return { entries, summaries, visibleIds };
}
