// How the widget connects, as measured in real Grist 1.7.20 before the first view was built.
//
// The rules this pins down, each of which broke something when it was wrong:
//   - ONE ready(), asking for full access AND allowSelectBy. Grist ignores every later ready().
//   - onRecords registered BEFORE ready(), with includeColumns 'normal', keepEncoded and expandRefs false. Without
//     the first, Grist sends only the columns shown in the widget's own section (none, for columns
//     added after the widget), and a handler added after ready() misses the first delivery.
//   - Live only when Grist answers. ready() returns at once inside any iframe on any page.
//
// window.grist is stubbed: what matters is which calls are made, in which order, with what.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };
const ok = (n, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

let fresh = 0;
const load = () => import(pathToFileURL(resolve(ROOT, 'src/grist/connect.js')).href + '?n=' + (++fresh));

function stub({ answers = true, search = '?access=full&culture=de-DE', framed = true } = {}) {
  const calls = [];
  const handlers = {};
  globalThis.window = globalThis;
  globalThis.location = { search };
  globalThis.top = framed ? {} : globalThis;
  globalThis.self = globalThis;
  globalThis.grist = {
    on: (ev, fn) => { calls.push('on:' + ev); handlers[ev] = fn; },
    onOptions: (fn) => { calls.push('onOptions'); handlers.options = fn; },
    onRecords: (fn, opts) => { calls.push('onRecords:' + JSON.stringify(opts)); handlers.records = fn; },
    onRecord: (fn, opts) => { calls.push('onRecord:' + JSON.stringify(opts)); handlers.record = fn; },
    ready: (opts) => {
      calls.push('ready:' + JSON.stringify(opts));
      if (answers) setTimeout(() => {
        handlers.message?.({ settings: { accessLevel: 'full' }, fromReady: true });
        handlers.options?.(null, { accessLevel: 'full', linking: { asTarget: 'Filter:Row->Col', asSource: false } });
        handlers.records?.([{ id: 1, Title: 'A', Start: ['d', 1796515200] }]);
        handlers.record?.({ id: 1 });
      }, 5);
    },
    getSelectedTableId: async () => 'Tasks',
    setCursorPos: async (pos) => calls.push('cursor:' + JSON.stringify(pos)),
    setSelectedRows: async (ids) => calls.push('select:' + JSON.stringify(ids)),
    commandApi: { run: async (name) => calls.push('command:' + name) },
    docApi: {
      applyUserActions: async (a) => { calls.push('apply:' + a.length); return { retValues: [] }; },
      fetchTable: async () => ({ id: [1, 2], colId: ['Title', 'Start'] }),
    },
  };
  return calls;
}

// ---- a real Grist that answers
{
  const calls = stub();
  const C = await load();
  let rows = null, cursor = null;
  const live = await C.start({ onRows: (r) => { rows = r; }, onCursor: (id) => { cursor = id; } }, 500);
  ok('live when Grist answers', live === true);
  const ready = calls.filter((c) => c.startsWith('ready:'));
  eq('exactly one ready()', ready.length, 1);
  eq('ready asks for full access and Select by', ready[0], 'ready:' + JSON.stringify({ requiredAccess: 'full', allowSelectBy: true }));
  const iRec = calls.findIndex((c) => c.startsWith('onRecords:'));
  const iReady = calls.findIndex((c) => c.startsWith('ready:'));
  ok('onRecords is registered before ready()', iRec >= 0 && iRec < iReady);
  eq('rows asked with every real column, encoded, References as ids', calls[iRec], 'onRecords:' + JSON.stringify({ includeColumns: 'normal', keepEncoded: true, expandRefs: false }));
  await new Promise((r) => setTimeout(r, 20));
  eq('first rows reach the handler', rows && rows[0].Start, ['d', 1796515200]);
  eq('the cursor row reaches its handler', cursor, 1);
  ok('onRecord is registered before ready() too', calls.findIndex((c) => c.startsWith('onRecord:')) < iReady);
  eq('access level comes from Grist', C.accessLevel(), 'full');
  eq('linking info is kept', C.linkingInfo().asTarget, 'Filter:Row->Col');
  eq('culture read from the widget URL', C.gristCulture(), 'de-DE');
  eq('selected table', await C.selectedTableId(), 'Tasks');
  eq('fetchRows turns columns into rows', await C.fetchRows('_grist_Tables_column'), [{ id: 1, colId: 'Title' }, { id: 2, colId: 'Start' }]);
  await C.moveCursor(31);
  await C.moveCursor('new');
  await C.selectRows([1, 2]);
  await C.openRecordCard();
  await C.undo();
  await C.apply([['UpdateRecord', 'Tasks', 1, { Title: 'B' }]]);
  eq('page calls go to Grist', calls.slice(-6), ['cursor:{"rowId":31}', 'cursor:{"rowId":"new"}', 'select:[1,2]', 'command:viewAsCard', 'command:undo', 'apply:1']);
  ok('start() twice does not ask again', (await C.start({}, 100)) === true && calls.filter((c) => c.startsWith('ready:')).length === 1);
}

// ---- Grist's first message is often only the theme; the access level comes in the next one.
//      start() must wait for it: a widget that went on early drew itself read-only (M2).
{
  stub({ answers: false });
  const handlers = {};
  globalThis.grist.on = (ev, fn) => { handlers[ev] = fn; };
  globalThis.grist.onOptions = (fn) => { handlers.options = fn; };
  globalThis.grist.ready = () => {
    setTimeout(() => handlers.message?.({ theme: {}, fromReady: true }), 5);
    setTimeout(() => handlers.message?.({ settings: { accessLevel: 'full' }, fromReady: true }), 60);
  };
  const C = await load();
  ok('live', await C.start({}, 500));
  eq('the access level is known when start() returns', C.accessLevel(), 'full');
}

// ---- inside some other page's iframe: ready() returns, nobody answers
{
  stub({ answers: false });
  const C = await load();
  ok('no answer means demo', (await C.start({}, 60)) === false);
  ok('not live after a timeout', C.isLive() === false);
  eq('writes are no-ops when not live', await C.apply([['AddRecord', 'Tasks', null, {}]]), null);
  eq('reads are empty when not live', await C.fetchRows('Tasks'), []);
}

// ---- ?demo, and a top-level tab
{
  const calls = stub({ search: '?demo=1' });
  const C = await load();
  ok('?demo never connects', (await C.start({}, 60)) === false && !calls.some((c) => c.startsWith('ready:')));
}
{
  const calls = stub({ framed: false });
  const C = await load();
  ok('a top-level tab never connects', (await C.start({}, 60)) === false && !calls.some((c) => c.startsWith('ready:')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
