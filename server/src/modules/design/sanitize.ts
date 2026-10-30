// Stitch-in yaratdığı HTML-in təmizlənməsi. Təhlükəsizlik iki qatdır:
//   1. Bu sanitizer (defense in depth): yalnız Tailwind CDN skripti və `tailwind.config = …` konfiqurasiyası saxlanılır;
//      on* hadisə atributları, javascript: URL-ləri, iframe/object/embed/base/meta refresh silinir; linklər səhifədən
//      çıxarmır (href → #), formlar heç yerə göndərilmir. Content-Security-Policy <meta> əlavə olunur (fetch/XHR qadağan).
//   2. Portal HTML-i `<iframe sandbox="allow-scripts" srcdoc>` daxilində göstərir — allow-same-origin YOXDUR:
//      skript Callbox-un cookie/localStorage/token-lərinə çata bilmir, yuxarı pəncərəni yönləndirə bilmir, popup aça bilmir.
import sanitizeHtml from 'sanitize-html';

const TAILWIND_CDN = /^https:\/\/cdn\.tailwindcss\.com(\/|\?|$)/;
const FONT_CSS = /^https:\/\/fonts\.googleapis\.com\//;

export const DESIGN_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  'img-src https: data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const SVG_ATTRS = ['viewbox', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'points', 'transform', 'xmlns', 'opacity', 'fill-rule', 'clip-rule', 'rx', 'ry', 'preserveAspectRatio'];

export function sanitizeDesignHtml(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: false, // bütün struktur teqləri (div, section, svg …) — qadağan olunanlar aşağıda
    disallowedTagsMode: 'discard',
    allowVulnerableTags: true, // <style> və (yoxlanılmış) <script> saxlanılır
    nonTextTags: ['textarea', 'option', 'noscript'],
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'role', 'title', 'lang', 'dir', 'tabindex', 'aria-*', 'data-*', 'alt', 'width', 'height', 'hidden', ...SVG_ATTRS],
      a: ['href', 'class', 'style', 'aria-*', 'data-*', 'id', 'title'],
      img: ['src', 'srcset', 'sizes', 'alt', 'loading', 'class', 'style', 'width', 'height', 'id', 'data-*', 'aria-*'],
      input: ['type', 'placeholder', 'value', 'name', 'checked', 'disabled', 'readonly', 'min', 'max', 'step', 'class', 'style', 'id', 'aria-*', 'autocomplete'],
      textarea: ['placeholder', 'rows', 'cols', 'name', 'class', 'style', 'id', 'aria-*'],
      select: ['name', 'class', 'style', 'id', 'aria-*', 'disabled'],
      option: ['value', 'selected', 'disabled'],
      button: ['type', 'disabled', 'class', 'style', 'id', 'aria-*', 'data-*', 'title'],
      label: ['for', 'class', 'style', 'id'],
      form: ['class', 'style', 'id'],
      link: ['href', 'rel', 'crossorigin'],
      meta: ['charset', 'name', 'content'],
      script: ['src', 'id'],
      html: ['lang', 'class', 'dir'],
    },
    allowedSchemes: ['https', 'data'],
    allowedSchemesByTag: { a: ['https', 'http'] },
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => {
      const tag = frame.tag;
      if (['iframe', 'frame', 'frameset', 'object', 'embed', 'base', 'applet', 'portal'].includes(tag)) return true;
      // http-equiv (refresh, CSP override) atributu artıq süzülüb — yalnız charset / name olan meta saxlanılır
      if (tag === 'meta') return !(frame.attribs.charset || frame.attribs.name);
      if (tag === 'link') return !(frame.attribs.rel === 'stylesheet' && FONT_CSS.test(frame.attribs.href ?? '')) && frame.attribs.rel !== 'preconnect';
      if (tag === 'script') {
        if (frame.attribs.src) return !TAILWIND_CDN.test(frame.attribs.src);
        // yalnız Tailwind konfiqurasiyası: "tailwind.config = {...}" — başqa inline skript yoxdur
        return !/^\s*tailwind\.config\s*=/.test(frame.text) || /<\/?script|import\s*\(|fetch\s*\(|XMLHttpRequest|document\.cookie|localStorage|top\.|parent\.|window\.open/i.test(frame.text);
      }
      return false;
    },
    transformTags: {
      // Linklər Stitch-ə və ya başqa sayta aparmasın — dizayn yalnız baxış üçündür
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, href: '#' } }),
      link: (tagName, attribs) => ({ tagName, attribs: attribs.rel === 'preconnect' ? { rel: 'preconnect', href: attribs.href?.startsWith('https://fonts.') ? attribs.href : 'https://fonts.gstatic.com' } : attribs }),
    },
  });
  const csp = `<meta http-equiv="Content-Security-Policy" content="${DESIGN_CSP}">`;
  // CSP ən əvvəldə olmalıdır (skriptlərdən əvvəl)
  if (/<head[^>]*>/i.test(clean)) return `<!DOCTYPE html>\n${clean.trimStart().replace(/<head[^>]*>/i, (m) => `${m}${csp}`)}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${csp}</head><body>${clean}</body></html>`;
}
