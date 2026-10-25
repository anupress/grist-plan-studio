// The order rows appear in: groups, parents above their children, collapsed parts left out.
//
// Input is every task in Grist's row order (dated and undated); output is the list of entries the
// views draw, top to bottom. A parent's bar is a summary: it spans its children (and its own dates,
// if it has any), so a parent with no dates of its own still shows where its work lies.
//
//   {kind: 'group', key, level (0, or 1 for a group inside a group), label, count, start, end, collapsed}
//   {kind: 'task', task, depth, kids, collapsed, summary: {start, end, count} | null, undated}
//
// Rules: a parent link that loops (A under B under A) is ignored at the point it closes; a child sits
// under its parent only when both are in the same group; tasks with no dates at all (and no dated
// children) go to the end, flat, as in M2. Pure: tests/tree.test.mjs.

/**
 * @param {Array} tasks  all tasks, each with {id, index, start, end, parentId}
 * @param {{group?: {key: (t) => string|null, label: (k) => string, order?: string[]}, group2?: (the same: groups inside the groups), collapsed?: Set<string>, sort?: (a, b) => number}} opts
 *   a group inside a group has the key 'outer\u0001inner'; with only group2 the tasks are not grouped
 *   sort: the order of siblings (and of the tasks with no dates), in place of the table's own; model/display.js makes it
 * @returns {{entries: Array, summaries: Map<number, {start, end, count}>, visibleIds: Set<number>}}
 */
export function arrange(tasks, { group = null, group2 = null, collapsed = new Set(), sort = null } = {}) {
  if (!group) group2 = null;
  const all = [...tasks].sort(sort || ((a, b) => (a.index ?? 0) - (b.index ?? 0)));
  const byId = new Map(all.map((t) => [t.id, t]));
  const outerOf = (t) => (group ? group.key(t) ?? '' : '');
  const innerOf = (t) => (group2 ? group2.key(t) ?? '' : '');
  const keyOf = (t) => outerOf(t) + (group2 ? '\u0001' + innerOf(t) : '');

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

  // Groups, in the order the grouping column defines, then by first appearance; "no value" last. With a second grouping, each
  // group holds its own groups.
  const groups = new Map();   // outer key -> Map(inner key -> top tasks)
  for (const t of all) {
    if (!dated(t) || parentOf.has(t.id)) continue;
    const ko = outerOf(t), ki = innerOf(t);
    if (!groups.has(ko)) groups.set(ko, new Map());
    const inner = groups.get(ko);
    if (!inner.has(ki)) inner.set(ki, []);
    inner.get(ki).push(t);
  }
  const sortKeys = (list, g) => {
    const keys = [...list];
    if (g?.order) {
      const rank = new Map(g.order.map((k, i) => [k, i]));
      keys.sort((a, b) => (a === '') - (b === '') || (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
    } else keys.sort((a, b) => (a === '') - (b === ''));
    return keys;
  };
  const keys = sortKeys(groups.keys(), group);
  const spanOfTops = (tops) => {
    let start = Infinity, end = -Infinity, count = 0;
    for (const t of tops) { const s = span.get(t.id); start = Math.min(start, s.start); end = Math.max(end, s.end); count += 1 + (summaries.get(t.id)?.count || 0); }
    return { start, end, count };
  };

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
    const inner = groups.get(k);
    const tops = [...inner.values()].flat();
    if (group) {
      const gc = collapsed.has('g:' + k);
      entries.push({ kind: 'group', key: k, level: 0, label: group.label(k), ...spanOfTops(tops), collapsed: gc });
      if (gc) continue;
    }
    if (group2) {
      for (const ki of sortKeys(inner.keys(), group2)) {
        const key2 = k + '\u0001' + ki;
        const gc2 = collapsed.has('g:' + key2);
        entries.push({ kind: 'group', key: key2, level: 1, label: group2.label(ki), ...spanOfTops(inner.get(ki)), collapsed: gc2 });
        if (gc2) continue;
        for (const t of inner.get(ki)) walk(t, 0);
      }
    } else for (const t of tops) walk(t, 0);
  }
  for (const t of all) {
    if (dated(t)) continue;
    entries.push({ kind: 'task', task: t, depth: 0, kids: 0, collapsed: false, summary: null, undated: true });
    visibleIds.add(t.id);
  }
  return { entries, summaries, visibleIds };
}
