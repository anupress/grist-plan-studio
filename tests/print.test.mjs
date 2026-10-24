// Print geometry: page sizes, the scale that fits a plan across a page, the header units for it, and
// how a wide plan or grid splits into pages.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const P = await imp('src/print/layout.js');
const { dayFromISO: day, isoFromDay: iso } = await imp('src/model/values.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

eq('A4 landscape, 10 mm margins: 277 × 190 mm', P.pageArea('A4'), { w: Math.floor(277 * 96 / 25.4), h: Math.floor(190 * 96 / 25.4) });
eq('A3 landscape: 400 × 277 mm', P.pageArea('A3'), { w: 1511, h: 1046 });
eq('the @page rule', P.pageRule('A3'), '@page { size: A3 landscape; margin: 10mm; }');
eq('an unknown paper is A4', P.pageRule('Letter'), '@page { size: A4 landscape; margin: 10mm; }');

// a two-month plan on A4 (chart about 800 px): weeks under months
{
  const f = P.fitFrame({ from: day('2026-11-02'), to: day('2026-12-23') }, 800);
  eq('snapped to whole weeks around the plan', [iso(f.from), iso(f.to)], ['2026-10-26', '2026-12-27']);
  eq('…at a scale that fills the width exactly', Math.round(f.px * (f.to - f.from + 1)), 800);
  eq('weeks under months at ~12.7 px a day', [f.top, f.bottom], ['month', 'week']);
}
eq('days when there is room', P.unitsFor(20), { top: 'month', bottom: 'day' });
eq('months for a year-long plan', P.unitsFor(1.5), { top: 'year', bottom: 'month' });
eq('quarters for several years', P.unitsFor(0.3), { top: 'year', bottom: 'quarter' });

// several pages at the Gantt chart's week zoom (12 px a day): 1000 px holds 11 whole weeks (924 px)
{
  const frame = { from: day('2026-01-05'), to: day('2026-12-27'), px: 12, weekStart: 1, top: 'month', bottom: 'week' };
  const s = P.slices(frame, 1000);
  eq('11 weeks a page, the year in five pages', [s.length, s.map((x) => (x.to - x.from + 1) / 7)], [5, [11, 11, 11, 11, 7]]);
  eq('slices meet without a gap', s.slice(1).every((x, i) => x.from === s[i].to + 1), true);
  eq('and cover the whole frame', [iso(s[0].from), iso(s[s.length - 1].to)], ['2026-01-05', '2026-12-27']);
}
eq('a unit wider than a page is cut', P.slices({ from: 0, to: 60, px: 40, weekStart: 1, bottom: 'month' }, 400).length > 1, true);

eq('periods per page: 30 days at 40 px in 1000 px need two pages, shared 15 and 15', P.periodPages(30, 1000, 40), [[0, 14], [15, 29]]);
eq('one page when they fit', P.periodPages(4, 1000, 40), [[0, 3]]);
eq('lanes per page', P.lanePages(7, 1046, 230), [[0, 3], [4, 6]]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
