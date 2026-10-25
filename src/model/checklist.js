// A checklist kept in a text cell (M28): one item to a line, "[ ] write the brief" and "[x] book the room"; any other line is a note and is kept
// as it is. Ticking an item changes that line's box and nothing else. Pure: tests/checklist.test.mjs.

const ITEM = /^(\s*(?:[-*•]\s+)?)(\[[ xX✓✔]?\]|[☐☑☒✓])(\s*)(.*)$/;
const TICKED = (box) => /[xX✓✔☑☒]/.test(box);

/**
 * @returns {{items: Array<{line: number, text: string, done: boolean}>, done: number, total: number}}  `line` counts all the lines of the cell
 */
export function parseChecklist(text) {
  const items = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, line) => {
    const m = ITEM.exec(raw);
    if (m) items.push({ line, text: m[4].trim(), done: TICKED(m[2]) });
  });
  const done = items.filter((x) => x.done).length;
  return { items, done, total: items.length };
}

/** The text with the box of one line ticked or cleared; the rest of the cell is as it was. */
export function setItem(text, line, done) {
  const lines = String(text ?? '').split(/(\r?\n)/);   // the line breaks stay in the list, so they come back as they were
  let n = 0;
  for (let i = 0; i < lines.length; i += 2) {
    if (n++ !== line) continue;
    const m = ITEM.exec(lines[i]);
    if (!m) return String(text ?? '');
    lines[i] = `${m[1]}${done ? '[x]' : '[ ]'}${m[3] || ' '}${m[4]}`;
    break;
  }
  return lines.join('');
}

/** The text with one more item at the end (on a line of its own). */
export function addItem(text, label) {
  const clean = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return String(text ?? '');
  const base = String(text ?? '').replace(/\s+$/, '');
  return (base ? base + '\n' : '') + '[ ] ' + clean;
}
