// Minimal, dependency-free CSV parse/stringify — just enough for a small
// shop's Inventory export/import (see src/inventory/InventoryList.jsx and
// src/inventory/ImportItemsModal.jsx). Handles quoted fields (so a name or
// notes value containing a comma or a newline round-trips correctly) and
// doubled-quote escaping (`""` inside a quoted field means a literal `"`),
// which is the one part a naive `line.split(',')` gets wrong.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  // Last field/row (files don't always end with a trailing newline).
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // Drop a wholly-blank trailing row (a common trailing-newline artifact).
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

// Parses `text` as a header row + data rows, returning an array of plain
// objects keyed by the (trimmed) header names — the shape both the
// Inventory export and import actually work with, rather than raw arrays.
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => (v || '').trim() !== '')) // skip blank lines
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function escapeCsvField(value) {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// `rows` is an array of plain objects; `headers` fixes both the column
// order and which fields are included (an object's extra keys are
// ignored) — callers always pass this explicitly rather than trusting
// Object.keys() order, so the export format stays stable across items
// with different optional fields set.
export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsvField).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(','));
  });
  return lines.join('\n');
}
