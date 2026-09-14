// Escapes text that gets interpolated into an HTML string built by hand
// (e.g. a print window's document.write) rather than rendered through
// React, which escapes automatically. Item name/SKU are Admin-entered but
// still arbitrary text — without this, a name containing `<`/`&`/etc could
// break the print layout or, worst case, inject markup into that window.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
