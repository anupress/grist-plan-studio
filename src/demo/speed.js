// A 5,000-task plan for the speed pass (the target: first draw under 1 s, dragging at 60 fps). Not in the
// demo's Example menu; open it with ?example=speed. Deterministic, so every run measures the same plan.

import { SAMPLE_COLUMNS } from './sample.js';
import { todayDay } from '../model/values.js';

export const SPEED_TABLE = 'Tasks';
export const SPEED_COLUMNS = SAMPLE_COLUMNS;
const PEOPLE = ['Ann', 'Ben', 'Chloé', 'Dieter', 'Emma', 'Farid', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Kim', 'Lea'];
export const SPEED_LABELS = {
  Owner: new Map(PEOPLE.map((n, i) => [i + 1, n])),
  Project: new Map([[1, 'Website'], [2, 'Shop'], [3, 'App']]),
};

/** 40 phases of 124 tasks each (5,000 rows), chained inside each phase, over about two years. */
export function speedRows(today = todayDay(), n = 5000) {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const statuses = ['To do', 'Doing', 'Blocked', 'Done'];
  const rows = [];
  const phases = 40;
  const per = Math.floor((n - phases) / phases);
  const start0 = today - 200;
  for (let p = 0; p < phases; p++) {
    const pid = rows.length + 1;
    rows.push({ id: pid, Task: `Phase ${p + 1}`, Start: null, End: null, Due: null, Status: 'To do', Owner: null, Progress: null, Milestone: false,
      Project: ['R', 'Projects', 1 + (p % 3)], Depends_on: null, Phase: null, Order: pid * 10, Hours: null });
    let day = start0 + p * 18;
    for (let i = 0; i < per && rows.length < n; i++) {
      const id = rows.length + 1;
      const len = 1 + Math.floor(rnd() * 12);
      const ms = rnd() < 0.05;
      const s = day + Math.floor(rnd() * 3);
      rows.push({
        id, Task: `Task ${p + 1}.${i + 1}`, Start: ['d', s * 86400], End: ms ? ['d', s * 86400] : ['d', (s + len - 1) * 86400], Due: null,
        Status: statuses[Math.floor(rnd() * 4)], Owner: ['R', 'People', 1 + Math.floor(rnd() * PEOPLE.length)], Progress: Math.round(rnd() * 10) / 10,
        Milestone: ms, Project: ['R', 'Projects', 1 + (p % 3)], Depends_on: i > 0 && rnd() < 0.6 ? ['L', id - 1] : null, Phase: ['R', 'Tasks', pid], Order: id * 10,
        // six hours a day of work, worked out from the length: no extra random draws, so the plan stays the one M6 measured
        Hours: ms ? null : len * 6,
      });
      day = s + Math.floor(len * 0.6);
    }
  }
  while (rows.length < n) rows.push({ id: rows.length + 1, Task: `Loose task ${rows.length + 1}`, Start: null, End: null, Due: null, Status: 'To do', Owner: null, Progress: null, Milestone: false, Project: null, Depends_on: null, Phase: null, Order: null, Hours: null });
  return rows;
}
