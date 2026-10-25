// The overview on screen (M19): the plan in numbers. A row of counts, then a breakdown by one or two columns (a bar for
// each value: done, still open, late, with the words beside it), then what needs attention: the late tasks and the
// next milestones. Drawing only: what is counted is decided in model/overview.js.
//
//   click a value of a breakdown    keep only the tasks that have it, and go back to the view you came from
//   click a task in a list          its quick edit
//
// Colour is never alone: every bar has its numbers in words beside it, and the late count says "late".

import { el, clear } from '../../core/util.js';
import { t, tn } from '../../i18n/index.js';

/** "2 done · 1 late · 4 open", the words of one bar; the numbers are counts, or sums of a column when `fmt` writes them. */
export const numbersWords = (g, fmt = String) => [g.done ? t('{n} done', { n: fmt(g.done) }) : null, g.late ? t('{n} late', { n: fmt(g.late) }) : null, g.open ? t('{n} open', { n: fmt(g.open) }) : null].filter(Boolean).join(' · ');
export const groupWords = (g) => numbersWords(g);
/** With a column added up: its sums, and in brackets how many tasks they are the sums of (a group may add up to nothing). */
export const sumWords = (g, fmt) => `${numbersWords(g.w, fmt) || fmt(0)} (${tn(g.total, '{n} task', '{n} tasks')})`;
/** "Today", "Tomorrow", "In 5 days". */
export const dueText = (n) => (n === 0 ? t('Today') : n === 1 ? t('Tomorrow') : tn(n, 'In {n} day', 'In {n} days'));

/**
 * @param on {onDrill({colId, token, label}), onQuickEdit(id)}
 */
export function createOverview(host, on = {}) {
  const root = el('div', { class: 'ps-ov', tabindex: '-1', role: 'region', 'aria-label': t('Overview') });
  clear(host).appendChild(root);
  // model: {ov (model/overview.js), today, fmtDay(day) -> "Fri 13 Nov", fmtNum(n) -> "12,400", who(task) -> "Ann, Ben", empty: {title, body} | null}
  let m = null;

  const kpi = (label, value, tone = null, note = null) => el('div', { class: 'ps-ov__kpi' + (tone ? ' is-' + tone : '') }, [
    el('dt', { text: label }),
    el('dd', { text: String(value) }),
    note ? el('span', { class: 'ps-ov__note', text: note }) : null,
  ]);

  // a group's four numbers: its tasks counted, or (with a number column chosen) added up
  const unit = (g) => (m.ov.measure && g.w ? g.w : g);
  const wordsOf = (g) => (m.ov.measure && g.w ? sumWords(g, m.fmtNum) : groupWords(g));

  /** A bar as long as its group is big against the biggest, split into done, open and late. */
  function bar(g, max) {
    const pct = (n) => (max ? (n / max) * 100 : 0) + '%';
    const u = unit(g);
    return el('span', { class: 'ps-ov__bar', role: 'img', 'aria-label': `${tn(g.total, '{n} task', '{n} tasks')}: ${wordsOf(g)}` }, [
      u.done > 0 ? el('span', { class: 'ps-ov__seg ps-ov__seg--done', style: { width: pct(u.done) } }) : null,
      u.open > 0 ? el('span', { class: 'ps-ov__seg ps-ov__seg--open', style: { width: pct(u.open) } }) : null,
      u.late > 0 ? el('span', { class: 'ps-ov__seg ps-ov__seg--late', style: { width: pct(u.late) } }) : null,
    ]);
  }

  function breakdown(b, index) {
    const max = Math.max(1, ...b.groups.map((g) => unit(g).total));
    return el('section', { class: 'ps-ov__block', 'aria-labelledby': 'ps-ov-b' + index }, [
      el('h2', { id: 'ps-ov-b' + index, class: 'ps-ov__h', text: b.col.pseudo ? b.col.label : t('By {col}', { col: b.col.label }) }),
      el('ul', { class: 'ps-ov__rows' }, b.groups.map((g) => el('li', { class: 'ps-ov__row' }, [
        // a week or a month is not a column of the table: there is nothing to filter by, so it is a name and not a button
        b.col.pseudo ? el('span', { class: 'ps-ov__name', text: g.label }) : el('button', {
          type: 'button', class: 'ps-ov__name', text: g.label, title: t('Show only these tasks'),
          onclick: () => on.onDrill?.({ colId: b.col.id, token: g.token, label: g.label }),
        }),
        bar(g, max),
        el('span', { class: 'ps-ov__nums', text: wordsOf(g) }),
      ]))),
      b.multi ? el('p', { class: 'ps-hint', text: t('A task with several values is counted under each of them.') }) : null,
    ]);
  }

  const taskRow = (task, right, tone = null) => el('li', {}, [el('button', {
    type: 'button', class: 'ps-ov__task', onclick: () => on.onQuickEdit?.(task.id),
  }, [
    el('span', { class: 'ps-ov__title', text: task.title || t('(no name)') }),
    m.who(task) ? el('span', { class: 'ps-ov__who', text: m.who(task) }) : null,
    el('span', { class: 'ps-ov__when' + (tone ? ' is-' + tone : ''), text: right }),
  ])]);

  const inText = dueText;

  function render() {
    const top = root.scrollTop;
    clear(root);
    if (m.empty) {
      root.appendChild(el('div', { class: 'ps-ov__empty' }, [el('h2', { text: m.empty.title }), el('p', { text: m.empty.body })]));
      return;
    }
    const o = m.ov;
    const pct = o.share == null ? 0 : Math.round(o.share * 100);
    const col = el('div', { class: 'ps-ov__col' });
    col.appendChild(el('dl', { class: 'ps-ov__kpis' }, [
      kpi(t('Open'), o.open, null, tn(o.total, '{n} task', '{n} tasks')),
      ...(o.doable ? [kpi(t('Late'), o.late, o.late ? 'late' : null)] : []),
      kpi(t('Due in 7 days'), o.soon),
      ...(o.doable ? [kpi(t('Done'), o.done, null, t('{n}% done', { n: pct }))] : []),
      kpi(t('No dates'), o.undated),
      // with a number column to add up: its total, and how much of it is done
      ...(o.measure ? [kpi(o.measure.col.label, m.fmtNum(o.measure.total), null, o.doable && o.measure.total ? t('{n}% done', { n: Math.round((o.measure.done / o.measure.total) * 100) }) : null)] : []),
    ]));
    for (const [i, b] of o.breakdowns.entries()) col.appendChild(breakdown(b, i));
    const lists = [];
    if (o.doable) {
      lists.push(el('section', { class: 'ps-ov__block', 'aria-labelledby': 'ps-ov-late' }, [
        el('h2', { id: 'ps-ov-late', class: 'ps-ov__h', text: t('Needs attention') }),
        o.lateList.length
          ? el('ul', { class: 'ps-ov__list' }, o.lateList.map((x) => taskRow(x.task, tn(x.days, '{n} day late', '{n} days late'), 'late')))
          : el('p', { class: 'ps-ov__none', text: t('Nothing is late.') }),
        o.late > o.lateList.length ? el('p', { class: 'ps-hint', text: t('And {n} more late tasks. The agenda lists them all.', { n: o.late - o.lateList.length }) }) : null,
      ]));
    }
    lists.push(el('section', { class: 'ps-ov__block', 'aria-labelledby': 'ps-ov-ms' }, [
      el('h2', { id: 'ps-ov-ms', class: 'ps-ov__h', text: t('Next milestones') }),
      o.milestones.length
        ? el('ul', { class: 'ps-ov__list' }, o.milestones.map((x) => taskRow(x.task, `${m.fmtDay(x.day)} · ${inText(x.inDays)}`)))
        : el('p', { class: 'ps-ov__none', text: t('No milestone ahead.') }),
    ]));
    col.appendChild(el('div', { class: 'ps-ov__lists' }, lists));
    root.appendChild(col);
    root.scrollTop = top;
  }

  return {
    update(next) { m = next; render(); },
    reveal() {},
    scrollToToday() { root.scrollTop = 0; },
    focus() { root.focus({ preventScroll: true }); },
    destroy() { clear(host); },
  };
}
