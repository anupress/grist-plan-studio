// Plan against actual (M18): how far a task has drifted from the dates it was promised for, and which tasks a
// baseline would be set for. Pure: tests/plan.test.mjs. The words themselves are in ui/planwords.js.

/** @returns {{start: number, end: number} | null}  days later (positive) or earlier than planned; null with no plan */
export function slipOf(task) {
  if (!task || task.baseStart == null || task.baseEnd == null || task.start == null) return null;
  return { start: task.start - task.baseStart, end: task.end - task.baseEnd };
}

/** True when a task has a plan that differs from what it is now: the only case a plan bar is worth drawing. */
export function drifted(task) {
  const s = slipOf(task);
  return !!s && (s.start !== 0 || s.end !== 0);
}

/**
 * The slip in words. The finish decides; when it is on time and only the start moved, that is said instead.
 * @returns {{key: 'later' | 'earlier' | 'startsLater' | 'startsEarlier' | 'onPlan', n?: number} | null}
 */
export function slipWords(task) {
  const s = slipOf(task);
  if (!s) return null;
  if (s.end > 0) return { key: 'later', n: s.end };
  if (s.end < 0) return { key: 'earlier', n: -s.end };
  if (s.start > 0) return { key: 'startsLater', n: s.start };
  if (s.start < 0) return { key: 'startsEarlier', n: -s.start };
  return { key: 'onPlan' };
}

/** The short form for a list column: "+4 d", "−2 d", "on plan"; null without a plan. */
export function slipShort(task) {
  const s = slipOf(task);
  if (!s) return null;
  const n = s.end !== 0 ? s.end : s.start;
  return n === 0 ? { key: 'onPlan' } : { key: n > 0 ? 'plus' : 'minus', n: Math.abs(n) };
}

/**
 * The tasks a baseline is set for: every one that has dates, and (mode 'missing') has no plan yet.
 * A baseline is today's start and end, as the bar shows them.
 * @param tasks  from buildTasks (dated ones; undated tasks have no dates to remember)
 * @returns {Array<{id, start, end}>}
 */
export function baselineTargets(tasks, mode = 'all') {
  return tasks
    .filter((t) => t.start != null && t.end != null && (mode === 'all' || t.baseStart == null))
    .map((t) => ({ id: t.id, start: t.start, end: t.end }));
}

/** What is there to say before setting one: how many tasks it covers and how many already have a plan. */
export function baselineSummary(tasks) {
  const dated = tasks.filter((t) => t.start != null && t.end != null);
  const planned = dated.filter((t) => t.baseStart != null).length;
  return { dated: dated.length, planned, missing: dated.length - planned };
}

/** How the finish of a done task compares with its end: days after (positive) or before the end; null when either is missing. */
export function finishedVsEnd(task) {
  return task && task.doneOn != null && task.end != null ? task.doneOn - task.end : null;
}
