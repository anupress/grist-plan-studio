// Saved views (M12): a side panel listing the views people saved for this widget, each a name and how
// the widget was set up (model/settings.js saveView). A click on a name applies it; Update replaces
// it with how the widget looks now; Delete takes it away; the form at the foot saves the current view
// under a name. Applying a view writes nothing; saving writes the widget's options, so only people who
// can edit the document see the form.

import { el, clear } from '../core/util.js';
import { t } from '../i18n/index.js';
import { trapFocus } from './dialog.js';

/**
 * @param s  {views: [{id, name, mode}], modeLabel(mode) -> text, canSave, full (no room for another name)}
 * @param on {onApply(id), onSave(name) -> Promise<boolean>, onUpdate(id), onDelete(id), onClose()}
 * @returns {{refresh({views, canSave, full}), close()}}
 */
export function openViews(host, s, on) {
  let views = s.views, canSave = s.canSave, full = s.full;
  const list = el('ul', { class: 'ps-vw__list' });
  const note = el('p', { class: 'ps-hint ps-vw__note' });
  const name = el('input', { id: 'ps-vw-name', class: 'ps-input', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: t('For example: my open tasks') });
  const save = el('button', { type: 'submit', class: 'ps-btn ps-btn--primary', text: t('Save') });
  const form = el('form', { class: 'ps-vw__form', onsubmit: async (e) => {
    e.preventDefault();
    if (!name.value.trim()) { name.focus(); return; }
    save.disabled = true;
    const ok = await on.onSave(name.value);
    save.disabled = false;
    if (ok) { name.value = ''; draw(); }
  } }, [
    el('label', { for: 'ps-vw-name', text: t('Save the current view as') }),
    el('div', { class: 'ps-vw__row' }, [name, save]),
    el('p', { class: 'ps-hint', text: t('A name that exists is replaced. Everyone who opens this page sees the views; zoom and the choices of the view are saved with it, folded rows are not.') }),
  ]);

  function draw() {
    clear(list);
    for (const v of views) {
      list.appendChild(el('li', { class: 'ps-vw__item' }, [
        el('button', { type: 'button', class: 'ps-vw__apply', onclick: () => { close(); on.onApply(v.id); }, 'aria-label': t('Open the view “{name}”', { name: v.name }) }, [
          el('span', { class: 'ps-vw__name', text: v.name }),
          el('span', { class: 'ps-vw__mode', text: s.modeLabel(v.mode) }),
        ]),
        canSave ? el('button', { type: 'button', class: 'ps-btn ps-btn--sm', text: t('Update'), title: t('Replace “{name}” with the view as it is now', { name: v.name }),
          'aria-label': t('Update “{name}” with the current view', { name: v.name }), onclick: async () => { await on.onUpdate(v.id); } }) : null,
        canSave ? el('button', { type: 'button', class: 'ps-btn ps-btn--sm', text: t('Delete'), 'aria-label': t('Delete the view “{name}”', { name: v.name }),
          onclick: async () => { await on.onDelete(v.id); } }) : null,
      ]));
    }
    list.hidden = !views.length;
    note.textContent = !views.length
      ? (canSave ? t('No saved views yet. Set the view up as you like it, give it a name below and press Save.') : t('No saved views yet. Only people who can edit this document can save one.'))
      : (canSave && full ? t('That is as many views as fit. Delete one to save another.') : '');
    form.hidden = !canSave;
  }

  const panel = el('div', { class: 'ps-drawer ps-drawer--narrow', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ps-vw-title' }, [
    el('div', { class: 'ps-drawer__head' }, [
      el('h2', { id: 'ps-vw-title', text: t('Saved views') }),
      el('button', { type: 'button', class: 'ps-icon-btn', 'aria-label': t('Close'), text: '×', onclick: () => close() }),
    ]),
    el('div', { class: 'ps-drawer__body ps-vw' }, [list, note, form]),
    el('div', { class: 'ps-drawer__foot' }, [el('span', { class: 'ps-spacer' }), el('button', { type: 'button', class: 'ps-btn', text: t('Close'), onclick: () => close() })]),
  ]);
  const scrim = el('div', { class: 'ps-scrim', onclick: () => close() });
  let closed = false;
  let release = () => {};
  function close() {
    if (closed) return;
    closed = true;
    release();
    scrim.remove();
    panel.remove();
    on.onClose?.();
  }
  host.append(scrim, panel);
  release = trapFocus(panel, close);
  draw();
  (canSave && !views.length ? name : panel.querySelector('.ps-vw__apply') || name).focus();
  return { refresh: (next) => { views = next.views; canSave = next.canSave; full = next.full; draw(); }, close };
}
