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
  parent: 'Parent task', dependsOn: 'Depends on', baselineStart: 'Planned start', baselineEnd: 'Planned end', doneOn: 'Done on',
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
 * The task's time (M10): logged against planned in words, and the timer and Log time buttons. Null when
 * there is nothing to say or do.
 * @param tm {logged, planned (hours | null), running (this person's timer is on this task), canTrack, canSetup, hours(h) -> text}
 */
function timeSection(tm, on, close) {
  if (!tm || (!tm.canTrack && !tm.canSetup && !tm.logged)) return null;
  const H = tm.hours;
  let words;
  if (tm.logged > 0.004 && tm.planned) {
    words = tm.logged > tm.planned + 0.004 ? t('{logged} of {planned} hours logged, {over} over the plan', { logged: H(tm.logged), planned: H(tm.planned), over: H(tm.logged - tm.planned) })
      : t('{logged} of {planned} hours logged, {left} left', { logged: H(tm.logged), planned: H(tm.planned), left: H(tm.planned - tm.logged) });
  } else if (tm.logged > 0.004) words = t('{logged} hours logged', { logged: H(tm.logged) });
  else words = tm.planned ? t('Nothing logged yet of {planned} planned hours', { planned: H(tm.planned) }) : t('Nothing logged yet');
  const over = tm.planned && tm.logged > tm.planned + 0.004;
  return el('section', { class: 'ps-qe-time', 'aria-labelledby': 'ps-qe-time-h' }, [
    el('h3', { id: 'ps-qe-time-h', text: t('Time') }),
    el('p', { class: 'ps-qe-time__words' + (over ? ' is-over' : ''), text: words }),
    tm.canTrack ? el('div', { class: 'ps-qe-time__actions' }, [
      tm.running
        ? el('button', { type: 'button', class: 'ps-btn', text: t('Stop timer'), onclick: () => { close(); on.onStopTimer?.(); } })
        : el('button', { type: 'button', class: 'ps-btn', text: t('Start timer'), onclick: () => { close(); on.onStartTimer?.(); } }),
      el('button', { type: 'button', class: 'ps-btn', text: t('Log time…'), onclick: () => { close(); on.onLogTime?.(); } }),
    ]) : null,
    !tm.canTrack && tm.canSetup ? el('button', { type: 'button', class: 'ps-link', text: t('Track time on tasks…'), onclick: () => { close(); on.onSetupTime?.(); } }) : null,
  ]);
}

/** Add to calendar (M11): what the file will hold, in words, and the button. Null for a task without a date. */
function calendarSection(c, on, close) {
  if (!c) return null;
  return el('section', { class: 'ps-qe-time ps-qe-cal', 'aria-labelledby': 'ps-qe-cal-h' }, [
    el('h3', { id: 'ps-qe-cal-h', text: t('Calendar') }),
    el('p', { text: c.words }),
    el('button', { type: 'button', class: 'ps-btn', text: t('Add to calendar…'), onclick: () => { close(); on.onCalendar?.(); } }),
  ]);
}

/**
 * @param s  {row, roles, columns, labels, extra: [column] (more fields to show, M22), editable, canOpenCard, canCopy (Duplicate and Delete are offered), note, booking: true in the booking grid, time: see timeSection,
 *            calendar: {words} | null, plan: how far the task has drifted from its plan, in words | null}
 * @param on {onSave({fields, patch}), onOpenCard(), onDuplicate(), onDelete(), onClose(), onStartTimer(), onStopTimer(), onLogTime(), onSetupTime(), onCalendar()}
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

  // more fields: the columns picked in Settings, after the mapped ones
  const extraRows = [];
  for (const col of s.extra || []) {
    const id = 'ps-qe-x-' + col.id;
    const locked = !s.editable || col.isFormula;
    const inp = inputFor(col, s.row[col.id], s.labels[col.id], id, locked);
    inputs.push({ col, inp, locked });
    extraRows.push(el('div', { class: 'ps-field' + (col.kind === 'Bool' ? ' ps-field--check' : '') }, [
      el('label', { for: id, text: col.label }),
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
      s.plan ? el('p', { class: 'ps-qe-plan', text: s.plan }) : null,
      ...fieldRows,
      extraRows.length ? el('h3', { class: 'ps-qe-more', text: t('More fields') }) : null,
      ...extraRows,
      el('button', { type: 'submit', hidden: true }),
    ]),
    timeSection(s.time, on, () => close()),
    calendarSection(s.calendar, on, () => close()),
    s.canOpenCard || s.canCopy ? el('div', { class: 'ps-drawer__tools' }, [
      s.canOpenCard ? el('button', { type: 'button', class: 'ps-btn', text: t('Open Grist’s card'), title: t('Every column of this row, in Grist’s record card'), onclick: () => { close(); on.onOpenCard?.(); } }) : null,
      s.canCopy ? el('button', { type: 'button', class: 'ps-btn', text: t('Duplicate'), title: t('A copy of this task, one step in Undo'), onclick: () => { close(); on.onDuplicate?.(); } }) : null,
      el('span', { class: 'ps-spacer' }),
      s.canCopy ? el('button', { type: 'button', class: 'ps-btn ps-btn--danger', text: t('Delete'), title: t('Delete this task (it asks first)'), onclick: () => { close(); on.onDelete?.(); } }) : null,
    ]) : null,
    el('div', { class: 'ps-drawer__foot' }, [
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
