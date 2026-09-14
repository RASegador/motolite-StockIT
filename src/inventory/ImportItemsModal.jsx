import { useState } from 'react';
import { parseCsvObjects } from '../lib/csv';
import { saveItem } from './inventoryActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

// Admin-only bulk import for the Warehouse Inventory master list — pairs
// with InventoryList.jsx's "Export CSV" (same column names), so the normal
// flow is: export, edit in a spreadsheet, re-import. A row whose `sku`
// matches an EXISTING warehouse item updates that item in place (so a
// re-import after editing exported data never creates duplicates); a row
// with a blank/unmatched sku creates a brand-new warehouse item, same as
// using "Add New Item" one at a time. Every row still goes through
// saveItem() — the same validation/SKU-generation/public-mirror logic the
// single-item form uses — just looped, so this can never produce an item
// shaped differently than one created by hand.
const EXPECTED_HEADERS = ['sku', 'name', 'category', 'supplier', 'quantity', 'unitCost', 'sellingPrice', 'batteryModel', 'voltage', 'capacity', 'vehicleType', 'reorderPoint'];

export default function ImportItemsModal({ warehouseShops, items, suppliers, userId, onClose, onDone }) {
  const [warehouseShopId, setWarehouseShopId] = useState(warehouseShops[0]?.id || '');
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null); // { created, updated, errors: [{row, message}] }
  const [error, setError] = useState('');

  const supplierIdByName = new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const itemBySku = new Map(items.filter((it) => it.sku).map((it) => [it.sku, it]));

  async function handleFile(e) {
    setError('');
    setResults(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsvObjects(text);
    if (parsed.length === 0) { setError('That file has no data rows.'); setRows(null); return; }
    setRows(parsed);
  }

  async function handleImport() {
    setError('');
    if (!warehouseShopId) { setError('Select a warehouse to import into.'); return; }
    if (!rows || rows.length === 0) { setError('Choose a CSV file first.'); return; }

    setImporting(true);
    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowLabel = row.name || row.sku || `row ${i + 2}`; // +2: header row + 1-indexing
      try {
        if (!row.name?.trim()) throw new Error('Missing name');
        const existing = row.sku ? itemBySku.get(row.sku.trim()) : null;
        const supplierId = row.supplier ? supplierIdByName.get(row.supplier.trim().toLowerCase()) : null;
        const draft = {
          ...(existing || {}),
          id: existing?.id,
          name: row.name.trim(),
          category: row.category?.trim() || existing?.category || '',
          supplierIds: supplierId ? [supplierId] : (existing?.supplierIds || []),
          baseUnitName: existing?.baseUnitName || 'Piece',
          baseUnitStock: row.quantity !== '' && row.quantity != null ? Number(row.quantity) : (existing?.quantity ?? 0),
          units: existing?.units || [],
          unitCost: row.unitCost !== '' && row.unitCost != null ? Number(row.unitCost) : (existing?.unitCost ?? 0),
          markupType: existing?.markupType || 'percent',
          markupValue: existing?.markupValue ?? 0,
          // If a sellingPrice was given explicitly, back-solve it into the
          // markup fields saveItem() actually reads (it always recomputes
          // sellingPrice from cost + markup, never trusts a stored price —
          // see inventoryActions.js's saveItem comment).
          ...(row.sellingPrice !== '' && row.sellingPrice != null && Number(row.unitCost || existing?.unitCost || 0) > 0
            ? { markupType: 'fixed', markupValue: Number(row.sellingPrice) - Number(row.unitCost || existing?.unitCost || 0) }
            : {}),
          batteryModel: row.batteryModel?.trim() || existing?.batteryModel || '',
          voltage: row.voltage !== '' && row.voltage != null ? Number(row.voltage) : (existing?.voltage ?? 12),
          capacity: row.capacity?.trim() || existing?.capacity || '',
          vehicleType: row.vehicleType?.trim() || existing?.vehicleType || '',
          reorderPoint: row.reorderPoint !== '' && row.reorderPoint != null ? Number(row.reorderPoint) : (existing?.reorderPoint ?? 0),
          reorderUnit: existing?.reorderUnit || 'Piece',
          warrantyMonths: existing?.warrantyMonths ?? 12,
          sku: existing?.sku || (row.sku?.trim() || undefined),
        };
        // eslint-disable-next-line no-await-in-loop
        await saveItem(db, draft, { shopId: warehouseShopId, actorId: userId });
        if (existing) updated += 1; else created += 1;
      } catch (err) {
        errors.push({ row: rowLabel, message: err.message });
      }
    }

    setResults({ created, updated, errors });
    setImporting(false);
    if (errors.length === 0) onDone?.();
  }

  const dirty = !!rows;

  return (
    <Modal title="Import Items from CSV" onClose={onClose} dirty={dirty}>
      <div className="item-form">
        <p className="item-form-shop-confirm">
          Columns: <code>{EXPECTED_HEADERS.join(', ')}</code>. Only <code>name</code> is required — everything else is
          optional. A row whose <code>sku</code> matches an existing warehouse item updates that item instead of
          creating a duplicate (use "Export CSV" first, edit, then re-import to bulk-update).
        </p>
        <div className="item-form-grid">
          <label className="item-form-field">
            <span className="item-form-field-label">Import into warehouse</span>
            <select value={warehouseShopId} onChange={(e) => setWarehouseShopId(e.target.value)} required>
              <option value="">Select warehouse…</option>
              {warehouseShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">CSV file</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} />
          </label>
        </div>
        {rows && !results && <p className="item-form-shop-confirm">{fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} ready to import.</p>}
        {error && <p className="modal-error">{error}</p>}
        {results && (
          <div className="item-form-shop-confirm">
            <p>Created {results.created}, updated {results.updated}{results.errors.length > 0 ? `, ${results.errors.length} failed` : ''}.</p>
            {results.errors.length > 0 && (
              <ul>
                {results.errors.map((e, i) => <li key={i}>{e.row}: {e.message}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={importing}>
            {results && results.errors.length === 0 ? 'Close' : 'Cancel'}
          </button>
          <button type="button" className="btn-primary" onClick={handleImport} disabled={importing || !rows}>
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
