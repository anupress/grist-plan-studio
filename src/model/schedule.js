// Dependencies: finish-to-start links read from the "Depends on" column, the tasks a move pushes
// along, and the critical path. Pure: tests/tree.test.mjs (small cases) and tests/schedule.test.mjs (a 40-task plan).
//
// Every date step goes through a calendar (model/calendar.js), so with working days switched on a
// successor starts on the next working day and keeps its length in working days.

/** Links as {from, to}: `from` must finish before `to` starts. Only between tasks that are here. */
export function linksOf(tasks) {
  const ids = new Set(tasks.map((t) => t.id));
  const out = [];
  for (const t of tasks) for (const p of t.deps || []) if (p !== t.id && ids.has(p)) out.push({ from: p, to: t.id });
  return out;
}

/** Does a link from -> to break the rule (the successor starts before the predecessor ends)? */
export function isLate(link, byId, cal) {
  const a = byId.get(link.from), b = byId.get(link.to);
  if (!a || !b || a.end == null || b.start == null) return false;
  return b.start < cal.after(a.end);
}

/** Would adding from -> to close a loop? (Is `from` already reachable from `to`?) */
export function wouldLoop(links, from, to) {
  if (from === to) return true;
  const next = new Map();
  for (const l of links) { if (!next.has(l.from)) next.set(l.from, []); next.get(l.from).push(l.to); }
  const seen = new Set([to]);
  const stack = [to];
  while (stack.length) {
    const x = stack.pop();
    if (x === from) return true;
    for (const y of next.get(x) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
  }
  return false;
}

/**
 * The tasks that must move when one task gets new dates: every successor that would now start
 * before its predecessor ends is pushed to the first allowed day, keeping its length, and so on
 * down the chain. Nothing is ever pulled earlier.
 * @param changed {id, start, end}  the new dates of the moved task
 * @returns {Array<{id, start, end}>}  the successors to move (not the changed task itself)
 */
export function pushPlan(tasks, links, changed, cal) {
  const pos = new Map(tasks.map((t) => [t.id, { start: t.start, end: t.end, len: t.start == null ? 0 : cal.length(t.start, t.end) }]));
  if (!pos.has(changed.id)) return [];
  pos.set(changed.id, { ...pos.get(changed.id), start: changed.start, end: changed.end });
  const next = new Map();
  for (const l of links) { if (!next.has(l.from)) next.set(l.from, []); next.get(l.from).push(l.to); }
  const moved = new Map();
  const queue = [changed.id];
  for (let guard = 0; queue.length && guard < tasks.length * 4 + 10; guard++) {
    const id = queue.shift();
    const p = pos.get(id);
    if (p.end == null) continue;
    for (const s of next.get(id) || []) {
      const q = pos.get(s);
      if (!q || q.start == null || s === changed.id) continue;
      const earliest = cal.after(p.end);
      if (q.start >= earliest) continue;
      const start = earliest;
      const end = cal.workdays ? cal.endAfter(start, q.len) : start + (q.end - q.start);
      pos.set(s, { ...q, start, end });
      moved.set(s, { id: s, start, end });
      queue.push(s);
    }
  }
  return [...moved.values()];
}

/**
 * The critical path: tasks with no slack, i.e. any delay to them delays the end of the whole plan.
 * Worked out on the dates as they are (not from scratch): a task's latest finish is the day before
 * its earliest-starting successor's latest start, or the plan's last day when nothing follows it.
 * Only tasks that take part in at least one link are marked; a lone task ending on the last day is
 * not a "path". Returns empty when the links form a loop.
 * @returns {{tasks: Set<number>, links: Set<string>}}  links as 'from>to'
 */
export function criticalPath(tasks, links, cal) {
  const empty = { tasks: new Set(), links: new Set() };
  const byId = new Map(tasks.filter((t) => t.start != null).map((t) => [t.id, t]));
  const L = links.filter((l) => byId.has(l.from) && byId.has(l.to));
  if (!L.length) return empty;
  const next = new Map(), indeg = new Map();
  for (const t of byId.values()) { next.set(t.id, []); indeg.set(t.id, 0); }
  for (const l of L) { next.get(l.from).push(l.to); indeg.set(l.to, indeg.get(l.to) + 1); }
  // topological order (Kahn); a loop leaves tasks unvisited
  const order = [];
  const ready = [...byId.keys()].filter((id) => indeg.get(id) === 0);
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const s of next.get(id)) { indeg.set(s, indeg.get(s) - 1); if (indeg.get(s) === 0) ready.push(s); }
  }
  if (order.length !== byId.size) return empty;
  let last = -Infinity;
  for (const t of byId.values()) last = Math.max(last, t.end);
  const latestStart = new Map(), latestFinish = new Map();
  for (const id of order.reverse()) {
    const t = byId.get(id);
    let lf = last;
    for (const s of next.get(id)) lf = Math.min(lf, cal.shift(latestStart.get(s), -1));
    latestFinish.set(id, lf);
    latestStart.set(id, cal.shift(lf, -(cal.length(t.start, t.end) - 1)));
  }
  const linked = new Set(L.flatMap((l) => [l.from, l.to]));
  const crit = new Set();
  for (const [id, t] of byId) if (linked.has(id) && latestStart.get(id) <= t.start) crit.add(id);
  const critLinks = new Set();
  for (const l of L) if (crit.has(l.from) && crit.has(l.to) && byId.get(l.to).start <= cal.after(byId.get(l.from).end)) critLinks.add(l.from + '>' + l.to);
  return { tasks: crit, links: critLinks };
}
