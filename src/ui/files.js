// The files of a task as tiles (M31): a small picture for each photo or drawing, an extension badge for the rest, each with its name.
// Shown under a hovered bar, booking or card, and (larger, each opening the file) in the edit window.

import { el } from '../core/util.js';
import { t } from '../i18n/index.js';

/** The tile of one file: its picture when it is one and has an address, else its extension. */
function tile(f, { urlOf, onOpen }) {
  const url = urlOf ? urlOf(f.id) : null;
  const label = f.name || t('File');
  const badge = () => el('span', { class: 'ps-files__thumb ps-files__thumb--ext', 'aria-hidden': 'true', text: (f.ext || '·').slice(0, 4).toUpperCase() });
  let thumb;
  if (f.kind === 'image' && url) {
    thumb = el('img', { class: 'ps-files__thumb', src: url, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
    // a link that has run out, or a file that is not a picture after all: the badge instead
    thumb.addEventListener('error', () => thumb.replaceWith(badge()));
  } else thumb = badge();
  const parts = [thumb, el('span', { class: 'ps-files__name', text: label })];
  if (!onOpen) return el('span', { class: 'ps-files__tile', title: label }, parts);
  return el('button', { type: 'button', class: 'ps-files__tile ps-files__tile--open', title: label, 'aria-label': t('Open {name}', { name: label }), onclick: () => onOpen(f.id) }, parts);
}

/**
 * @param plan {total, more, shown: [{id, name, kind, ext}]}  from model/files.js previewPlan
 * @param opts {urlOf(id) -> address | null, onOpen(id) -> opens it, big: the larger tiles of the edit window}
 */
export function filesStrip(plan, { urlOf = null, onOpen = null, big = false } = {}) {
  if (!plan || !plan.total) return null;
  return el('div', { class: 'ps-files' + (big ? ' ps-files--big' : ''), role: 'group', 'aria-label': t('Files') }, [
    ...plan.shown.map((f) => tile(f, { urlOf, onOpen })),
    plan.more > 0 ? el('span', { class: 'ps-files__more', text: t('and {n} more', { n: plan.more }) }) : null,
  ]);
}
