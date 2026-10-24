// Role detection against real schemas: Grist's templates, TaskFlow, and tables the way people write
// them in English, German and French. The point of every case is the same: the widget is pointed at
// a table it has never seen and should need no setup.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const { detectRoles, ganttReady, fits, norm, toStored, fromStored, fromForeignMapping } = await imp('src/model/roles.js');
const { columnsFromFixture } = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const tpl = Object.fromEntries(readdirSync(join(HERE, 'fixtures/templates'))
  .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(HERE, 'fixtures/templates', f), 'utf8'))]));
const table = (name, id) => columnsFromFixture(tpl[name].tables.find((t) => t.id === id).columns);
const pick = (roles, keys) => Object.fromEntries(keys.filter((k) => roles[k]).map((k) => [k, roles[k]]));
const cols = (spec) => columnsFromFixture(Object.entries(spec).map(([id, type]) => ({ id, type })));

// ---- normalising names
eq('camelCase and accents', norm('dateDébut'), 'date debut');
eq('snake_case', norm('Lease_Start_Date'), 'lease start date');
eq('trailing underscore', norm('Completed_'), 'completed');

// ---- Grist's templates are recognised whole
{
  const d = detectRoles(table('project-management', 'All_Tasks'), { tableId: 'All_Tasks' });
  eq('Project Management: recognised', d.source, { kind: 'template', name: 'Grist Project Management' });
  eq('Project Management: roles', pick(d.roles, ['title', 'due', 'status', 'assignee', 'project', 'start']),
    { title: 'Description', due: 'Due_Date', status: 'Status', assignee: 'Assignee', project: 'Project' });
  ok('Project Management: ready for a Gantt with no setup', ganttReady(d.roles));
  ok('Created_At is never a start date', !Object.values(d.roles).includes('Created_At'));
}
{
  const d = detectRoles(table('lab-project-management', 'Tasks'), { tableId: 'Tasks' });
  eq('Lab Project Management', pick(d.roles, ['title', 'due', 'status', 'assignee', 'project']),
    { title: 'Task', due: 'Due_Date', status: 'Status', assignee: 'Assigned_To', project: 'Project' });
}
{
  const d = detectRoles(table('rental-management', 'Leases'), { tableId: 'Leases' });
  eq('Rental leases', pick(d.roles, ['title', 'start', 'end', 'resource']),
    { title: 'Lease_ID', start: 'Lease_Start_Date', end: 'Lease_End_Date', resource: 'Apartment' });
}
{
  const d = detectRoles(table('social-media-content-calendar', 'Campaigns'), { tableId: 'Campaigns' });
  eq('Campaigns', pick(d.roles, ['title', 'start', 'end']), { title: 'Campaign', start: 'Start', end: 'End' });
}

// ---- the rest of the templates, by names alone
{
  const d = detectRoles(table('social-media-content-calendar', 'Social_Media_Posts'), { tableId: 'Social_Media_Posts' });
  eq('Social posts', pick(d.roles, ['title', 'start', 'project']), { title: 'Topic_Name', start: 'Publication_Time', project: 'Campaign' });
  eq('found by names', d.source.kind, 'names');
}
{
  const d = detectRoles(table('recurring-tasks', 'Tasks'), { tableId: 'Tasks' });
  eq('Recurring tasks', pick(d.roles, ['title', 'due', 'done']), { title: 'Task', due: 'Due_Date', done: 'Completed_' });
}
{
  const d = detectRoles(table('event-volunteering', 'Events'), { tableId: 'Events' });
  eq('Events', pick(d.roles, ['title', 'start', 'assignee']), { title: 'Event', start: 'Date', assignee: 'Event_Coordinator' });
}
{
  const d = detectRoles(table('rental-management', 'Tenancies'), { tableId: 'Tenancies' });
  eq('Tenancies: move-in and move-out', pick(d.roles, ['start', 'end']), { start: 'Move_In_Date', end: 'Move_Out_Date' });
}
{
  const d = detectRoles(table('task-management', 'Tasks'), { tableId: 'Tasks' });
  eq('Task Management', pick(d.roles, ['title', 'done', 'assignee', 'project']), { title: 'Description', done: 'IsDone', assignee: 'Person', project: 'Project' });
  ok('Task Management has no dates, so no Gantt (its dates sit in another table)', !ganttReady(d.roles));
}

// ---- TaskFlow
{
  const rivals = JSON.parse(readFileSync(join(HERE, 'fixtures/rivals.json'), 'utf8'));
  const d = detectRoles(columnsFromFixture(rivals.taskflow.tables.Tasks), { tableId: 'Tasks' });
  eq('TaskFlow recognised', d.source.name, 'TaskFlow');
  eq('TaskFlow roles', d.roles, Object.fromEntries(Object.entries(rivals.taskflow.expect)));
}

// ---- English, German and French tables written by people
{
  const c = cols({ Name: 'Text', Start_Date: 'Date', End_Date: 'Date', Owner: 'Ref:Team', Percent_Complete: 'Numeric',
    Milestone: 'Bool', Predecessors: 'RefList:Plan', Parent: 'Ref:Plan', Created: 'DateTime:Europe/London' });
  const d = detectRoles(c, { tableId: 'Plan' });
  eq('English plan', pick(d.roles, ['title', 'start', 'end', 'assignee', 'progress', 'milestone', 'dependsOn', 'parent']),
    { title: 'Name', start: 'Start_Date', end: 'End_Date', assignee: 'Owner', progress: 'Percent_Complete', milestone: 'Milestone', dependsOn: 'Predecessors', parent: 'Parent' });
  ok('a Created column is not a start date', d.roles.start !== 'Created');
}
{
  const c = cols({ Aufgabe: 'Text', Beginn: 'Date', Ende: 'Date', Status: 'Choice', Verantwortlich: 'Ref:Mitarbeiter',
    Fortschritt: 'Numeric', Erledigt: 'Bool', Vorganger: 'RefList:Aufgaben', Ubergeordnet: 'Ref:Aufgaben', Erstellt_am: 'DateTime:Europe/Berlin', Aufwand: 'Numeric' });
  const d = detectRoles(c, { tableId: 'Aufgaben' });
  eq('German plan', pick(d.roles, ['title', 'start', 'end', 'status', 'assignee', 'progress', 'done', 'dependsOn', 'parent', 'effort']),
    { title: 'Aufgabe', start: 'Beginn', end: 'Ende', status: 'Status', assignee: 'Verantwortlich', progress: 'Fortschritt', done: 'Erledigt', dependsOn: 'Vorganger', parent: 'Ubergeordnet', effort: 'Aufwand' });
}
{
  const c = columnsFromFixture([
    { id: 'Tache', label: 'Tâche', type: 'Text' }, { id: 'Date_de_debut', label: 'Date de début', type: 'Date' },
    { id: 'Echeance', label: 'Échéance', type: 'Date' }, { id: 'Statut', type: 'Choice' }, { id: 'Responsable', type: 'Ref:Equipe' },
    { id: 'Avancement', type: 'Numeric' }, { id: 'Jalon', type: 'Bool' }, { id: 'Depend_de', label: 'Dépend de', type: 'RefList:Taches' }]);
  const d = detectRoles(c, { tableId: 'Taches' });
  eq('French plan', pick(d.roles, ['title', 'start', 'due', 'status', 'assignee', 'progress', 'milestone', 'dependsOn']),
    { title: 'Tache', start: 'Date_de_debut', due: 'Echeance', status: 'Statut', assignee: 'Responsable', progress: 'Avancement', milestone: 'Jalon', dependsOn: 'Depend_de' });
}

// ---- types gate the names
{
  const d = detectRoles(cols({ Title: 'Text', Start: 'Text', Deadline: 'Date' }), { tableId: 'T' });
  ok('a Text column called Start is not a start date', !d.roles.start);
  eq('the date column still counts', d.roles.due, 'Deadline');
}
{
  const c = cols({ Task: 'Text', Owner: 'Ref:T', Due: 'Date' });
  ok('a Reference to the same table is not an assignee', !fits('assignee', c[1], 'T') && !detectRoles(c, { tableId: 'T' }).roles.assignee);
  eq('it is a parent', detectRoles(c, { tableId: 'T' }).roles.parent, 'Owner');
}
{
  const d = detectRoles(cols({ Notes: 'Text', When: 'DateTime:Europe/Paris' }), { tableId: 'T' });
  eq('no title by name: the first text column', d.roles.title, 'Notes');
  eq('a generic date is a start', d.roles.start, 'When');
}

// ---- a previous widget's mapping
{
  const c = cols({ Name: 'Text', Kickoff: 'Date', Wrapup: 'Date', Kind: 'Choice' });
  const d = detectRoles(c, { tableId: 'T', foreignMapping: { startDate: 'Kickoff', endDate: 'Wrapup', title: 'Name', type: 'Kind', isAllDay: null } });
  eq('old calendar mapping taken over', pick(d.roles, ['title', 'start', 'end', 'colour']), { title: 'Name', start: 'Kickoff', end: 'Wrapup', colour: 'Kind' });
  eq('source says so', d.source.kind, 'mapping');
  eq('Varamil Kanban keys', fromForeignMapping({ STATUT: 'Etat', DESCRIPTION: 'Libelle', DEADLINE: 'Pour', TAGS: ['A', 'B'] },
    cols({ Etat: 'Choice', Libelle: 'Text', Pour: 'Date', A: 'Text', B: 'Text' })), { status: 'Etat', title: 'Libelle', due: 'Pour' });
  eq('a mapped column that no longer exists is ignored', fromForeignMapping({ startDate: 'Gone' }, c), {});
}

// ---- saved mappings survive renames and copies
{
  const c = cols({ Task: 'Text', Beginn: 'Date' });
  const stored = toStored({ title: 'Task', start: 'Beginn' }, c);
  eq('stored by ref and id', stored, { title: { ref: 1, id: 'Task' }, start: { ref: 2, id: 'Beginn' } });
  const renamed = c.map((x) => (x.id === 'Beginn' ? { ...x, id: 'Begin' } : x));
  eq('a renamed column is found by ref', fromStored(stored, renamed, 'T'), { title: 'Task', start: 'Begin' });
  const copied = c.map((x) => ({ ...x, ref: x.ref + 100 }));
  eq('a copied document is found by id', fromStored(stored, copied, 'T'), { title: 'Task', start: 'Beginn' });
  const retyped = c.map((x) => (x.id === 'Beginn' ? { ...x, kind: 'Text', type: 'Text' } : x));
  eq('a column that no longer fits is dropped', fromStored(stored, retyped, 'T'), { title: 'Task' });
}

// ---- bookings (M5) -------------------------------------------------------------------------------
{
  // Pop-up stores over weekends, a flat list as described on the forum (community.getgrist.com/t/12396)
  const stores = columnsFromFixture([{ id: 'Event', type: 'Ref:Events' }, { id: 'Weekend', type: 'Choice' }, { id: 'Store', type: 'Ref:Stores' }, { id: 'Participant', type: 'Ref:Participants' }]);
  eq('pop-up stores: the store is the resource, the weekend the period, the participant names the booking', detectRoles(stores, { tableId: 'Bookings' }).roles,
    { resource: 'Store', period: 'Weekend', title: 'Participant', project: 'Event' });
  const own = columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Customer', type: 'Ref:Customers' }]);
  eq('a Task column still names the row over a Customer column', detectRoles(own, { tableId: 'T' }).roles.title, 'Task');
  const leases = tpl['rental-management'].tables.find((t) => t.id === 'Leases');
  eq('a rent increase in percent is not progress', detectRoles(columnsFromFixture(leases.columns), { tableId: 'Leases' }).roles.progress, undefined);
}

// ---- hours of work (M9) ------------------------------------------------------------------------------
{
  const roleOf = (cols) => detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, ...cols]), { tableId: 'T' }).roles;
  eq('Estimated hours is the effort', roleOf([{ id: 'Estimated_hours', type: 'Numeric' }]).effort, 'Estimated_hours');
  eq('Aufwand (h) is the effort', roleOf([{ id: 'Aufwand', type: 'Numeric', label: 'Aufwand (h)' }]).effort, 'Aufwand');
  eq('Charge estimée is the effort', roleOf([{ id: 'Charge_estimee', type: 'Numeric', label: 'Charge estimée' }]).effort, 'Charge_estimee');
  eq('Person days is the effort, not the duration', roleOf([{ id: 'Person_days', type: 'Numeric' }]), { title: 'Task', start: 'Start', effort: 'Person_days' });
  eq('hours already spent are not', roleOf([{ id: 'Actual_hours', type: 'Numeric' }]).effort, undefined);
  eq('hours a week are not', roleOf([{ id: 'Hours_per_week', type: 'Numeric' }]).effort, undefined);
  eq('Days stays the duration', roleOf([{ id: 'Days', type: 'Int' }]), { title: 'Task', start: 'Start', duration: 'Days' });
  eq('a text column is never the effort', roleOf([{ id: 'Hours', type: 'Text' }]).effort, undefined);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
