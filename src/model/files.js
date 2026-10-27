// The files of a task (M31): what kind each is and which of them a hover shows. Pure: no DOM, no Grist.

// kinds a browser draws in an <img>; HEIC and TIFF are photos too, but only Safari draws them, so they are a name here
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'];
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'];

/** The extension of a file name, lower case, no dot ('' when it has none). */
export function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

/**
 * What a file is, for how it is shown: 'image' (drawn as a picture), 'pdf', 'video' or 'other'.
 * @param info {name, type?, ext?} as Grist keeps it (the type can be empty: the extension then decides)
 */
export function fileKind(info) {
  if (!info) return 'other';
  const ext = (info.ext ? String(info.ext).replace(/^\./, '') : extOf(info.name)).toLowerCase();
  const type = String(info.type || '').toLowerCase();
  if ((type.startsWith('image/') && !/heic|heif|tiff/.test(type)) || IMAGE_EXT.includes(ext)) return 'image';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video';
  return 'other';
}

/**
 * Which files a hover shows: the first `max` (pictures and others alike, in the cell's order), and how many more there are.
 * @param ids     the attachment ids of the task's cell
 * @param infoOf  id -> {name, type, ext} | undefined (a file whose details have not come yet is shown by its place)
 * @returns {{total: number, more: number, shown: Array<{id, name, kind, ext}>}}
 */
export function previewPlan(ids, infoOf, { max = 3 } = {}) {
  const list = Array.isArray(ids) ? ids.filter((x) => typeof x === 'number' && x > 0) : [];
  const shown = list.slice(0, Math.max(0, max)).map((id) => {
    const info = infoOf?.(id) || null;
    return { id, name: info?.name || '', kind: info ? fileKind(info) : 'other', ext: info ? (info.ext ? String(info.ext).replace(/^\./, '') : extOf(info.name)).toLowerCase() : '' };
  });
  return { total: list.length, more: list.length - shown.length, shown };
}

/** The rows of the attachments table (_grist_Attachments, read as rows) -> a map of id -> {name, type, ext, size, w, h}. */
export function attachmentMap(rows) {
  const out = new Map();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r.id !== 'number') continue;
    out.set(r.id, { name: String(r.fileName ?? ''), type: String(r.fileType ?? ''), ext: String(r.fileExt ?? ''), size: Number(r.fileSize) || 0, w: Number(r.imageWidth) || 0, h: Number(r.imageHeight) || 0 });
  }
  return out;
}

/** "1.2 MB", "340 KB": the size of a file in words, for a tooltip. */
export function sizeText(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1000) return b + ' B';
  if (b < 1e6) return Math.round(b / 1000) + ' KB';
  return (Math.round(b / 1e5) / 10) + ' MB';
}
