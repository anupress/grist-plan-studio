// Starter templates and the add-column assistant: the exact Grist actions they send, and that the
// tables they make are recognised by role detection in all three languages.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { search: '' };
const T = await imp('src/model/templates.js');
const I = await imp('src/i18n/index.js');
const { detectRoles } = await imp('src/model/roles.js');
const { columnsFromFixture } = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

eq('free names', [T.freeName('People', ['Table1']), T.freeName('People', ['People', 'People2'])], ['People', 'People3']);
eq('column ids from labels in any language', [T.colIdFor('Date de début'), T.colIdFor('Abhängig von'), T.colIdFor('2nd try')], ['Date_de_debut', 'Abhangig_von', 'C_2nd_try']);

// Grist's new blank table: A, B, C, empty and untyped
const blank = [{ id: 'A', type: 'Any', isFormula: false }, { id: 'B', type: 'Any', isFormula: false }, { id: 'C', type: 'Any', isFormula: false }];
I.setLanguage('en', { remember: false });
{
  const plan = T.templates(I.t).find((x) => x.id === 'plan');
  const { actions, names } = T.structureActions(plan, { tableId: 'Table1', columns: blank, tables: ['Table1', 'People'] });
  eq('a People table that exists already is not touched: People2', names, { People: 'People2' });
  eq('the placeholders go, the columns come, References point at the right tables', actions.map((a) => a[0] + ' ' + (a[0] === 'AddColumn' ? a[2] + ':' + a[3].type : a[0] === 'AddTable' ? a[1] : a[2])), [
    'AddTable People2', 'RemoveColumn A', 'RemoveColumn B', 'RemoveColumn C',
    'AddColumn Task:Text', 'AddColumn Start:Date', 'AddColumn End:Date', 'AddColumn Status:Choice', 'AddColumn Owner:Ref:People2',
    'AddColumn Progress:Numeric', 'AddColumn Milestone:Bool', 'AddColumn Depends_on:RefList:Table1',
  ]);
  const refs = { 'People2.Name': 51, 'Table1.Owner': 60, 'Table1.Task': 55, 'Table1.Depends_on': 63 };
  const data = T.dataActions(plan, { tableId: 'Table1' }, names, { colRef: (tb, c) => refs[tb + '.' + c] || null }, (n) => (20000 + n) * 86400);
  eq('References show names: the owner the person, a dependency the task', data.slice(0, 4), [
    ['ModifyColumn', 'Table1', 'Owner', { visibleCol: 51 }], ['SetDisplayFormula', 'Table1', null, 60, '$Owner.Name'],
    ['ModifyColumn', 'Table1', 'Depends_on', { visibleCol: 55 }], ['SetDisplayFormula', 'Table1', null, 63, '$Depends_on.Task'],
  ]);
  const own = data[data.length - 1];
  eq('six sample tasks, dated from today, linked in a chain', [own[0], own[1], own[2].length, own[3].Start[1], own[3].Depends_on[1]], ['BulkAddRecord', 'Table1', 6, (20001) * 86400, ['L', 1]]);
  const cols = columnsFromFixture(plan.columns.map((c) => ({ id: c.id, type: c.ref ? (c.ref === '@self' ? 'RefList:Table1' : 'Ref:People') : c.type })));
  eq('what it makes is recognised', detectRoles(cols, { tableId: 'Table1' }).roles, { title: 'Task', start: 'Start', end: 'End', status: 'Status', progress: 'Progress', milestone: 'Milestone', assignee: 'Owner', dependsOn: 'Depends_on' });
}

// every template, in every language, makes a table detection understands
for (const lang of ['en', 'de', 'fr']) {
  I.setLanguage(lang, { remember: false });
  const all = T.templates(I.t);
  const roles = {};
  for (const tpl of all) {
    const cols = columnsFromFixture(tpl.columns.map((c) => ({ id: c.id, label: c.label, type: c.ref ? (c.ref === '@self' ? 'RefList:Table1' : 'Ref:' + c.ref) : c.type, choices: [] })));
    const found = detectRoles(cols, { tableId: 'Table1' }).roles;
    roles[tpl.id] = Object.keys(found).sort().join(',');
    // what a booking is called: its name, not who booked it (found live in Grist: "Booked by" won once)
    if (tpl.id === 'rooms') eq(`${lang}: a room booking is named by its first column`, found.title, tpl.columns[0].id);
  }
  eq(`${lang}: project plan, event booking plan, room booking are detected`, roles, {
    plan: 'assignee,dependsOn,end,milestone,progress,start,status,title',
    events: 'period,project,resource,title',
    rooms: 'end,resource,start,title',
  });
}
I.setLanguage('en', { remember: false });

// the assistant
eq('a Start column for a due-date-only table', T.columnForRole('start', I.t, 'Tasks'), { id: 'Start_date', type: 'Date', label: 'Start date' });
eq('dependencies point at the table itself', T.columnForRole('dependsOn', I.t, 'Tasks').type, 'RefList:Tasks');
eq('progress is a percentage', JSON.parse(T.columnForRole('progress', I.t, 'Tasks').widgetOptions), { numMode: 'percent' });
I.setLanguage('fr', { remember: false });
eq('in French, a French name and a Grist-safe id', T.columnForRole('start', I.t, 'Tasks'), { id: 'Date_de_debut', type: 'Date', label: 'Date de début' });
I.setLanguage('en', { remember: false });
eq('roles a column cannot simply be made for (who, which room) are not offered', [T.columnForRole('assignee', I.t, 'T'), T.columnForRole('resource', I.t, 'T')], [null, null]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
