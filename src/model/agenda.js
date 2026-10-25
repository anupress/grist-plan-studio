// The agenda (M11): what needs someone, and when. Open tasks and bookings are listed under the day they
// next ask for attention:
//
//   late         its end has passed and it is not finished (only rows that can be finished: a table
//                with a Done, Status or Progress column; a past booking is simply over, not late)
//   today        due today, starting today, or ending today
//   tomorrow     the same, tomorrow
//   now          started, and due after tomorrow ("in progress"; "now" for bookings)
//   week         starting later this week
//   next         starting next week
//   later        starting after that
//   undated      no date at all
//
// Finished rows and parent tasks (their children carry the work) are left out. Pure: tests/agenda.test.mjs.

export const AGENDA_GROUPS = ['late', 'today', 'tomorrow', 'now', 'week', 'next', 'later', 'undated'];

/** The last day of the week `day` is in, for a week that starts on `weekStart` (0 Sunday … 6 Saturday). */
export function weekEndOf(day, weekStart = 1) {
  const dow = ((day + 4) % 7 + 7) % 7;   // day 0 (1 Jan 1970) was a Thursday
  return day + ((((weekStart + 6) % 7) - dow) + 7) % 7;
}

/**
 * @param tasks        dated tasks from buildTasks
 * @param unscheduled  tasks without dates
 * @param ctx {today, weekStart, doable: rows can be finished, keep(task) -> boolean (Mine) | null}
 * @returns {{groups: Array<{id, items: Array<{task, day, what, late}>}>, open: number}}
 *   day: the day it is listed under; what: 'due' (a deadline) | 'starts' | 'ends' | 'on' (one day) | 'until' (under way);
 *   late: days past the deadline (late group only)
 */
export function buildAgenda(tasks, unscheduled, { today, weekStart = 1, doable = true, keep = null }) {
  const parents = new Set([...tasks, ...unscheduled].map((x) => x.parentId).filter((x) => x != null));
  const open = (x) => !x.finished && !parents.has(x.id) && (!keep || keep(x));
  const groups = Object.fromEntries(AGENDA_GROUPS.map((g) => [g, []]));
  const endWeek = weekEndOf(today, weekStart), endNext = endWeek + 7;
  const tomorrow = today + 1;
  for (const x of tasks) {
    if (!open(x)) continue;
    const one = x.start === x.end;
    if (x.end < today) {
      if (doable) groups.late.push({ task: x, day: x.end, what: 'due', late: today - x.end });
      continue;
    }
    // the first day from today on that it starts, or else ends
    const at = x.start >= today ? x.start : x.end;
    const what = one ? (doable ? 'due' : 'on') : x.start >= today ? 'starts' : doable ? 'due' : 'ends';
    if (at === today || at === tomorrow) groups[at === today ? 'today' : 'tomorrow'].push({ task: x, day: at, what });
    else if (x.start < today) groups.now.push({ task: x, day: x.end, what: 'until' });
    else groups[at <= endWeek ? 'week' : at <= endNext ? 'next' : 'later'].push({ task: x, day: at, what });
  }
  for (const x of unscheduled) if (open(x)) groups.undated.push({ task: x, day: null, what: null });
  const byDay = (a, b) => a.day - b.day || a.task.index - b.task.index;
  // the longest late first; on the same day, deadlines before starts
  groups.late.sort((a, b) => b.late - a.late || a.task.index - b.task.index);
  for (const g of ['today', 'tomorrow']) groups[g].sort((a, b) => (a.what === 'starts') - (b.what === 'starts') || a.task.index - b.task.index);
  for (const g of ['now', 'week', 'next', 'later']) groups[g].sort(byDay);
  groups.undated.sort((a, b) => a.task.index - b.task.index);
  const list = AGENDA_GROUPS.map((id) => ({ id, items: groups[id] })).filter((g) => g.items.length);
  return { groups: list, open: list.reduce((n, g) => n + g.items.length, 0) };
}
