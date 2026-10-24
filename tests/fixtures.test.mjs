// The schemas role detection will be tested against (M1), checked against the templates role detection
// must recognise. If Grist changes one of its templates and the fixture is refreshed with
// scripts/fetch-template-schemas.mjs, this is where the detection's assumptions fail first.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const read = (p) => JSON.parse(readFileSync(join(HERE, 'fixtures', p), 'utf8'));

const templates = Object.fromEntries(readdirSync(join(HERE, 'fixtures/templates'))
  .map((f) => [f.replace(/\.json$/, ''), read('templates/' + f)]));
const col = (tpl, table, id) => templates[tpl]?.tables.find((t) => t.id === table)?.columns.find((c) => c.id === id);
const has = (tpl, table, id, type, formula) => {
  const c = col(tpl, table, id);
  ok(`${tpl}: ${table}.${id} is ${type}${formula ? ' (formula)' : ''}`, !!c && c.type === type && (formula === undefined || c.isFormula === formula));
};

// The four templates the plan recognises outright
has('project-management', 'All_Tasks', 'Description', 'Text');
has('project-management', 'All_Tasks', 'Due_Date', 'Date', false);
has('project-management', 'All_Tasks', 'Status', 'Choice');
has('project-management', 'All_Tasks', 'Assignee', 'Ref:People');
has('project-management', 'All_Tasks', 'Project', 'Ref:Projects');
has('lab-project-management', 'Tasks', 'Task', 'Text');
has('lab-project-management', 'Tasks', 'Due_Date', 'Date');
has('lab-project-management', 'Tasks', 'Status', 'Choice');
has('lab-project-management', 'Tasks', 'Assigned_To', 'Ref:People');
has('lab-project-management', 'Tasks', 'Project', 'Ref:Projects');
has('rental-management', 'Leases', 'Lease_Start_Date', 'Date', false);
has('rental-management', 'Leases', 'Lease_End_Date', 'Date', true);
has('rental-management', 'Leases', 'Apartment', 'Ref:Apartments');
has('social-media-content-calendar', 'Campaigns', 'Campaign', 'Text');
has('social-media-content-calendar', 'Campaigns', 'Start', 'Date');
has('social-media-content-calendar', 'Campaigns', 'End', 'Date');

// Design rule 5 rests on this: Grist's own task templates have a due date and no start date.
for (const [tpl, table] of [['project-management', 'All_Tasks'], ['lab-project-management', 'Tasks'], ['recurring-tasks', 'Tasks']]) {
  const cols = templates[tpl].tables.find((t) => t.id === table).columns;
  ok(`${tpl}: ${table} has a due date`, cols.some((c) => /due/i.test(c.id) && c.type === 'Date'));
  ok(`${tpl}: ${table} has no start date`, !cols.some((c) => /start|begin/i.test(c.id)));
}

// Rival widgets: every column the expected mapping names exists in their schema
const rivals = read('rivals.json');
const tf = rivals.taskflow.tables.Tasks.map((c) => c.id);
for (const [role, id] of Object.entries(rivals.taskflow.expect)) ok(`TaskFlow Tasks.${id} exists for ${role}`, tf.includes(id));
ok('Varamil Kanban maps a status and a title', Object.values(rivals['varamil-kanban'].mapping).includes('status') && Object.values(rivals['varamil-kanban'].mapping).includes('title'));
ok('old calendar maps start and title', rivals['grist-calendar'].mapping.startDate === 'start' && rivals['grist-calendar'].mapping.title === 'title');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
