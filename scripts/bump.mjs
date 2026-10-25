// Moves every place that names the version to a new one:  node scripts/bump.mjs 1.10.0
// package.json, package-lock.json, src/version.js, the README's badge and the manifest's last-updated stamp.
// (scripts/check-version.mjs is what CI uses to see that they agree.)
import fs from 'node:fs';

const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next || '')) { console.error('usage: node scripts/bump.mjs 1.10.0'); process.exit(1); }

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const old = JSON.parse(read('package.json')).version;

for (const f of ['package.json', 'package-lock.json']) {
  const s = read(f);
  fs.writeFileSync(f, s.replace(new RegExp(`"version": "${old.replace(/\./g, '\\.')}"`, 'g'), `"version": "${next}"`));
}
let v = read('src/version.js');
v = v.replace(/VERSION = '[^']+'/, `VERSION = '${next}'`);
fs.writeFileSync('src/version.js', v);
let r = read('README.md');
r = r.replace(/version-\d+\.\d+\.\d+-0F1B2D/, `version-${next}-0F1B2D`);
fs.writeFileSync('README.md', r);
// the widget's own entry (the first lastUpdatedAt), in the owner's time zone as the file already has it
const stamp = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
let m = read('manifest.json');
m = m.replace(/"lastUpdatedAt": "[^"]+"/, `"lastUpdatedAt": "${stamp}"`);
fs.writeFileSync('manifest.json', m);
console.log(`${old} -> ${next}`);
