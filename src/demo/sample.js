// The demo: a website relaunch, planned around today so the "today" line always falls inside it.
// Cells are in the encoded shape Grist sends (connect.js ROW_OPTIONS) and the columns in the shape
// schema.tableColumns() returns, so the demo runs the same detection and model code as a real table.

import { todayDay } from '../model/values.js';
import { weekday } from '../views/gantt/layout.js';

export const SAMPLE_TABLE = 'Tasks';

const col = (ref, id, type, extra = {}) => ({
  ref, id, label: id.replace(/_/g, ' '), type, kind: /^Ref:/.test(type) ? 'Ref' : /^RefList:/.test(type) ? 'RefList' : type,
  isFormula: false, refTable: (/^Ref(?:List)?:(.+)$/.exec(type) || [])[1] || null, visibleColId: extra.visibleColId || null,
  choices: extra.choices || [], choiceOptions: extra.choiceOptions || {},
});

export const SAMPLE_COLUMNS = [
  col(1, 'Task', 'Text'),
  col(2, 'Start', 'Date'),
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
];

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
  // id: [task, start, end, due, status, owner, progress, milestone, project, phase, depends on]
  // Day offsets from a Monday; all on weekdays, so the chain through the plan is tight in working days.
  const T = {
    1: ['Discovery', null, null, null, 'Done', 1, null, false, 1, 0, []],
    2: ['Design', null, null, null, 'Doing', 4, null, false, 1, 0, []],
    3: ['Build', null, null, null, 'To do', 2, null, false, 1, 0, []],
    4: ['Launch', null, null, null, 'To do', 1, null, false, 1, 0, []],
    5: ['Kick-off meeting', 0, 0, null, 'Done', 1, 1, true, 1, 1, []],
    6: ['Collect requirements', 1, 4, null, 'Done', 2, 1, false, 1, 1, [5]],
    7: ['Content audit', 1, 8, null, 'Done', 3, 1, false, 1, 1, [5]],
    8: ['Sitemap and wireframes', 7, 11, null, 'Done', 1, 1, false, 1, 2, [6]],
    9: ['Visual design', 14, 25, null, 'Doing', 4, 0.6, false, 1, 2, [8]],
    10: ['Copywriting', 8, 23, null, 'Doing', 3, 0.5, false, 1, 2, [7]],
    11: ['Design sign-off', 28, 28, null, 'To do', 1, 0, true, 1, 2, [9, 10]],
    12: ['Payment provider contract', 9, 23, null, 'Blocked', 4, 0.3, false, 2, 3, []],
    13: ['Front-end build', 29, 39, null, 'To do', 2, 0, false, 1, 3, [11]],
    14: ['Shop setup', 30, 37, null, 'To do', 4, 0, false, 2, 3, [12]],
    15: ['Migrate content', 31, 38, null, 'To do', 3, 0, false, 1, 3, [10]],
    16: ['Accessibility review', 42, 44, null, 'To do', 1, 0, false, 1, 4, [13]],
    17: ['SEO checks', null, null, 46, 'To do', 2, 0, false, 1, 4, [15]],
    18: ['Testing', 42, 46, null, 'To do', 2, 0, false, 1, 4, [13, 14, 15]],
    19: ['Launch day', 49, 49, null, 'To do', 1, 0, true, 1, 4, [16, 17, 18]],
    20: ['Team training', 50, null, null, 'To do', 1, 0, false, 1, 4, [19]],
    21: ['Write release notes', null, null, null, 'To do', 3, 0, false, 1, 0, []],
  };

  return Object.entries(T).map(([id, [task, s, e, due, status, owner, progress, ms, project, phase, deps]]) => ({
    id: Number(id), Task: task, Start: s == null ? null : d(s), End: e == null ? null : d(e), Due: due == null ? null : d(due),
    Status: status, Owner: R('People', owner), Progress: progress, Milestone: ms, Project: R('Projects', project),
    Depends_on: L(...deps), Phase: phase ? R('Tasks', phase) : null,
    // The board's order within a lane: a rank per row, in steps of ten so a drag lands between two.
    Order: Number(id) * 10,
  }));
}
