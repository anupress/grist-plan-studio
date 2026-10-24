// Quick edit: the mapped fields of one task in a small panel. One Save = one UpdateRecord, so it is
// one undo step in Grist. Formula columns are shown but locked; everything else of the row is in
// Grist's own record card (the button at the bottom, when the widget can open it).

import { el, clear } from '../core/util.js';
import { encodeInput } from '../model/edits.js';
import { dayOf, isoFromDay, dayFromISO, listOf, refId, plain } from '../model/values.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

// role -> label (the labels are the Columns panel's, so both say the same)
const FIELD_LABELS = {
  title: 'Name', start: 'Start date', end: 'End date', due: 'Due date', duration: 'Duration in days',
  status: 'Status', progress: 'Progress', done: 'Done', milestone: 'Milestone', assignee: 'Assigned to', project: 'Project',
  parent: 'Parent task', dependsOn: 'Depends on',
};

const sortedLabels = (map) => [...(map || new Map()).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));

/** One input for one column, reading the cell's current value; returns {node, read()} */
function inputFor(col, cell, labels, id, disabled) {
  const k = col.kind;
  if (k === 'Date' || k === 'DateTime') {
    const d = dayOf(cell, col.type);
    const node = el('input', { type: 'date', id, class: 'ps-input', value: d == null ? '' : isoFromDay(d), disabled });
    return { node, read: () => (node.value ? dayFromISO(node.value) : null), initial: d };
  }
  if (k === 'Bool') {
    const node = el('input', { type: 'checkbox', id, checked: plain(cell) === true, disabled });
    return { node, read: () => node.checked, initial: plain(cell) === true };
  }
  if (k === 'Numeric' || k === 'Int') {
    const v = plain(cell);
    const node = el('input', { type: 'number', id, class: 'ps-input ps-input--num', step: k === 'Int' ? '1' : 'any', value: v == null ? '' : String(v), disabled });
    return { node, read: () => node.value, initial: v == null ? '' : String(v) };
  }
  if (k === 'Choice' || k === 'Ref') {
    const current = k === 'Ref' ? refId(cell) || '' : plain(cell) ?? '';
    const items = k === 'Ref' ? sortedLabels(labels) : col.choices.map((c) => [c, c]);
    if (current !== '' && !items.some(([v]) => String(v) === String(current))) items.push([current, k === 'Ref' ? `${col.refTable}[${current}]` : String(current)]);
    const node = el('select', { id, class: 'ps-input', disabled }, [
      el('option', { value: '', text: t('— none —') }),
      ...items.map(([v, label]) => el('option', { value: String(v), text: String(label), selected: String(v) === String(current) })),
    ]);
    return { node, read: () => node.value, initial: String(current) };
  }
  if (k === 'RefList' || k === 'ChoiceList') {
    const chosen = new Set(listOf(cell).map(String));
    const items = k === 'RefList' ? sortedLabels(labels) : col.choices.map((c) => [c, c]);
    const boxes = items.map(([v, label]) => {
      const box = el('input', { type: 'checkbox', value: String(v), checked: chosen.has(String(v)), disabled });
      return { box, row: el('label', { class: 'ps-check' }, [box, el('span', { text: String(label) })]) };
    });
    const node = el('div', { id, class: 'ps-checks', role: 'group' }, boxes.map((b) => b.row));
    const read = () => boxes.filter((b) => b.box.checked).map((b) => b.box.value);
    return { node, read, initial: [...chosen].sort().join('\u0001'), compare: () => read().sort().join('\u0001') };
  }
  const node = el('input', { type: 'text', id, class: 'ps-input', value: plain(cell) == null ? '' : String(plain(cell)), disabled });
  return { node, read: () => node.value, initial: plain(cell) == null ? '' : String(plain(cell)) };
}

/**
 * @param s  {row, roles, columns, labels, editable, canOpenCard, note, booking: true in the booking grid}
 * @param on {onSave({fields, patch}), onOpenCard(), onClose()}
 */
export function openQuickEdit(host, s, on) {
  const inputs = [];
  const fieldRows = [];
  for (const [role, label] of Object.entries(FIELD_LABELS)) {
    const colId = s.roles[role];
    const col = colId && s.columns.find((c) => c.id === colId);
    if (!col) continue;
    const id = 'ps-qe-' + role;
    const locked = !s.editable || col.isFormula;
    const inp = inputFor(col, s.row[col.id], s.labels[col.id], id, locked);
    inputs.push({ col, inp, locked });
    fieldRows.push(el('div', { class: 'ps-field' + (col.kind === 'Bool' ? ' ps-field--check' : '') }, [
      el('label', { for: id, text: t(label) }),
      inp.node,
      col.isFormula ? el('p', { class: 'ps-hint', text: t('A formula fills this column.') }) : null,
    ]));
  }

  const save = () => {
    const out = { fields: {}, patch: {} };
    for (const { col, inp, locked } of inputs) {
      if (locked) continue;
      const now = inp.compare ? inp.compare() : inp.read();
      if (String(now ?? '') === String(inp.initial ?? '')) continue;
      const [value, cell] = encodeInput(col, inp.read(), s.row[col.id]);
      out.fields[col.id] = value;
      out.patch[col.id] = cell;
    }
    close();
    if (Object.keys(out.fields).length) on.onSave(out);
  };

  const panel = el('div', { class: 'ps-drawer ps-drawer--narrow', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-qe-head' }, [
    el('div', { class: 'ps-drawer__head' }, [
      el('h2', { id: 'ps-qe-head', text: s.booking ? (s.editable ? t('Edit booking') : t('Booking')) : s.editable ? t('Edit task') : t('Task') }),
      el('button', { type: 'button', class: 'ps-icon-btn', 'aria-label': t('Close'), text: '×', onclick: () => close() }),
    ]),
    el('form', { class: 'ps-drawer__body', onsubmit: (e) => { e.preventDefault(); if (s.editable) save(); } }, [
      s.note ? el('p', { class: 'ps-note', text: s.note }) : null,
      ...fieldRows,
      el('button', { type: 'submit', hidden: true }),
    ]),
    el('div', { class: 'ps-drawer__foot' }, [
      s.canOpenCard ? el('button', { type: 'button', class: 'ps-btn', text: t('Open Grist’s card'), title: t('Every column of this row, in Grist’s record card'), onclick: () => { close(); on.onOpenCard?.(); } }) : null,
      el('span', { class: 'ps-spacer' }),
      el('button', { type: 'button', class: 'ps-btn', text: s.editable ? t('Cancel') : t('Close'), onclick: () => close() }),
      s.editable ? el('button', { type: 'button', class: 'ps-btn ps-btn--primary', text: t('Save'), onclick: save }) : null,
    ]),
  ]);
  const scrim = el('div', { class: 'ps-scrim', onclick: () => close() });
  let closed = false;
  let release = () => {};
  function close() {
    if (closed) return;
    closed = true;
    release();
    scrim.remove();
    panel.remove();
    on.onClose?.();
  }
  host.append(scrim, panel);
  release = trapFocus(panel, close);
  (panel.querySelector('.ps-drawer__body input:not([disabled]), .ps-drawer__body select:not([disabled])') || panel.querySelector('button'))?.focus();
  return { close };
}
