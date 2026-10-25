// The demo: a website relaunch, planned around today so the "today" line always falls inside it.
// Cells are in the encoded shape Grist sends (connect.js ROW_OPTIONS) and the columns in the shape
// schema.tableColumns() returns, so the demo runs the same detection and model code as a real table.

import { todayDay } from '../model/values.js';
import { weekday } from '../views/gantt/layout.js';
import { kindOf } from '../model/schema.js';

export const SAMPLE_TABLE = 'Tasks';

const col = (ref, id, type, extra = {}) => ({
  ref, id, label: id.replace(/_/g, ' '), type, kind: kindOf(type), dateFormat: extra.dateFormat || null,
  isFormula: false, refTable: (/^Ref(?:List)?:(.+)$/.exec(type) || [])[1] || null, visibleColId: extra.visibleColId || null,
  choices: extra.choices || [], choiceOptions: extra.choiceOptions || {},
});

export const SAMPLE_COLUMNS = [
  col(1, 'Task', 'Text'),
  col(2, 'Start', 'Date', { dateFormat: 'DD MMM YYYY' }),
  col(3, 'End', 'Date'),
  col(4, 'Due', 'Date'),
  col(5, 'Status', 'Choice', {
    choices: ['To do', 'Doing', 'Blocked', 'Done'],
    choiceOptions: { 'To do': { fillColor: '#94A3B8' }, Doing: { fillColor: '#3B82F6' }, Blocked: { fillColor: '#EF4444' }, Done: { fillColor: '#22C55E' } },
  }),
  col(6, 'Owner', 'Ref:People', { visibleColId: 'Name' }),
  col(7, 'Progress', 'Numeric'),
  col(8, 'Milestone', 'Bool'),
  col(9, 'Project', 'Ref:Projects', { visibleColId: 'Name' }),
  col(10, 'Depends_on', 'RefList:Tasks', { visibleColId: 'Task' }),
  col(11, 'Phase', 'Ref:Tasks', { visibleColId: 'Task' }),
  col(12, 'Order', 'Numeric'),
  col(13, 'Hours', 'Numeric'),
  // plan against actual: the days a task was promised for, and the day it was really done
  col(14, 'Planned_start', 'Date'),
  col(15, 'Planned_end', 'Date'),
  col(16, 'Done_on', 'Date'),
  // how a task waits for the ones it depends on: the days between, and which ends are linked
  col(17, 'Lag_days', 'Int'),
  col(18, 'Link_type', 'Choice', { choices: ['Finish to start', 'Start to start', 'Finish to finish', 'Start to finish'] }),
  // a checklist in a text cell, one item to a line
  col(19, 'Checklist', 'Text'),
];

/** The people, with their hours a week (Dieter works part-time): the workload reads their capacity here. */
export const SAMPLE_PEOPLE = {
  columns: [col(1, 'Name', 'Text'), col(2, 'Hours_per_week', 'Numeric')],
  rows: [[1, 'Ann', 40], [2, 'Ben', 40], [3, 'Chloé', 40], [4, 'Dieter', 24]].map(([id, Name, h]) => ({ id, Name, Hours_per_week: h })),
};

export const SAMPLE_LABELS = {
  Owner: new Map([[1, 'Ann'], [2, 'Ben'], [3, 'Chloé'], [4, 'Dieter']]),
  Project: new Map([[1, 'Website'], [2, 'Shop']]),
};

/**
 * Rows dated around `today` (a day number): the plan started three weeks ago, on a Monday. Four phases
 * (undated rows: their bars span their tasks) and finish-to-start links, one of them broken on purpose
 * (Copywriting starts the day the content audit it waits for ends) so the red arrow shows.
 */
export function sampleRows(today = todayDay()) {
  const base = today - ((weekday(today) + 6) % 7) - 21;
  const d = (n) => ['d', (base + n) * 86400];
  const R = (t, id) => ['R', t, id];
  const L = (...ids) => (ids.length ? ['L', ...ids] : null);
  // id: [task, start, end, due, status, owner, progress, milestone, project, phase, depends on, hours]
  // Day offsets from a Monday; all on weekdays, so the chain through the plan is tight in working days.
  // The hours give the workload two stories: Dieter is over this week on two tasks that have both
  // started (nothing can move), and Chloé's image rights clash with her content migration but can wait.
  const T = {
    1: ['Discovery', null, null, null, 'Done', 1, null, false, 1, 0, [], null],
    2: ['Design', null, null, null, 'Doing', 4, null, false, 1, 0, [], null],
    3: ['Build', null, null, null, 'To do', 2, null, false, 1, 0, [], null],
    4: ['Launch', null, null, null, 'To do', 1, null, false, 1, 0, [], null],
    5: ['Kick-off meeting', 0, 0, null, 'Done', 1, 1, true, 1, 1, [], null],
    6: ['Collect requirements', 1, 4, null, 'Done', 2, 1, false, 1, 1, [5], 24],
    7: ['Content audit', 1, 8, null, 'Done', 3, 1, false, 1, 1, [5], 30],
    8: ['Sitemap and wireframes', 7, 11, null, 'Done', 1, 1, false, 1, 2, [6], 28],
    9: ['Visual design', 14, 25, null, 'Doing', 4, 0.6, false, 1, 2, [8], 40],
    10: ['Copywriting', 8, 23, null, 'Doing', 3, 0.5, false, 1, 2, [7], 60],
    11: ['Design sign-off', 28, 28, null, 'To do', 1, 0, true, 1, 2, [9, 10], null],
    12: ['Payment provider contract', 9, 23, null, 'Blocked', 4, 0.3, false, 2, 3, [], 22],
    13: ['Front-end build', 29, 39, null, 'To do', 2, 0, false, 1, 3, [11], 64],
    14: ['Shop setup', 30, 37, null, 'To do', 4, 0, false, 2, 3, [12], 24],
    15: ['Migrate content', 31, 38, null, 'To do', 3, 0, false, 1, 3, [10], 36],
    16: ['Accessibility review', 42, 44, null, 'To do', 1, 0, false, 1, 4, [13], 18],
    17: ['SEO checks', null, null, 46, 'To do', 2, 0, false, 1, 4, [15], null],
    18: ['Testing', 42, 46, null, 'To do', 2, 0, false, 1, 4, [13, 14, 15], 30],
    19: ['Launch day', 49, 49, null, 'To do', 1, 0, true, 1, 4, [16, 17, 18], null],
    20: ['Team training', 50, null, null, 'To do', 1, 0, false, 1, 4, [19], 6],
    21: ['Write release notes', null, null, null, 'To do', 3, 0, false, 1, 0, [], 4],
    22: ['Image rights', 36, 38, null, 'To do', 3, 0, false, 1, 3, [], 12],
  };

  // The plan at the start (day offsets like the rows above): most of the plan has slipped a little, the visual design most.
  const PLAN = { 6: [1, 3], 7: [1, 4], 8: [7, 10], 9: [11, 18], 10: [8, 18], 11: [25, 25], 12: [9, 21], 13: [28, 35], 14: [29, 35], 15: [29, 36], 18: [42, 46] };
  // The day the finished tasks were really done: the audit ran a day over its end.
  const DONE = { 5: 0, 6: 4, 7: 9, 8: 11 };
  // The links that are not plain finish to start: Shop setup starts three weeks after the contract work starts, Migrate content ends
  // with the copywriting it follows, the accessibility review waits two days after the build.
  const LINKS = { 14: ['Start to start', 21], 15: ['Finish to finish', 0], 16: ['Finish to start', 2] };

  // Deadlines apart from the plan's end: Visual design ends a day after its, Front-end build two days before its, Testing has a day to spare.
  const DEADLINE = { 9: 24, 13: 41, 18: 47 };
  // Checklists, one item to a line: the cards say how many are ticked.
  const CHECKS = {
    9: ['x Home page', 'x Product page', '  Checkout', '  Mobile layouts'],
    10: ['x Home page', 'x About us', 'x Product texts', '  Legal pages', '  Help centre'],
    13: ['  Templates', '  Forms', '  Search'],
    18: ['  Phones', '  Tablets', '  Screen reader'],
  };
  const checklist = (id) => (CHECKS[id] || []).map((l) => `[${l[0]}] ${l.slice(2)}`).join('\n');

  return Object.entries(T).map(([id, [task, s, e, due, status, owner, progress, ms, project, phase, deps, hours]]) => ({
    id: Number(id), Task: task, Start: s == null ? null : d(s), End: e == null ? null : d(e), Due: due == null ? (DEADLINE[id] != null ? d(DEADLINE[id]) : null) : d(due),
    Status: status, Owner: R('People', owner), Progress: progress, Milestone: ms, Project: R('Projects', project),
    Depends_on: L(...deps), Phase: phase ? R('Tasks', phase) : null,
    // The board's order within a lane: a rank per row, in steps of ten so a drag lands between two.
    Order: Number(id) * 10,
    Hours: hours,
    Planned_start: PLAN[id] ? d(PLAN[id][0]) : null, Planned_end: PLAN[id] ? d(PLAN[id][1]) : null,
    Done_on: DONE[id] != null ? d(DONE[id]) : null,
    Lag_days: LINKS[id] ? LINKS[id][1] : 0, Link_type: LINKS[id] ? LINKS[id][0] : '',
    Checklist: checklist(Number(id)),
  }));
}

/**
 * The time entries (M10): what the finished and running tasks have had so far, by hand and by timer,
 * nothing after today. Sitemap ran an hour over its plan, so one card says so; the tasks still running have hours left.
 */
export const SAMPLE_TIME_TABLE = 'Time_entries';
export const SAMPLE_TIME_COLUMNS = [
  col(1, 'Task', 'Ref:Tasks', { visibleColId: 'Task' }),
  col(2, 'Person', 'Ref:People', { visibleColId: 'Name' }),
  col(3, 'Date', 'Date'),
  col(4, 'Started', 'DateTime:UTC'),
  col(5, 'Stopped', 'DateTime:UTC'),
  col(6, 'Hours', 'Numeric'),
  col(7, 'Note', 'Text'),
];
export function sampleTimeRows(today = todayDay()) {
  const base = today - ((weekday(today) + 6) % 7) - 21;
  // [task, person, first day, last day, hours a day, by timer]; working days only
  const plan = [[6, 2, 1, 4, 6, false], [7, 3, 1, 8, 5, false], [8, 1, 7, 11, 5.8, true], [9, 4, 14, 25, 3, true],
    [10, 3, 8, 23, 3, true], [12, 4, 9, 23, 1, false]];
  const rows = [];
  for (const [task, person, a, b, h, timer] of plan) {
    for (let n = a; n <= b; n++) {
      const d = base + n;
      if (d > today || weekday(d) === 0 || weekday(d) === 6) continue;
      const start = d * 86400 + 9 * 3600;
      rows.push({ id: rows.length + 1, Task: ['R', 'Tasks', task], Person: ['R', 'People', person], Date: ['d', d * 86400],
        Started: timer ? start : null, Stopped: timer ? start + Math.round(h * 3600) : null, Hours: Math.round(h * 100) / 100, Note: '' });
    }
  }
  return rows;
}

/** Ann's day off in the seventh week, from the holidays table the demo does not have: hatched in her row. */
export function sampleDaysOff(today = todayDay()) {
  const base = today - ((weekday(today) + 6) % 7) - 21;
  return { refTable: 'People', days: new Map([['r:1', new Set([base + 45])]]) };
}
