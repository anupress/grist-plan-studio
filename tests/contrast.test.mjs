// Contrast: every pair of text and background colour the widget uses, in light and dark, reaches
// WCAG AA (4.5:1 for text, 3:1 for large text and the marks that carry meaning). The colours are read
// from the stylesheets themselves, so changing a token re-runs this check against the real value.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const css = ['app.css', 'board.css', 'views.css'].map((f) => fs.readFileSync(resolve(HERE, '../src/styles', f), 'utf8')).join('\n');

let pass = 0, fail = 0;
const ok = (n, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n} ${extra}`); } };

/** The tokens of the first :root block (light) and of the forced-dark block. */
function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--(ps-[\w-]+):\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g)) out[m[1]] = m[2];
  return out;
}
const light = {};
for (const m of css.matchAll(/(^|\n):root\s*\{([^}]*)\}/g)) Object.assign(light, tokens(m[2]));
const dark = { ...light };
for (const m of css.matchAll(/:root\[data-grist-appearance="dark"\]\s*\{([^}]*)\}/g)) Object.assign(dark, tokens(m[1]));

const lum = (hex) => {
  const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [text token, background token, minimum, what]
const PAIRS = [
  ['ps-ink', 'ps-surface', 4.5, 'text'],
  ['ps-muted', 'ps-surface', 4.5, 'secondary text'],
  ['ps-muted', 'ps-surface-2', 4.5, 'secondary text on group rows'],
  ['ps-muted', 'ps-ground', 4.5, 'lane counts and hints on the board floor'],
  ['ps-muted', 'ps-card', 4.5, 'dates on cards'],
  ['ps-ink', 'ps-card', 4.5, 'card titles'],
  ['ps-accent', 'ps-surface', 4.5, 'links'],
  ['ps-accent-ink', 'ps-accent', 4.5, 'primary buttons'],
  ['ps-crit', 'ps-card', 4.5, '"3 days late", "double booked"'],
  ['ps-crit', 'ps-ground', 4.5, '"1 over the limit"'],
  ['ps-ok', 'ps-surface', 4.5, '"3 free"'],
  ['ps-soon', 'ps-card', 4.5, '"today"'],
  ['ps-chrome-ink', 'ps-chrome', 4.5, 'the dark bar'],
  ['ps-chrome-mute', 'ps-chrome', 4.5, 'counts on the dark bar'],
  // the dependency arrows and the link handle: marks that carry meaning, held to the text standard
  ['ps-link', 'ps-surface', 4.5, 'dependency arrows on the chart'],
  ['ps-link', 'ps-surface-2', 4.5, 'arrows over group rows'],
  ['ps-link', 'ps-ground', 4.5, 'arrows on the floor'],
  ['ps-link', 'ps-card', 4.5, 'arrows over cards'],
  ['ps-today', 'ps-surface', 3, 'the today line (a mark)'],
  ['ps-focus', 'ps-surface', 3, 'the focus ring (a mark)'],
];
for (const [name, set] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg, min, what] of PAIRS) {
    if (!set[fg] || !set[bg]) { ok(`${name}: ${fg} on ${bg} is defined`, false, '(token missing)'); continue; }
    const r = ratio(set[fg], set[bg]);
    ok(`${name}: ${what} (${fg} ${set[fg]} on ${bg} ${set[bg]})`, r >= min, `= ${r.toFixed(2)}, needs ${min}`);
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
