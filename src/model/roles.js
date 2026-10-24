// Which column plays which part: the "roles" (start, end, assignee, status, ...).
//
// Plan Studio never dictates a schema. Every view works off roles ("the thing that is the start
// date"), and this file decides which column fills each one. In this order:
//
//   1. RECOGNITION. Grist's own templates (and TaskFlow's tables) are known exactly, so they are
//      matched as a whole by column set, not guessed column by column.
//   2. A PREVIOUS WIDGET'S MAPPING. Someone who swaps the URL of the old calendar or of Varamil's
//      Kanban for this one has already told Grist which column is which. That mapping is still
//      stored in the section, and it is taken over.
//   3. NAMES. Column ids and labels are matched against words in English, German and French, with
//      the column type as a gate: a Text column called "Start" is not a start date.
//
// Each column fills at most one role. The person can change any of it in the mapping panel.
//
// Pure and dependency-free: this is the file most likely to be wrong about a real document, so it
// is tested in Node against the template fixtures (tests/roles.test.mjs).

/** Lower-case, accents off, camelCase and snake_case split into words: 'dateDébut' -> 'date debut'. */
export function norm(s) {
  return String(s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

const DATE = ['Date', 'DateTime'];
const NUM = ['Numeric', 'Int'];

// Words that make a date column the wrong kind of date for any planning role.
const NOT_A_PLAN_DATE = ['created', 'creation', 'created at', 'updated', 'update', 'modified', 'last', 'timestamp',
  'birth', 'dob', 'missed', 'erstellt', 'geandert', 'aktualisiert', 'geburt', 'cree', 'cree le', 'modifie',
  'mise a jour', 'naissance', 'derniere'];

/**
 * The roles, in priority order (a tie goes to the role listed first).
 * strong: names that say it outright; mid: names that usually mean it (score × 3/4); weak: names that
 * only hint (score halved).
 * panel: shown in the mapping panel now (the others are detected and kept for later milestones).
 */
export const ROLES = [
  { id: 'title', kinds: ['Text', 'Choice', 'Any', 'Ref'], panel: true,
    strong: ['title', 'task', 'task name', 'name', 'subject', 'summary', 'aufgabe', 'titel', 'betreff',
      'bezeichnung', 'tache', 'titre', 'nom', 'intitule', 'libelle'],
    // who a booking is for: above an Event column to its left, below a column that says Task or Name
    mid: ['participant', 'tenant', 'guest', 'customer', 'client', 'exhibitor', 'vendor', 'teilnehmer', 'mieter', 'gast',
      'kunde', 'aussteller', 'locataire', 'exposant', 'invite'],
    weak: ['description', 'beschreibung', 'item', 'topic', 'topic name', 'lease id', 'event', 'veranstaltung', 'evenement'] },
  { id: 'start', kinds: DATE, panel: true, exclude: NOT_A_PLAN_DATE,
    strong: ['start', 'start date', 'begin', 'begins', 'from', 'starts', 'start time', 'beginn', 'startdatum', 'von', 'anfang',
      'debut', 'date de debut', 'date debut', 'du'],
    weak: ['date', 'datum', 'day', 'tag', 'jour', 'when', 'wann', 'quand', 'appointment', 'termin', 'move in', 'move in date',
      'check in', 'arrival', 'anreise', 'einzug', 'arrivee', 'entree', 'publication', 'publication time', 'publication date',
      'publish date', 'post date', 'go live', 'veroffentlichung', 'veroeffentlichung'] },
  { id: 'end', kinds: DATE, panel: true, exclude: NOT_A_PLAN_DATE,
    strong: ['end', 'end date', 'finish', 'finishes', 'to', 'until', 'ends', 'end time', 'ende', 'enddatum', 'bis',
      'fin', 'date de fin', 'date fin', 'au'],
    weak: ['move out', 'move out date', 'check out', 'departure', 'abreise', 'auszug', 'depart', 'sortie'] },
  { id: 'due', kinds: DATE, panel: true, exclude: NOT_A_PLAN_DATE,
    strong: ['due', 'due date', 'deadline', 'due on', 'faellig', 'fallig', 'frist', 'abgabe', 'echeance', 'date echeance',
      'date limite', 'date d echeance'],
    weak: ['target date', 'zieldatum'] },
  { id: 'duration', kinds: NUM, panel: true,
    strong: ['duration', 'days', 'length', 'duration days', 'dauer', 'tage', 'duree', 'jours'], weak: [] },
  { id: 'status', kinds: ['Choice', 'Ref', 'Text'], panel: true,
    strong: ['status', 'state', 'stage', 'phase', 'stand', 'zustand', 'statut', 'etat', 'etape'], weak: [] },
  { id: 'progress', kinds: NUM, panel: true,
    // a percentage of something else: a rent increase, a discount, a tax rate
    exclude: ['increase', 'decrease', 'rate', 'discount', 'tax', 'vat', 'interest', 'margin', 'erhohung', 'erhoehung', 'rabatt', 'steuer',
      'zins', 'satz', 'hausse', 'remise', 'taux', 'tva', 'marge'],
    strong: ['progress', '% complete', 'percent complete', 'complete %', 'done %', 'percent done', 'fortschritt',
      'erledigt %', 'avancement', 'progression', '% fait'], weak: ['percent', 'prozent', 'pourcentage'] },
  { id: 'done', kinds: ['Bool'], panel: true,
    strong: ['done', 'is done', 'completed', 'complete', 'finished', 'closed', 'erledigt', 'fertig', 'abgeschlossen',
      'fait', 'termine', 'cloture'], weak: [] },
  { id: 'milestone', kinds: ['Bool'], panel: true, strong: ['milestone', 'is milestone', 'meilenstein', 'jalon'], weak: [] },
  { id: 'assignee', kinds: ['Ref', 'RefList', 'Choice', 'ChoiceList', 'Text'], panel: true,
    strong: ['assignee', 'assignees', 'assigned to', 'assigned', 'owner', 'person', 'people', 'responsible', 'lead',
      'who', 'team member', 'coordinator', 'verantwortlich', 'koordinator', 'zustandig', 'zustaendig', 'bearbeiter', 'mitarbeiter', 'person',
      'responsable', 'assigne', 'assigne a', 'assignes', 'personne', 'pilote', 'coordinateur'], weak: ['team', 'staff'] },
  { id: 'project', kinds: ['Ref', 'Choice', 'Text'], panel: true,
    strong: ['project', 'epic', 'campaign', 'projekt', 'kampagne', 'projet', 'campagne'], weak: ['event', 'veranstaltung', 'evenement', 'category', 'kategorie', 'categorie'] },
  { id: 'colour', kinds: ['Choice', 'Text'], panel: true, strong: ['colour', 'color', 'farbe', 'couleur'], weak: [] },
  { id: 'parent', kinds: ['Ref'], sameTable: true, panel: true,
    strong: ['parent', 'parent task', 'epic', 'ubergeordnet', 'oberaufgabe', 'tache parente', 'parent tache'], weak: [] },
  { id: 'dependsOn', kinds: ['RefList', 'Ref'], sameTable: true, panel: true,
    strong: ['depends on', 'depends', 'dependencies', 'predecessors', 'predecessor', 'blocked by', 'after', 'depend de',
      'abhangig von', 'abhaengig von', 'vorganger', 'vorgaenger', 'nach', 'depend', 'predecesseurs', 'apres'], weak: [] },
  { id: 'resource', kinds: ['Ref', 'Choice', 'Text'], panel: true,
    strong: ['resource', 'room', 'desk', 'equipment', 'vehicle', 'stall', 'apartment', 'venue', 'store', 'shop', 'hut', 'booth',
      'pitch', 'unit', 'ressource', 'raum', 'saal', 'stand', 'fahrzeug', 'wohnung', 'laden', 'hutte', 'huette', 'salle', 'vehicule',
      'logement', 'boutique', 'emplacement', 'cabane'], weak: ['location', 'ort', 'lieu'] },
  // The booking grid's columns when they are a column of the bookings, not dates: a "Weekend" column.
  { id: 'period', kinds: ['Ref', 'Choice', 'Text'], panel: true,
    strong: ['period', 'weekend', 'slot', 'time slot', 'session', 'shift', 'round', 'zeitraum', 'wochenende', 'schicht', 'durchgang',
      'zeitfenster', 'periode', 'creneau', 'week end', 'seance'], weak: ['week', 'woche', 'semaine'] },
  { id: 'order', kinds: NUM, panel: true, strong: ['order', 'rank', 'position', 'sort', 'sort order', 'reihenfolge', 'ordre', 'rang'], weak: [] },
  // The work a task needs (the workload view): planned hours or person-days, never hours already spent
  // or a person's hours a week.
  { id: 'effort', kinds: NUM, panel: true,
    exclude: ['actual', 'spent', 'logged', 'worked', 'per week', 'a week', 'tatsachlich', 'tatsaechlich', 'gebucht', 'geleistet',
      'pro woche', 'reel', 'reelles', 'passe', 'passees', 'par semaine'],
    strong: ['effort', 'hours', 'estimate', 'estimated hours', 'estimation', 'estimation h', 'planned hours', 'hours planned',
      'effort hours', 'work hours', 'person days', 'man days', 'aufwand', 'stunden', 'schatzung', 'schaetzung', 'arbeitsaufwand',
      'stundenaufwand', 'personentage', 'manntage', 'geplante stunden', 'charge', 'heures', 'charge estimee', 'heures prevues',
      'jours homme'], weak: [] },
];
export const ROLE_IDS = ROLES.map((r) => r.id);
const BY_ID = new Map(ROLES.map((r) => [r.id, r]));

// Tables whose rows are people: a Reference to one of these is an assignee even without a telling name.
const PEOPLE_TABLES = ['people', 'person', 'persons', 'team', 'staff', 'users', 'user', 'members', 'employees', 'contacts',
  'personen', 'mitarbeiter', 'mitarbeitende', 'equipe', 'personnes', 'membres', 'agents', 'coordinators'];

/** Can this column fill this role at all? (Type only; names decide between the ones that can.) */
export function fits(roleId, col, tableId) {
  const role = BY_ID.get(roleId);
  if (!role || !col) return false;
  if (!role.kinds.includes(col.kind)) return false;
  if (role.sameTable && col.refTable !== tableId) return false;
  // A Reference to this very table is structure (parent, dependencies), never a person or a status.
  if (!role.sameTable && col.refTable && col.refTable === tableId) return false;
  return true;
}

function phraseScore(name, phrase) {
  if (!name || !phrase) return 0;
  if (name === phrase) return 4;
  const padded = ` ${name} `;
  if (padded.includes(` ${phrase} `)) return name.startsWith(phrase + ' ') ? 3 : 2;
  return phrase.length >= 5 && name.includes(phrase) ? 1 : 0;
}

/** How strongly a column's id and label say "I am this role". 0 = not at all. */
export function nameScore(roleId, col) {
  const role = BY_ID.get(roleId);
  const names = [norm(col.id), norm(col.label)].filter(Boolean);
  if (role.exclude && names.some((n) => role.exclude.some((x) => phraseScore(n, x) >= 2))) return 0;
  let best = 0;
  for (const n of names) {
    for (const p of role.strong) best = Math.max(best, phraseScore(n, p));
    for (const p of role.mid || []) best = Math.max(best, phraseScore(n, p) * 0.75);
    for (const p of role.weak) best = Math.max(best, phraseScore(n, p) / 2);
  }
  return best;
}

// ---- 1. recognition ---------------------------------------------------------------------------

/** Known tables, matched by column set (id -> kind). Every listed column must be there. */
export const KNOWN = [
  { name: 'Grist Project Management',
    signature: { Description: 'Text', Due_Date: 'Date', Status: 'Choice', Assignee: 'Ref', Project: 'Ref' },
    roles: { title: 'Description', due: 'Due_Date', status: 'Status', assignee: 'Assignee', project: 'Project' } },
  { name: 'Grist Lab Project Management',
    signature: { Task: 'Text', Due_Date: 'Date', Status: 'Choice', Assigned_To: 'Ref', Project: 'Ref' },
    roles: { title: 'Task', due: 'Due_Date', status: 'Status', assignee: 'Assigned_To', project: 'Project' } },
  { name: 'Grist Rental Management (leases)',
    signature: { Lease_Start_Date: 'Date', Lease_End_Date: 'Date', Apartment: 'Ref', Lease_ID: 'Text' },
    roles: { title: 'Lease_ID', start: 'Lease_Start_Date', end: 'Lease_End_Date', resource: 'Apartment' } },
  { name: 'Grist Social Media Content Calendar (campaigns)',
    signature: { Campaign: 'Text', Start: 'Date', End: 'Date' },
    roles: { title: 'Campaign', start: 'Start', end: 'End' } },
  { name: 'TaskFlow',
    signature: { titre: 'Text', dateDebut: 'Date', dateEcheance: 'Date', statut: 'Choice', projet: 'Ref', assignees: 'RefList' },
    roles: { title: 'titre', start: 'dateDebut', due: 'dateEcheance', status: 'statut', progress: 'progression',
      project: 'projet', assignee: 'assignees', dependsOn: 'dependDe', parent: 'parentTask', effort: 'estimationH', colour: 'couleur' } },
];

export function recognise(columns) {
  const byId = new Map(columns.map((c) => [c.id, c]));
  for (const k of KNOWN) {
    if (!Object.entries(k.signature).every(([id, kind]) => byId.get(id)?.kind === kind)) continue;
    const roles = {};
    for (const [role, colId] of Object.entries(k.roles)) if (byId.has(colId)) roles[role] = colId;
    return { name: k.name, roles };
  }
  return null;
}

// ---- 2. a previous widget's mapping ------------------------------------------------------------

/** Column-mapping keys other widgets store in the section (customView.columnsMapping) -> our roles. */
export const FOREIGN_KEYS = {
  // Grist's calendar, from before it became native in 1.7.19
  startDate: 'start', endDate: 'end', title: 'title', type: 'colour',
  // Varamil's Kanban
  STATUT: 'status', DESCRIPTION: 'title', DEADLINE: 'due', REFERENCE_PROJET: 'project', RESPONSABLE: 'assignee', COULEUR: 'colour',
};

export function fromForeignMapping(mapping, columns) {
  if (!mapping || typeof mapping !== 'object') return {};
  const ids = new Set(columns.map((c) => c.id));
  const roles = {};
  for (const [key, value] of Object.entries(mapping)) {
    const role = FOREIGN_KEYS[key];
    const colId = Array.isArray(value) ? value[0] : value;
    if (role && typeof colId === 'string' && ids.has(colId) && !roles[role]) roles[role] = colId;
  }
  return roles;
}

// ---- 3. names ---------------------------------------------------------------------------------

function typeOnlyScore(roleId, col, tableId) {
  if (roleId === 'parent' && col.kind === 'Ref' && col.refTable === tableId) return 0.5;
  if (roleId === 'dependsOn' && col.kind === 'RefList' && col.refTable === tableId) return 0.5;
  if (roleId === 'assignee' && col.refTable && PEOPLE_TABLES.includes(norm(col.refTable))) return 1;
  return 0;
}

/**
 * Every role -> the column that fills it.
 *
 * @param {Array} columns  from schema.tableColumns()
 * @param {{tableId?: string, foreignMapping?: object}} opts
 * @returns {{roles: Object<string,string>, source: {kind: string, name?: string}}}
 */
export function detectRoles(columns, { tableId = null, foreignMapping = null } = {}) {
  const roles = {};
  const used = new Set();
  const take = (role, colId) => { if (!roles[role] && colId && !used.has(colId)) { roles[role] = colId; used.add(colId); } };
  let source = { kind: 'names' };

  const known = recognise(columns);
  if (known) {
    for (const [r, c] of Object.entries(known.roles)) take(r, c);
    source = { kind: 'template', name: known.name };
  } else {
    const foreign = fromForeignMapping(foreignMapping, columns);
    if (Object.keys(foreign).length) {
      for (const [r, c] of Object.entries(foreign)) {
        const col = columns.find((x) => x.id === c);
        if (fits(r, col, tableId)) take(r, c);
      }
      source = { kind: 'mapping' };
    }
  }

  // Names fill whatever is still open. Best score first; a tie goes to the role listed first, then
  // to the column further left.
  const candidates = [];
  ROLES.forEach((role, ri) => {
    if (roles[role.id]) return;
    columns.forEach((col, ci) => {
      if (used.has(col.id) || !fits(role.id, col, tableId)) return;
      const s = Math.max(nameScore(role.id, col), typeOnlyScore(role.id, col, tableId));
      if (s > 0) candidates.push({ role: role.id, col: col.id, s, ri, ci });
    });
  });
  candidates.sort((a, b) => b.s - a.s || a.ri - b.ri || a.ci - b.ci);
  for (const c of candidates) take(c.role, c.col);

  // A table always has something to call its rows: the first text column, data before formulas.
  if (!roles.title) {
    const text = columns.filter((c) => c.kind === 'Text' && !used.has(c.id));
    take('title', (text.find((c) => !c.isFormula) || text[0])?.id);
  }
  return { roles, source };
}

/** Enough to draw a Gantt chart: a name for each row and at least one date. */
export function ganttReady(roles) {
  return !!(roles.title && (roles.start || roles.end || roles.due));
}

// ---- stored mappings ---------------------------------------------------------------------------

/** {role: colId} -> what is saved: {role: {ref, id}}. The ref survives a column rename. */
export function toStored(roles, columns) {
  const out = {};
  for (const [role, colId] of Object.entries(roles)) {
    const col = columns.find((c) => c.id === colId);
    if (col) out[role] = { ref: col.ref, id: col.id };
  }
  return out;
}

/**
 * What was saved -> {role: colId} for the columns as they are now: found by ref first (renamed
 * columns), then by id (a copied document, where refs differ). Roles whose column is gone, or no
 * longer fits, are dropped.
 */
export function fromStored(stored, columns, tableId) {
  const roles = {};
  if (!stored || typeof stored !== 'object') return roles;
  for (const [role, v] of Object.entries(stored)) {
    if (!BY_ID.has(role) || !v) continue;
    const col = columns.find((c) => c.ref === v.ref) || columns.find((c) => c.id === v.id);
    if (col && fits(role, col, tableId)) roles[role] = col.id;
  }
  return roles;
}
