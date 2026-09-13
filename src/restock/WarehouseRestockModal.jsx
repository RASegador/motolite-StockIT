import { useMemo, useState } from 'react';
import { useWarehouseItems } from './useWarehouseItems';
import { createRestockRequest } from './restockRequestActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

// The Manager's "browse the warehouse, check what you need, submit one
// batch" restock flow — a store Manager can select multiple items in one
// sitting (a separate restockRequests doc per item under the hood, since
// approve/reject/fulfillment already all operate per-item, but submitted
// together as one action from here) and can only ever pick a QUANTITY TO
// REQUEST, never touch warehouse stock directly — the Request quantity
// input has no bearing on the warehouse item's own `quantity` field, that
// only ever changes once an Owner/Warehouse reviewer approves and a
// Transfer actually ships (see restockRequestActions.js).
export default function WarehouseRestockModal({ shopId, userId, warehouseShopIds, onClose, onDone }) {
  const warehouseItems = useWarehouseItems(warehouseShopIds);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({}); // itemId -> quantity string
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const q = search.trim().toLowerCase();
  const filtered = warehouseItems.filter((it) => !q
    || it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q) || it.category?.toLowerCase().includes(q));

  const selectedCount = Object.keys(selected).length;
  const dirty = selectedCount > 0 || notes !== '';

  function toggle(item, checked) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[item.id] = next[item.id] ?? 1;
      else delete next[item.id];
      return next;
    });
  }

  function setQty(itemId, value) {
    setSelected((prev) => ({ ...prev, [itemId]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const lines = Object.entries(selected)
      .map(([itemId, qty]) => ({ item: warehouseItems.find((it) => it.id === itemId), qty: Number(qty) }))
      .filter((l) => l.item && l.qty > 0);
    if (lines.length === 0) { setError('Select at least one item and a quantity.'); return; }

    setSaving(true);
    try {
      // Sequential, not Promise.all — if one line fails partway through
      // (e.g. an item was deleted a moment ago) the error message stays
      // attributable to a single item instead of an ambiguous batch
      // rejection, and every request submitted before the failure still
      // stands rather than being rolled back.
      for (const line of lines) {
        // eslint-disable-next-line no-await-in-loop
        await createRestockRequest(db, {
          item: line.item, quantity: line.qty, requestingShopId: shopId, requestedBy: userId, notes,
        });
      }
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Restock Request" onClose={onClose} dirty={dirty} className="warehouse-restock-modal">
      <form onSubmit={handleSubmit} className="item-form">
        <p className="item-form-shop-confirm">
          Browse what's currently in the warehouse and select what your store needs — you're only submitting a
          request here, not touching warehouse stock.
        </p>
        <input className="inventory-search" placeholder="Search item, SKU, or category…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="activity-log-table-wrap warehouse-restock-table-wrap">
          <table className="activity-log-table">
            <thead>
              <tr><th></th><th>Item</th><th>SKU</th><th>Category</th><th>Available warehouse qty</th><th>Requested qty</th></tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const checked = it.id in selected;
                return (
                  <tr key={it.id}>
                    <td><input type="checkbox" checked={checked} onChange={(e) => toggle(it, e.target.checked)} /></td>
                    <td>{it.name}</td>
                    <td>{it.sku}</td>
                    <td>{it.category || '—'}</td>
                    <td>{it.quantity}</td>
                    <td>
                      {checked && (
                        <input type="number" min="1" max={it.quantity || undefined} style={{ width: 80 }}
                          value={selected[it.id]} onChange={(e) => setQty(it.id, e.target.value)} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="activity-log-empty">
                  {warehouseItems.length === 0 ? 'No warehouse stock available yet.' : 'No items match your search.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <label className="item-form-field">
          <span className="item-form-field-label">Notes</span>
          <input placeholder="Notes (optional, applies to this whole request)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Submitting…' : `Submit request${selectedCount > 1 ? `s (${selectedCount} items)` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
