// The files of a task: kinds, which a hover shows, the attachments table, and the role that finds the column.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const F = await imp('src/model/files.js');
const { detectRoles } = await imp('src/model/roles.js');
const { buildTasks } = await imp('src/model/tasks.js');
const { columnsFromFixture } = await imp('src/model/schema.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

// ---- what a file is
eq('extension of a name', [F.extOf('Plan.PDF'), F.extOf('a.b.jpeg'), F.extOf('noext'), F.extOf(''), F.extOf(null)], ['pdf', 'jpeg', '', '', '']);
eq('a picture by its type or its extension', [F.fileKind({ name: 'x', type: 'image/png' }), F.fileKind({ name: 'x.JPG', type: '' }), F.fileKind({ name: 'x.webp' })], ['image', 'image', 'image']);
eq('a photo the browser cannot draw is a name, not a picture', [F.fileKind({ name: 'IMG_1.HEIC', type: 'image/heic' }), F.fileKind({ name: 'a.tif', type: 'image/tiff' })], ['other', 'other']);
eq('pdf, video, other', [F.fileKind({ name: 'a.pdf' }), F.fileKind({ name: 'a.bin', type: 'application/pdf' }), F.fileKind({ name: 'clip.mp4' }), F.fileKind({ name: 'a.docx' }), F.fileKind(null)], ['pdf', 'pdf', 'video', 'other', 'other']);
eq('the extension Grist keeps, with or without its dot', F.fileKind({ name: 'file', ext: '.png' }), 'image');

// ---- which a hover shows
const info = new Map([[5, { name: 'a.png', type: 'image/png' }], [6, { name: 'b.pdf', type: '' }], [7, { name: 'c.jpg' }], [8, { name: 'd.txt' }]]);
const infoOf = (id) => info.get(id);
const p = F.previewPlan([5, 6, 7, 8], infoOf, { max: 3 });
eq('the first three, and one more', [p.total, p.more, p.shown.map((s) => [s.id, s.kind])], [4, 1, [[5, 'image'], [6, 'pdf'], [7, 'image']]]);
eq('a file whose details have not come yet is shown as a place', F.previewPlan([99], infoOf).shown, [{ id: 99, name: '', kind: 'other', ext: '' }]);
eq('nothing', [F.previewPlan([], infoOf), F.previewPlan(null, infoOf), F.previewPlan([0, -1, 'x'], infoOf)].map((x) => [x.total, x.more, x.shown.length]), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
eq('max 0 shows none, all are "more"', (() => { const q = F.previewPlan([5, 6], infoOf, { max: 0 }); return [q.total, q.more, q.shown.length]; })(), [2, 2, 0]);

// ---- the attachments table
const tbl = [{ id: 1, fileName: 'a.png', fileType: 'image/png', fileExt: '.png', fileSize: 1234, imageWidth: 800, imageHeight: 600 }, { id: 2, fileName: 'b.pdf', fileType: '', fileExt: '.pdf', fileSize: 2500000, imageWidth: 0, imageHeight: 0 }];
const m = F.attachmentMap(tbl);
eq('a map of id to what Grist knows', [m.get(1), m.get(2).name, m.get(2).size], [{ name: 'a.png', type: 'image/png', ext: '.png', size: 1234, w: 800, h: 600 }, 'b.pdf', 2500000]);
eq('no table, no map', [F.attachmentMap(null).size, F.attachmentMap([]).size], [0, 0]);
eq('sizes in words', [F.sizeText(0), F.sizeText(999), F.sizeText(1500), F.sizeText(2500000)], ['0 B', '999 B', '2 KB', '2.5 MB']);

// ---- the role finds the column, and the task keeps the ids
const cols = columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'End', type: 'Date' }, { id: 'Files', type: 'Attachments' }]);
eq('a column called Files is the files', detectRoles(cols).roles.attachments, 'Files');
eq('the only Attachments column is the files whatever it is called', detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }, { id: 'Zzz', type: 'Attachments' }])).roles.attachments, 'Zzz');
eq('German and French names', [detectRoles(columnsFromFixture([{ id: 'Anhänge', type: 'Attachments' }, { id: 'Task', type: 'Text' }])).roles.attachments, detectRoles(columnsFromFixture([{ id: 'Pièces_jointes', type: 'Attachments' }, { id: 'Task', type: 'Text' }])).roles.attachments], ['Anhänge', 'Pièces_jointes']);
eq('no Attachments column, no role', detectRoles(columnsFromFixture([{ id: 'Task', type: 'Text' }, { id: 'Start', type: 'Date' }])).roles.attachments, undefined);
const day = (n) => ['d', n * 86400];
const rows = [{ id: 1, Task: 'a', Start: day(20000), End: day(20002), Files: ['L', 5, 6] }, { id: 2, Task: 'b', Start: day(20000), End: day(20002), Files: null }, { id: 3, Task: 'c', Start: day(20000), End: day(20002), Files: ['L'] }];
const built = buildTasks(rows, { roles: detectRoles(cols).roles, columns: cols, labels: {} });
eq('a task keeps the ids of its files', built.tasks.map((t) => t.files), [[5, 6], [], []]);
const hash = (files) => buildTasks([{ ...rows[0], Files: files }], { roles: detectRoles(cols).roles, columns: cols, labels: {} }).tasks[0].hash;
eq('a redraw sees a file added', hash(['L', 5, 6]) !== hash(['L', 5, 6, 7]), true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
