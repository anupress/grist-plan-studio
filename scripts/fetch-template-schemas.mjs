// Saves the schemas of Grist's own planning-related templates as test fixtures for role detection.
// Public templates read through Grist's public API: no key, nothing written anywhere but here.
//   node scripts/fetch-template-schemas.mjs
import fs from 'node:fs';

const DOCS = {
  'project-management': 'hifkng53AxyQfocgB67uQK',
  'lab-project-management': '2wxXx96myxJWtKCxfkh5Sb',
  'task-management': '6D8E2h2DQNwSbZPwhqRi6e',
  'rental-management': '5iMYwmESm33JpEECSqdZk2',
  'social-media-content-calendar': 'iPKJA6u6j5urBRntphREqj',
  'recurring-tasks': 'qkMHNeA1xSsBuNJvG6Y9Ho',
  'event-volunteering': '9x8X3naCQmX8ptnQybFQ3G',
};
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };
const choicesOf = (wo) => { try { const o = JSON.parse(wo || '{}'); return o.choices || undefined; } catch { return undefined; } };

for (const [name, id] of Object.entries(DOCS)) {
  const base = `https://docs.getgrist.com/api/docs/${id}`;
  const { tables } = await get(base + '/tables');
  const out = { name, source: `https://templates.getgrist.com/${id}`, fetched: new Date().toISOString().slice(0, 10), tables: [] };
  for (const t of tables) {
    if (/^GristDocTour|_summary/.test(t.id)) continue;
    const { columns } = await get(`${base}/tables/${t.id}/columns`);
    out.tables.push({
      id: t.id,
      columns: columns.map((c) => ({
        id: c.id, label: c.fields.label, type: c.fields.type,
        isFormula: !!(c.fields.isFormula && c.fields.formula),
        ...(choicesOf(c.fields.widgetOptions) ? { choices: choicesOf(c.fields.widgetOptions) } : {}),
      })),
    });
  }
  fs.writeFileSync(`tests/fixtures/templates/${name}.json`, JSON.stringify(out, null, 1) + '\n');
  console.log(name, out.tables.map((t) => `${t.id}(${t.columns.length})`).join(' '));
}
