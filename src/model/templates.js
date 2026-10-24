// Starter templates and the "add the missing column" assistant: the Grist actions that set up an
// empty table, or add one column for a role. Pure, so every action is tested in Node
// (tests/templates.test.mjs) before it touches anyone's document.
//
// A template is two steps, because a Reference column should show a name and Grist needs the ids of
// the new columns for that: first the tables and columns (structure), then, once Grist has given
// them ids, which column each Reference shows plus a few sample rows (data). The person can undo both.

const isPlaceholder = (c) => c.type === 'Any' && !c.isFormula && /^[A-Z]$/.test(c.id);

/** A table name not taken yet: People, People2, People3... */
export function freeName(name, taken) {
  const set = new Set(taken);
  if (!set.has(name)) return name;
  for (let i = 2; i < 100; i++) if (!set.has(name + i)) return name + i;
  return name + Date.now();
}

/** A column id Grist accepts, from a label in any language: 'Date de début' -> 'Date_de_debut'. */
export function colIdFor(label) {
  const id = String(label).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z]/.test(id) ? id : 'C_' + id;
}

const choices = (list, colours = []) => JSON.stringify({
  choices: list, choiceOptions: Object.fromEntries(list.map((c, i) => [c, colours[i] ? { fillColor: colours[i], textColor: '#FFFFFF' } : {}]).filter(([, o]) => o.fillColor)),
});

/**
 * The templates. `t` translates the names a person sees (tables, columns, choices, samples).
 * Each: {id, label, opensAs, tables: [{name, columns: [{id, type, label, widgetOptions}], show (the column References show)}],
 *        columns: [...] (added to the widget's own table), refs: {colId: table name}, rows(dayOf, ids) -> {table: [records]}}
 */
export function templates(t) {
  const people = t('People'), events = t('Events'), stores = t('Stores'), participants = t('Participants'), rooms = t('Rooms');
  return [
    {
      id: 'plan', label: t('Project plan'), opensAs: 'gantt',
      tables: [{ name: people, columns: [{ id: 'Name', type: 'Text', label: t('Name') }], show: 'Name' }],
      columns: [
        { id: colIdFor(t('Task')), type: 'Text', label: t('Task') },
        { id: colIdFor(t('Start')), type: 'Date', label: t('Start') },
        { id: colIdFor(t('End')), type: 'Date', label: t('End') },
        { id: colIdFor(t('Status')), type: 'Choice', label: t('Status'), widgetOptions: choices([t('To do'), t('Doing'), t('Blocked'), t('Done')], ['#94A3B8', '#3B82F6', '#EF4444', '#22C55E']) },
        { id: colIdFor(t('Owner')), type: 'Ref:' + people, label: t('Owner'), ref: people },
        { id: colIdFor(t('Progress')), type: 'Numeric', label: t('Progress'), widgetOptions: JSON.stringify({ numMode: 'percent' }) },
        { id: colIdFor(t('Milestone')), type: 'Bool', label: t('Milestone') },
        { id: colIdFor(t('Depends on')), type: 'RefList:@self', label: t('Depends on'), ref: '@self' },
      ],
      rows: (day) => ({
        [people]: [{ Name: 'Ann' }, { Name: 'Ben' }, { Name: 'Chloé' }],
        '@self': [
          [t('Kick-off'), 0, 0, t('Done'), 1, 1, true, []],
          [t('Gather requirements'), 1, 4, t('Done'), 2, 1, false, [1]],
          [t('Design'), 7, 14, t('Doing'), 3, 0.4, false, [2]],
          [t('Build'), 15, 29, t('To do'), 2, 0, false, [3]],
          [t('Test'), 30, 35, t('To do'), 1, 0, false, [4]],
          [t('Launch'), 36, 36, t('To do'), 1, 0, true, [5]],
        ].map(([title, s, e, status, owner, progress, ms, deps]) => ({ title, start: day(s), end: day(e), status, owner, progress, ms, deps })),
      }),
    },
    {
      id: 'events', label: t('Event booking plan'), opensAs: 'booking',
      tables: [
        { name: events, columns: [{ id: 'Name', type: 'Text', label: t('Name') }], show: 'Name' },
        { name: stores, columns: [{ id: 'Name', type: 'Text', label: t('Name') }, { id: 'Type', type: 'Choice', label: t('Type'), widgetOptions: choices([t('Hut'), t('Tent')]) }], show: 'Name' },
        { name: participants, columns: [{ id: 'Name', type: 'Text', label: t('Name') }], show: 'Name' },
      ],
      columns: [
        { id: colIdFor(t('Event')), type: 'Ref:' + events, label: t('Event'), ref: events },
        { id: colIdFor(t('Weekend')), type: 'Choice', label: t('Weekend'), widgetOptions: choices([1, 2, 3].map((n) => t('Weekend {n}', { n }))) },
        { id: colIdFor(t('Store')), type: 'Ref:' + stores, label: t('Store'), ref: stores },
        { id: colIdFor(t('Participant')), type: 'Ref:' + participants, label: t('Participant'), ref: participants },
        { id: colIdFor(t('Fee')), type: 'Numeric', label: t('Fee') },
        { id: colIdFor(t('Paid')), type: 'Bool', label: t('Paid') },
      ],
      rows: () => ({
        [events]: [{ Name: t('Christmas market') }],
        [stores]: [1, 2, 3, 4].map((n) => ({ Name: t('Hut {n}', { n }), Type: t('Hut') })).concat([{ Name: t('Tent A'), Type: t('Tent') }]),
        [participants]: ['Bakery Nord', 'Candles & Co', 'Wood Toys', 'Honey Farm'].map((Name) => ({ Name })),
        '@self': [[1, 1, 1, 120], [1, 2, 2, 120], [2, 1, 1, 120], [2, 3, 3, 120], [3, 5, 4, 200]]
          .map(([w, store, p, fee]) => ({ event: 1, weekend: t('Weekend {n}', { n: w }), store, participant: p, fee, paid: false })),
      }),
    },
    {
      id: 'rooms', label: t('Room booking'), opensAs: 'booking',
      tables: [{ name: rooms, columns: [
        { id: 'Name', type: 'Text', label: t('Name') }, { id: 'Seats', type: 'Int', label: t('Seats') },
        { id: 'Type', type: 'Choice', label: t('Type'), widgetOptions: choices([t('Meeting room'), t('Hall')]) },
      ], show: 'Name' }],
      columns: [
        { id: colIdFor(t('Booking')), type: 'Text', label: t('Booking') },
        { id: colIdFor(t('Room')), type: 'Ref:' + rooms, label: t('Room'), ref: rooms },
        { id: colIdFor(t('Start')), type: 'Date', label: t('Start') },
        { id: colIdFor(t('End')), type: 'Date', label: t('End') },
        { id: colIdFor(t('Booked by')), type: 'Text', label: t('Booked by') },
      ],
      rows: (day) => ({
        [rooms]: [{ Name: t('Room {n}', { n: 1 }), Seats: 8, Type: t('Meeting room') }, { Name: t('Room {n}', { n: 2 }), Seats: 12, Type: t('Meeting room') }, { Name: t('Hall'), Seats: 80, Type: t('Hall') }],
        '@self': [[t('Team meeting'), 1, 0, 0, 'Ann'], [t('Workshop'), 3, 1, 2, 'Ben'], [t('Client visit'), 2, 2, 2, 'Chloé'], [t('Training'), 1, 7, 8, 'Ann']]
          .map(([title, room, s, e, who]) => ({ title, room, start: day(s), end: day(e), who })),
      }),
    },
  ];
}

/**
 * Step 1: the structure. The widget's empty table keeps its name; Grist's placeholder columns
 * (A, B, C, empty, untyped) go; the template's tables and columns are added.
 * @param ctx {tableId, columns (of the widget's table), tables: [existing table ids]}
 * @returns {{actions, names: {template table name -> actual table id}}}
 */
export function structureActions(tpl, ctx) {
  const names = {};
  const taken = [...ctx.tables];
  const actions = [];
  for (const tb of tpl.tables) {
    const id = freeName(tb.name, taken);
    taken.push(id);
    names[tb.name] = id;
    actions.push(['AddTable', id, tb.columns.map((c) => ({ id: c.id, type: c.type, label: c.label, ...(c.widgetOptions ? { widgetOptions: c.widgetOptions } : {}) }))]);
  }
  for (const c of ctx.columns.filter(isPlaceholder)) actions.push(['RemoveColumn', ctx.tableId, c.id]);
  const have = new Set(ctx.columns.filter((c) => !isPlaceholder(c)).map((c) => c.id));
  for (const c of tpl.columns) {
    if (have.has(c.id)) continue;
    const type = c.ref ? (c.type.startsWith('RefList') ? 'RefList:' : 'Ref:') + (c.ref === '@self' ? ctx.tableId : names[c.ref] || c.ref) : c.type;
    actions.push(['AddColumn', ctx.tableId, c.id, { type, label: c.label, ...(c.widgetOptions ? { widgetOptions: c.widgetOptions } : {}) }]);
  }
  return { actions, names };
}

/**
 * Step 2: what each Reference shows, and the sample rows.
 * @param meta {colRef(tableId, colId) -> ref | null}  read from Grist after step 1
 * @param names from structureActions
 * @param day  offset in days -> seconds of that Date (UTC midnight)
 */
export function dataActions(tpl, ctx, names, meta, day) {
  const actions = [];
  const tableOf = (n) => (n === '@self' ? ctx.tableId : names[n] || n);
  for (const c of tpl.columns.filter((x) => x.ref)) {
    const target = tableOf(c.ref);
    const shown = c.ref === '@self' ? tpl.columns[0].id : tpl.tables.find((tb) => tb.name === c.ref)?.show;
    const shownRef = meta.colRef(target, shown);
    const colRef = meta.colRef(ctx.tableId, c.id);
    if (!shownRef || !colRef) continue;
    actions.push(['ModifyColumn', ctx.tableId, c.id, { visibleCol: shownRef }]);
    actions.push(['SetDisplayFormula', ctx.tableId, null, colRef, `$${c.id}.${shown}`]);
  }
  const rows = tpl.rows(day);
  for (const [n, list] of Object.entries(rows)) {
    if (n === '@self') continue;
    actions.push(['BulkAddRecord', tableOf(n), list.map(() => null), Object.fromEntries(Object.keys(list[0]).map((k) => [k, list.map((r) => r[k])]))]);
  }
  const ids = tpl.columns.map((c) => c.id);
  const own = rows['@self'].map((r) => Object.values(r));
  const cols = Object.fromEntries(ids.map((id, i) => [id, own.map((v) => (Array.isArray(v[i]) ? (v[i].length ? ['L', ...v[i]] : null) : v[i]))]));
  actions.push(['BulkAddRecord', ctx.tableId, own.map(() => null), cols]);
  return actions;
}

// ---- the assistant: one column for one role -----------------------------------------------------------

/** What column a role gets when the person asks for it: its type, options and (translated) name. */
export function columnForRole(role, t, tableId) {
  const C = {
    start: ['Date', t('Start date')],
    end: ['Date', t('End date')],
    due: ['Date', t('Due date')],
    duration: ['Int', t('Duration in days')],
    status: ['Choice', t('Status'), choices([t('To do'), t('Doing'), t('Done')], ['#94A3B8', '#3B82F6', '#22C55E'])],
    progress: ['Numeric', t('Progress'), JSON.stringify({ numMode: 'percent' })],
    done: ['Bool', t('Done')],
    milestone: ['Bool', t('Milestone')],
    parent: ['Ref:' + tableId, t('Parent task')],
    dependsOn: ['RefList:' + tableId, t('Depends on')],
    order: ['Numeric', t('Order in a lane')],
    period: ['Choice', t('Period'), choices([1, 2, 3].map((n) => t('Period {n}', { n })))],
  }[role];
  if (!C) return null;
  const [type, label, widgetOptions] = C;
  return { id: colIdFor(label), type, label, ...(widgetOptions ? { widgetOptions } : {}) };
}
export const ASSISTED_ROLES = ['start', 'end', 'due', 'duration', 'status', 'progress', 'done', 'milestone', 'parent', 'dependsOn', 'order', 'period'];
