// Reading the document around the task rows: column metadata, the tables References point at, and
// this widget's own section. All of it through connect.js with full access.
//
// The task rows themselves arrive by push (onRecords). These tables do not: Grist sends nothing
// when another table changes (M0, question 7), so the caller re-reads labels on a timer.

import { fetchRows } from '../grist/connect.js';
import { tableColumns } from '../model/schema.js';
import { plain, dayOf } from '../model/values.js';

let metaCache = null;
export function forgetMeta() { metaCache = null; }

async function meta({ mustHave = null } = {}) {
  // A table made after the metadata was read (a Holidays table added just now) is not in the cache.
  if (metaCache && mustHave && !metaCache.tables.some((t) => t.tableId === mustHave)) metaCache = null;
  if (!metaCache) {
    const [tables, columns] = await Promise.all([fetchRows('_grist_Tables'), fetchRows('_grist_Tables_column')]);
    metaCache = { tables, columns };
  }
  return metaCache;
}

/** The task table's columns, in Grist's order. */
export async function loadColumns(tableId) {
  const m = await meta();
  return tableColumns(tableId, m.tables, m.columns);
}

/**
 * This widget's own section in _grist_Views_section, if it can be told apart: a custom section on
 * this table whose URL is this page. With two Plan Studio widgets on the same table, the one whose
 * stored options match these is it; failing that there is no answer (null), and the callers fall
 * back to what works without one.
 *
 * @returns {Promise<{id, fieldCount, customView, linkSrcSectionRef, linkTargetColRef, linkTargetColId}|null>}
 */
export async function loadOwnSection(tableId, options = null) {
  try {
    const m = await meta();
    const tableRef = m.tables.find((t) => t.tableId === tableId)?.id;
    const [sections, fields] = await Promise.all([fetchRows('_grist_Views_section'), fetchRows('_grist_Views_section_field')]);
    const here = location.origin + location.pathname;
    const parse = (s) => { try { return JSON.parse(JSON.parse(s.options || '{}').customView || '{}'); } catch { return {}; } };
    let mine = sections.filter((s) => s.parentKey === 'custom' && s.tableRef === tableRef)
      .map((s) => ({ s, cv: parse(s) }))
      .filter(({ cv }) => typeof cv.url === 'string' && cv.url.split('?')[0] === here);
    if (mine.length > 1 && options) {
      const want = JSON.stringify(options);
      mine = mine.filter(({ cv }) => { try { return JSON.stringify(typeof cv.widgetOptions === 'string' ? JSON.parse(cv.widgetOptions) : cv.widgetOptions) === want; } catch { return false; } });
    }
    if (mine.length !== 1) return null;
    const { s, cv } = mine[0];
    const target = m.columns.find((c) => c.id === s.linkTargetColRef);
    return {
      id: s.id,
      fieldCount: fields.filter((f) => f.parentId === s.id).length,
      customView: cv,
      linkSrcSectionRef: s.linkSrcSectionRef || 0,
      linkTargetColRef: s.linkTargetColRef || 0,
      linkTargetColId: target ? target.colId : null,
    };
  } catch { return null; }
}

/** The column mapping a previous widget left in this section (customView.columnsMapping). */
export async function loadForeignMapping(tableId) {
  const own = await loadOwnSection(tableId);
  return own?.customView?.columnsMapping || null;
}

function cellLabel(v, type) {
  if (v == null || v === '') return '';
  if (/^Date$/.test(type) && typeof v === 'number') return new Date(v * 1000).toISOString().slice(0, 10);
  if (Array.isArray(v) && v[0] === 'L') return v.slice(1).join(', ');
  const p = plain(v);
  return p == null ? '' : String(p);
}

/**
 * For each Reference column the roles use: rowId -> the text Grist shows for it (the referenced
 * table's "show column"). One read per referenced table.
 */
export async function loadLabels(columns, roles) {
  const m = await meta();
  const wanted = Object.values(roles).map((id) => columns.find((c) => c.id === id)).filter((c) => c && c.refTable);
  const tables = new Map();
  const out = {};
  for (const c of wanted) {
    if (!tables.has(c.refTable)) tables.set(c.refTable, fetchRows(c.refTable).catch(() => []));
    const rows = await tables.get(c.refTable);
    const target = m.tables.find((t) => t.tableId === c.refTable);
    const shown = target && c.visibleColId ? m.columns.find((x) => x.parentId === target.id && x.colId === c.visibleColId) : null;
    const map = new Map();
    // In the referenced table's own order (its manualSort), so lanes made from it line up the same way.
    const ordered = rows.some((r) => typeof r.manualSort === 'number') ? [...rows].sort((a, b) => (a.manualSort ?? 0) - (b.manualSort ?? 0)) : rows;
    for (const r of ordered) map.set(r.id,shown ? cellLabel(r[shown.colId], shown.type) || `${c.refTable}[${r.id}]` : `${c.refTable}[${r.id}]`);
    out[c.id] = map;
  }
  return out;
}

/**
 * Days off from a table: each row with a date is a day off, or a run of days when the row has a
 * second date column (an end). The first text column names it. Rows that name a person are skipped
 * here: personal absences belong to the workload view (M5), not to everyone's calendar.
 * @returns {Promise<Map<number, string>>}
 */
export async function loadHolidayDays(tableId) {
  const out = new Map();
  if (!tableId) return out;
  const m = await meta({ mustHave: tableId });
  const cols = tableColumns(tableId, m.tables, m.columns);
  const dates = cols.filter((c) => c.kind === 'Date' || c.kind === 'DateTime');
  if (!dates.length) return out;
  const nameCol = cols.find((c) => c.kind === 'Text');
  const personCol = cols.find((c) => c.kind === 'Ref' || c.kind === 'RefList');
  const rows = await fetchRows(tableId);
  const named = (v) => (Array.isArray(v) ? v.length > 1 : typeof v === 'number' ? v > 0 : !!v);
  for (const r of rows) {
    if (personCol && named(r[personCol.id])) continue;
    const a = dayOf(r[dates[0].id], dates[0].type);
    if (a == null) continue;
    const b = dates[1] ? dayOf(r[dates[1].id], dates[1].type) : null;
    const name = (nameCol && r[nameCol.id]) || '';
    for (let d = a; d <= (b != null && b >= a ? Math.min(b, a + 366) : a); d++) out.set(d, String(name));
  }
  return out;
}

/**
 * A whole table with its columns: the booking grid's periods table, or the resources table its filter
 * reads (only rooms whose Type is Hall).
 * @returns {Promise<{columns, rows} | null>}
 */
export async function loadTable(tableId) {
  if (!tableId) return null;
  const m = await meta({ mustHave: tableId });
  const columns = tableColumns(tableId, m.tables, m.columns);
  if (!columns.length) return null;
  const rows = await fetchRows(tableId);
  const ordered = rows.some((r) => typeof r.manualSort === 'number') ? [...rows].sort((a, b) => (a.manualSort ?? 0) - (b.manualSort ?? 0)) : rows;
  return { columns, rows: ordered };
}

/** Every table a person made (no summaries, no Grist internals), read fresh. */
export async function listTables() {
  metaCache = null;
  const m = await meta();
  return m.tables.filter((t) => !t.summarySourceTable && !/^_grist|^GristHidden/.test(t.tableId)).map((t) => t.tableId);
}

/** A column's ref in _grist_Tables_column, read fresh (columns just added have one only now). */
export async function columnRefs() {
  metaCache = null;
  const m = await meta();
  return (tableId, colId) => {
    const tb = m.tables.find((t) => t.tableId === tableId);
    return tb ? m.columns.find((c) => c.parentId === tb.id && c.colId === colId)?.id || null : null;
  };
}

/** Tables that could hold days off: those with at least one date column. */
export async function listDatedTables() {
  metaCache = null;   // asked when the Columns panel opens: tables may have come and gone since
  const m = await meta();
  return m.tables
    .filter((t) => !t.summarySourceTable && !/^_grist|^GristHidden/.test(t.tableId))
    .filter((t) => tableColumns(t.tableId, m.tables, m.columns).some((c) => c.kind === 'Date' || c.kind === 'DateTime'))
    .map((t) => t.tableId);
}
