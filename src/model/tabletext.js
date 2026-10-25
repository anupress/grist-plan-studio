// The plan as a table of text (M24): numbers like 1.2.3 for the outline, and the rows as tab-separated text (to paste into a
// mail or a spreadsheet; the CSV file is made by model/time.js toCsv). Pure: tests/tabletext.test.mjs.

/**
 * Outline numbers for tasks in the order they are drawn: the first top task is 1, its first sub-task 1.1, and so on.
 * Group headings are not numbered and do not restart the count.
 * @param entries  from model/tree.js arrange(): {kind: 'task', task, depth} (other kinds are skipped)
 * @returns {Map<number, string>}  task id -> '1.2.3'
 */
export function wbsOf(entries) {
  const out = new Map();
  const count = [];
  for (const e of entries) {
    if (e.kind !== 'task') continue;
    const d = e.depth || 0;
    // a task deeper than the one above it by more than one step (a parent that is not shown) still counts from 1
    count.length = Math.min(count.length, d + 1);
    while (count.length < d + 1) count.push(0);
    count[d]++;
    out.set(e.task.id, count.join('.'));
  }
  return out;
}

/**
 * The rows of the table for these entries.
 * @param opts {iso(day) -> 'YYYY-MM-DD', length(start, end) -> days (working days when the calendar says so)}
 * @returns {Array<string[]>}  WBS, task, start, end, days, status, assigned to, progress (a percentage)
 */
export function tableRows(entries, { iso, length }) {
  const numbers = wbsOf(entries);
  const out = [];
  for (const e of entries) {
    if (e.kind !== 'task') continue;
    const x = e.task;
    const dated = x.start != null && x.end != null;
    out.push([
      numbers.get(x.id) || '',
      x.title || '',
      dated ? iso(x.start) : '',
      dated ? iso(x.end) : '',
      dated ? String(x.kind === 'milestone' ? 0 : length(x.start, x.end)) : '',
      x.status == null ? '' : String(x.status),
      (x.people || []).join(', '),
      x.progress == null ? '' : String(Math.round(x.progress * 100)),
    ]);
  }
  return out;
}

/** Tab-separated text: a tab or a line break inside a cell becomes a space, so every cell stays in its column. */
export function toTsv(head, rows) {
  const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ');
  return [head, ...rows].map((r) => r.map(clean).join('\t')).join('\n') + '\n';
}
