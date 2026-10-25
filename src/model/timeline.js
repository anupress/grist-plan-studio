// The timeline: the plan's calendar with one band per person, room or project. Bars that overlap in
// a band stack in tracks, so a busy week reads as a taller band. Pure: tests/timeline.test.mjs.

import { lanesOf, laneKeysOf, overlapping, stack } from './lanes.js';

/**
 * @param tasks  dated tasks from buildTasks (start and end are day numbers, inclusive)
 * @param rows   the same rows, encoded
 * @param ctx    {laneCol, labels, clashes: boolean (flag overlaps, for a resource column), hideEmpty,
 *                laneSort: null | 'name' | 'busiest' | 'start' (the lanes' order; the empty lane stays first)}
 * @returns {{lanes: Array, tracks: number, clashes: Set}}
 *   lane: {key, label, value, colour, none, bars: [{task, track, clash}], tracks, offset}
 *   offset: the lane's first track counted from the top of the timeline
 */
export function buildTimeline(tasks, rows, { laneCol, labels = {}, clashes = false, hideEmpty = false, laneSort = null }) {
  const lanes = lanesOf(laneCol, rows, labels).map((l) => ({ ...l, bars: [], tracks: 1, offset: 0 }));
  const byKey = new Map(lanes.map((l) => [l.key, l]));
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  for (const task of tasks) {
    const row = rowOf.get(task.id);
    if (!row || task.start == null) continue;
    for (const k of laneKeysOf(row[laneCol.id], laneCol)) byKey.get(k)?.bars.push({ task, a: task.start, b: task.end, track: 0, clash: false });
  }
  const clashed = new Set();
  let shown = lanes.filter((l) => (l.none || hideEmpty ? l.bars.length > 0 : true));
  if (laneSort) shown = sortLanes(shown, laneSort);
  let offset = 0;
  for (const lane of shown) {
    lane.bars.sort((x, y) => x.a - y.a || x.b - y.b || x.task.index - y.task.index);
    lane.tracks = stack(lane.bars);
    if (clashes && !lane.none) {
      const hit = overlapping(lane.bars.map((b) => ({ id: b.task.id, a: b.a, b: b.b })));
      for (const b of lane.bars) if (hit.has(b.task.id)) { b.clash = true; clashed.add(b.task.id); }
    }
    lane.offset = offset;
    offset += lane.tracks;
  }
  return { lanes: shown, tracks: offset, clashes: clashed };
}

/** The lanes in the order asked for; the lane of tasks with no value stays first, ties keep the lanes' own order. */
export function sortLanes(lanes, how) {
  const first = (l) => (l.bars.length ? Math.min(...l.bars.map((b) => b.a)) : null);
  const cmp = how === 'name' ? (a, b) => String(a.label ?? '').localeCompare(String(b.label ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    : how === 'busiest' ? (a, b) => b.bars.length - a.bars.length
      : (a, b) => { const x = first(a), y = first(b); return x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : x - y; };
  const at = new Map(lanes.map((l, i) => [l, i]));
  const rest = lanes.filter((l) => !l.none).sort((a, b) => cmp(a, b) || at.get(a) - at.get(b));
  return [...lanes.filter((l) => l.none), ...rest];
}

/** The lane under a track number (from the top), or null. */
export function laneAtTrack(timeline, track) {
  for (const lane of timeline.lanes) if (track >= lane.offset && track < lane.offset + lane.tracks) return lane;
  return null;
}
