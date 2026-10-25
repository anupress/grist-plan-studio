// More fields in the edit window (M22): the mapped columns are always there; here, the other columns of the table a
// person wants to see and change in the same window (a sponsor, a budget, notes ...). Chosen in Settings and kept in
// the widget's options, like the board's card fields, so everyone who edits sees the same ones. Pure: tests/quickfields.test.mjs.

/** The columns that can be edited in the window as they are: text, a choice, a number, a date, a yes/no, a reference. */
export const QUICK_KINDS = ['Text', 'Choice', 'ChoiceList', 'Bool', 'Numeric', 'Int', 'Date', 'DateTime', 'Ref', 'RefList'];
export const MAX_QUICK = 8;

/** The columns Settings offers: not the ones a role already uses (they are in the window already), not a link to this table. */
export function quickCandidates(columns, roles, tableId) {
  const used = new Set(Object.values(roles).filter(Boolean));
  return columns.filter((c) => QUICK_KINDS.includes(c.kind) && !used.has(c.id) && c.refTable !== tableId);
}

/** Stored options -> {fields: [{ref, id}]}, at most MAX_QUICK, each once. */
export function cleanQuick(v) {
  const out = { fields: [] };
  if (!v || typeof v !== 'object' || !Array.isArray(v.fields)) return out;
  const seen = new Set();
  for (const f of v.fields) {
    if (!f || typeof f.id !== 'string' || seen.has(f.id)) continue;
    seen.add(f.id);
    out.fields.push({ ref: f.ref, id: f.id });
    if (out.fields.length >= MAX_QUICK) break;
  }
  return out;
}

/** The chosen columns as they are now: found by ref first (a renamed column), then by id; gone, mapped or unfit ones dropped. */
export function quickColumns(quick, columns, roles, tableId) {
  const offered = new Map(quickCandidates(columns, roles, tableId).map((c) => [c.id, c]));
  const out = [];
  for (const f of cleanQuick(quick).fields) {
    const col = columns.find((c) => c.ref === f.ref) || columns.find((c) => c.id === f.id);
    if (col && offered.has(col.id) && !out.includes(col)) out.push(col);
  }
  return out;
}
