/**
 * Minimal HTML sanitizer — strips dangerous tags and attributes
 * to prevent XSS while preserving basic formatting for admin content.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "b", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "a", "span", "div",
  "table", "thead", "tbody", "tr", "th", "td",
  "blockquote", "pre", "code",
  "img",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  span: new Set(["style"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

const DANGEROUS_PROTOCOLS = /javascript:|data:|vbscript:|file:|blob:/i;

/** Escapes HTML special characters to prevent XSS in text contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  const clean = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (!ALLOWED_TAGS.has(tag)) {
          el.remove();
          continue;
        }

        // Remove disallowed attributes
        const allowed = ALLOWED_ATTRS[tag] ?? new Set();
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          if (!allowed.has(attr.name)) {
            el.removeAttribute(attr.name);
          }
        }

        // Sanitize href/src values
        if (el.hasAttribute("href")) {
          const href = el.getAttribute("href") ?? "";
          if (DANGEROUS_PROTOCOLS.test(href)) {
            el.setAttribute("href", "#");
          }
        }
        if (el.hasAttribute("src")) {
          const src = el.getAttribute("src") ?? "";
          if (DANGEROUS_PROTOCOLS.test(src)) {
            el.setAttribute("src", "");
          }
        }

        // Remove event handler attributes
        const eventAttrs = Array.from(el.attributes).filter(a =>
          a.name.startsWith("on")
        );
        for (const attr of eventAttrs) {
          el.removeAttribute(attr.name);
        }

        // Recurse
        clean(el);
      }
    }
  };

  clean(div);
  return div.innerHTML;
}
