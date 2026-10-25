// PNG export (M12): the printout as a picture, for a slide, a message or a wiki page.
//
// The print layout (print/render.js) is plain HTML. It is laid out off screen, each element copied with
// the styles the browser worked out for it, wrapped in an SVG <foreignObject>, and drawn onto a canvas
// through an <img>. No library, nothing leaves the page. The picture is the same layout as the printout,
// light whatever the screen's theme, its pages one under the other.
//
// Tested in Chrome. A browser that refuses to read a canvas drawn from an SVG (some versions of Safari)
// throws, and the caller says so and points to Print, which saves a PDF.

const MAX_SIDE = 16384;        // px: what browsers allow of one canvas side
const MAX_PIXELS = 120e6;      // px: a canvas this big may still fail on a small device
const MAX_NODES = 40000;       // elements: past this a picture is too much work for a page

/** The most elements the picture will take. */
export const PNG_MAX_NODES = MAX_NODES;

/** Every element of `src`, in order, with its computed style written into the copy's style attribute. */
function inlined(src) {
  const copy = src.cloneNode(true);
  const from = [src, ...src.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  for (let i = 0; i < from.length; i++) {
    const cs = getComputedStyle(from[i]);
    let text = '';
    for (let k = 0; k < cs.length; k++) text += cs[k] + ':' + cs.getPropertyValue(cs[k]) + ';';
    to[i].setAttribute('style', text);
  }
  return copy;
}

/**
 * @param node   the printout (a .pp-root), not yet in the document
 * @param o {scale (device pixels per CSS pixel), margin (CSS px around it)}
 * @returns {Promise<Blob>}
 * @throws Error('big') when the layout is too large for a picture; the browser's own error when it will not draw one
 */
export async function nodeToPng(node, { scale = 2, margin = 24 } = {}) {
  const host = document.createElement('div');
  host.className = 'pp-png';
  host.style.cssText = `position:fixed;left:-100000px;top:0;display:inline-block;background:#fff;padding:${margin}px;box-sizing:content-box;`;
  host.appendChild(node);
  document.body.appendChild(host);
  try {
    if (host.querySelectorAll('*').length > MAX_NODES) throw new Error('big');
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const w = Math.ceil(host.scrollWidth), h = Math.ceil(host.scrollHeight);
    const k = Math.min(scale, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_PIXELS / (w * h)));
    if (!(k >= 0.5)) throw new Error('big');
    // the printout itself, not the off-screen host (whose position is only there to hide it)
    const body = new XMLSerializer().serializeToString(inlined(node));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="100%" height="100%">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:${w}px;height:${h}px;padding:${margin}px;background:#fff">${body}</div></foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(k, k);
    ctx.drawImage(img, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'));
  } finally {
    host.remove();
  }
}
