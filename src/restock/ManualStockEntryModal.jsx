import { useState } from 'react';
import { useWarehouseItems } from './useWarehouseItems';
import { useShops } from '../shops/useShops';
import { addStockDirectly } from './manualStockActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

// Admin-only "add stock records manually to individual shops" flow — picks
// a target shop, browses the same warehouse master list
// WarehouseRestockModal shows a Manager, checks off items and quantities,
// and submits. Unlike a Restock Request, this applies immediately: there
// is no pending/approve/dispatch/confirm cycle, since only an Admin (who
// already has full write authority — see permissions.js) can reach this.
export default function ManualStockEntryModal({ warehouseShopIds, userId, onClose, onDone }) {
  const shops = useShops();
  const warehouseItems = useWarehouseItems(warehouseShopIds);
  const [shopId, setShopId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({}); // itemId -> quantity string
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const q = search.trim().toLowerCase();
  const filtered = warehouseItems.filter((it) => !q
    || it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q) || it.category?.toLowerCase().includes(q));

  const selectedCount = Object.keys(selected).length;
  const dirty = !!shopId || selectedCount > 0 || notes !== '';

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
    if (!shopId) { setError('Select a shop to add stock to.'); return; }
    const lines = Object.entries(selected)
      .map(([itemId, qty]) => ({ item: warehouseItems.find((it) => it.id === itemId), qty: Number(qty) }))
      .filter((l) => l.item && l.qty > 0);
    if (lines.length === 0) { setError('Select at least one item and a quantity.'); return; }

    setSaving(true);
    try {
      // Sequential, not Promise.all — same reasoning as
      // WarehouseRestockModal: a failure partway through stays
      // attributable to one line, and every line applied before the
      // failure still stands.
      for (const line of lines) {
        // eslint-disable-next-line no-await-in-loop
        await addStockDirectly(db, {
          shopId, sourceItem: line.item, quantity: line.qty, notes, actorId: userId,
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
    <Modal title="Add Stock to a Shop" onClose={onClose} dirty={dirty} className="warehouse-restock-modal">
      <form onSubmit={handleSubmit} className="item-form">
        <p className="item-form-shop-confirm">
          Adds stock directly to the shop you pick below — no approval step, since only an Admin can do this. Use
          this for an initial stock load or a manual correction; day-to-day restocking should still go through a
          Restock Request so it stays traceable through Approve/Dispatch/Receive.
        </p>
        <div className="item-form-grid">
          <label className="item-form-field">
            <span className="item-form-field-label">Shop</span>
            <select value={shopId} onChange={(e) => setShopId(e.target.value)} required autoFocus>
              <option value="">Select shop…</option>
              {shops.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type === 'warehouse' ? 'Warehouse' : 'Store'})</option>)}
            </select>
          </label>
        </div>
        <input className="inventory-search" placeholder="Search item, SKU, or category…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="activity-log-table-wrap warehouse-restock-table-wrap">
          <table className="activity-log-table">
            <thead>
              <tr><th></th><th>Item</th><th>SKU</th><th>Category</th><th>Available warehouse qty</th><th>Quantity to add</th></tr>
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
                        <input type="number" min="1" style={{ width: 80 }}
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
          <input placeholder="Notes (optional, applies to this whole entry)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Adding…' : `Add stock${selectedCount > 1 ? ` (${selectedCount} items)` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
