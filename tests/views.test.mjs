// Saved views: what a snapshot keeps, how a list read from the document is cleaned (bad entries
// dropped, names tidied, capped), saving under a name that exists replaces it, and the options
// round trip keeps views and every other key.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(resolve(HERE, '..', p)).href);
const S = await imp('src/model/settings.js');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); } };

const state = { mode: 'board', zoom: 'week', view: { groupBy: 'Project', critical: true, collapsed: new Set(['a', 'b']), laneBy: 'Status', wlUnit: 'month', agendaWho: 'mine', calMode: 'week', junk: 'x' } };
const snap = S.snapshotView(state);
eq('a snapshot keeps the view and the zoom', [snap.mode, snap.zoom], ['board', 'week']);
eq('…the choices this browser keeps', [snap.view.groupBy, snap.view.critical, snap.view.laneBy, snap.view.wlUnit, snap.view.agendaWho, snap.view.calMode], ['Project', true, 'Status', 'month', 'mine', 'week']);
eq('…and nothing else: no folded rows, no stray keys', Object.keys(snap.view).includes('collapsed') || Object.keys(snap.view).includes('junk'), false);
eq('a choice not made is null', [snap.view.tlLaneBy, snap.view.wlMeasure, snap.view.bookRows], [null, null, null]);
eq('a view that does not exist falls back to the Gantt chart, a bad zoom to none', [S.snapshotView({ mode: 'nope', zoom: 'hours', view: {} }).mode, S.snapshotView({ mode: 'nope', zoom: 'hours', view: {} }).zoom], ['gantt', null]);
eq('the calendar is a view', S.snapshotView({ mode: 'calendar', zoom: null, view: { calMode: 'month' } }).mode, 'calendar');
eq('the board’s swimlane column is kept in a saved view', S.snapshotView({ mode: 'board', zoom: 'week', view: { swimBy: 'Owner' } }).view.swimBy, 'Owner');
eq('a bad value for a choice becomes null', S.snapshotView({ mode: 'board', zoom: 'week', view: { wlUnit: 'fortnight', critical: 'yes', groupBy: '' } }).view, { groupBy: null, groupBy2: null, critical: null, laneBy: null, swimBy: null, tlLaneBy: null, bookRows: null, bookPeriods: null, bookFilter: null, wlRows: null, wlUnit: null, wlMeasure: null, agendaWho: null, calMode: null, ovBy0: null, ovBy1: null, ovMeasure: null, find: null, display: null });

// the quick filters travel with a view
const withFind = S.snapshotView({ mode: 'gantt', zoom: null, view: { find: { q: ' logo ', sel: { Status: ['Doing', 'Doing', 7], Owner: [] }, cols: ['Priority'], junk: 1 } } });
eq('a view keeps its search, its chosen values and its extra filters, cleaned', withFind.view.find, { q: 'logo ', sel: { Status: ['Doing'] }, cols: ['Priority'] });
eq('a view with no filter keeps null, not an empty one', [S.snapshotView({ mode: 'gantt', zoom: null, view: { find: { q: '', sel: {}, cols: [] } } }).view.find, S.snapshotView({ mode: 'gantt', zoom: null, view: {} }).view.find], [null, null]);
eq('a filter column shown with nothing chosen is still kept (the chip comes back)', S.snapshotView({ mode: 'gantt', zoom: null, view: { find: { cols: ['Priority'] } } }).view.find, { q: '', sel: {}, cols: ['Priority'] });
eq('a junk filter becomes null', S.snapshotView({ mode: 'gantt', zoom: null, view: { find: 'oops' } }).view.find, null);
eq('a list read from the document cleans the filter too', S.cleanViews([{ id: 'f1', name: 'Stuck', mode: 'gantt', zoom: null, view: { find: { sel: { Status: ['Stuck', 3] } } } }])[0].view.find, { q: '', sel: { Status: ['Stuck'] }, cols: [] });

// how the rows and bars look travels with a view too
const withDisplay = S.snapshotView({ mode: 'gantt', zoom: null, view: { display: { density: 'compact', sort: 'start', labels: 'off', weekNumbers: false, cols: ['Status', 'Status', 'Owner'], junk: 1 } } });
eq('a view keeps the display choices, cleaned', withDisplay.view.display, { density: 'compact', sort: 'start', sortThen: [], laneSort: null, colourBy: null, labels: 'off', weekNumbers: false, weekends: true, today: true, plan: true, cols: ['Status', 'Owner'], listW: null, laneW: null });
eq('the default display is kept as null, so an old view and a new one with nothing chosen are the same', [S.snapshotView({ mode: 'gantt', zoom: null, view: {} }).view.display, S.snapshotView({ mode: 'gantt', zoom: null, view: { display: { density: 'comfortable', labels: 'auto' } } }).view.display], [null, null]);
eq('a junk display becomes null', S.snapshotView({ mode: 'gantt', zoom: null, view: { display: 'wide' } }).view.display, null);
eq('a list read from the document cleans the display too', S.cleanViews([{ id: 'd1', name: 'Dense', mode: 'gantt', zoom: null, view: { display: { density: 'compact', labels: 'inside' } } }])[0].view.display, { density: 'compact', sort: null, sortThen: [], laneSort: null, colourBy: null, labels: 'auto', weekNumbers: true, weekends: true, today: true, plan: true, cols: [], listW: null, laneW: null });
eq('this browser’s memory of a table gives a clean display when nothing is stored', (() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; return S.storedView('t').display.density; })(), 'comfortable');

const good = (id, name, extra = {}) => ({ id, name, mode: 'board', zoom: 'week', view: { laneBy: 'Status' }, ...extra });
const cleaned = S.cleanViews([
  good('a1', '  Design   team '), good('a1', 'Duplicate id'), good('b2', ''), good('c3', 'No such mode', { mode: 'pie' }), null, 'x', { id: 'd4' },
  good('bad id!', 'Bad id'), good('e5', 'x'.repeat(100)), good('f6', 'Fine', { zoom: 'hours' }),
]);
eq('a list is cleaned: names tidied, repeats, empties, unknown views and bad ids dropped', cleaned.map((v) => [v.id, v.name.length > 40 ? v.name.length : v.name]), [['a1', 'Design team'], ['e5', 60], ['f6', 'Fine']]);
eq('…a bad zoom inside a good view is just dropped', cleaned[2].zoom, null);
eq('not a list at all', [S.cleanViews(undefined), S.cleanViews({}), S.cleanViews('x')], [[], [], []]);
eq('at most 30', S.cleanViews(Array.from({ length: 45 }, (_, i) => good('v' + i, 'View ' + i))).length, S.MAX_VIEWS);

let n = 0;
const id = () => 'n' + ++n;
const first = S.withView([], ' Mine  ', snap, id);
eq('a first view is added with a new id', [first.replaced, first.views.map((v) => [v.id, v.name])], [false, [['n1', 'Mine']]]);
const second = S.withView(first.views, 'Board by status', { ...snap, mode: 'board' }, id);
eq('a second goes last', second.views.map((v) => v.name), ['Mine', 'Board by status']);
const again = S.withView(second.views, 'mine', { ...snap, mode: 'agenda' }, id);
eq('the same name, whatever the capitals, replaces it in place and keeps its id', [again.replaced, again.views.map((v) => [v.id, v.name, v.mode])], [true, [['n1', 'mine', 'agenda'], ['n2', 'Board by status', 'board']]]);
eq('an empty name saves nothing', S.withView([], '   ', snap, id), null);
eq('a full list takes no new name, but a known one still replaces', [S.withView(S.cleanViews(Array.from({ length: 30 }, (_, i) => good('v' + i, 'View ' + i))), 'Another', snap, id), S.withView(S.cleanViews(Array.from({ length: 30 }, (_, i) => good('v' + i, 'View ' + i))), 'view 3', snap, id).replaced], [null, true]);

// the options round trip
const written = S.writeOptions({ v: 1, future: { keep: 'me' }, roles: { title: 'x' } }, { views: again.views });
eq('writing keeps other keys and the version', [written.future, written.roles, written.v], [{ keep: 'me' }, { title: 'x' }, 1]);
eq('writing views then reading them gives them back', S.readOptions(written).views, again.views);
eq('writing without views leaves the saved ones alone', S.writeOptions(written, { gantt: { ...S.GANTT_DEFAULTS } }).views, again.views);
eq('options with no views read as an empty list', S.readOptions({ v: 1 }).views, []);
eq('writing is a copy: changing the list afterwards does not change the written options', (() => { const list = [...again.views]; const w = S.writeOptions({}, { views: list }); list[0].name = 'changed'; return w.views[0].name; })(), 'mine');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
