import { useState } from 'react';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { approveRestockRequest } from './restockRequestActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

// Shared by src/restock/RestockView.jsx and src/reports/RequestsView.jsx
// (the Owner's global Requests Center) — one approval flow, reused rather
// than re-implemented, so the two screens can't drift on how an approval
// actually ships stock.
//
// The reviewer (Owner or Warehouse) picks which location's stock actually
// ships. A Warehouse reviewer can only ever ship from their OWN assigned
// warehouse — Firestore rules only grant them read access to their own
// location's items — so their source is fixed and only the Owner gets a
// location picker. The source ITEM is then matched by SKU: items are
// separate documents per location (see transferActions.js), linked only by
// sharing the same auto-generated SKU (see src/lib/sku.js), so this is the
// same "find the matching item at the other location" lookup Transfers
// already relies on implicitly.
export default function ApproveRestockRequestModal({ request, role, ownShopId, approverId, onClose, onDone }) {
  const shops = useShops();
  const [sourceShopId, setSourceShopId] = useState(role === 'admin' ? '' : ownShopId);
  const sourceItems = useItems({ role: 'manager', shopId: sourceShopId || '__none__' });
  const matchingItems = sourceItems.filter((it) => it.sku === request.itemSku);
  const [sourceItemId, setSourceItemId] = useState('');
  const [quantity, setQuantity] = useState(request.requestedQty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveSourceItemId = sourceItemId || matchingItems[0]?.id || '';
  const sourceCandidateShops = shops.filter((s) => s.id !== request.requestingShopId);

  async function handleApprove(e) {
    e.preventDefault();
    setError('');
    if (!sourceShopId || !effectiveSourceItemId) { setError('Select a source location and matching item.'); return; }
    setSaving(true);
    try {
      await approveRestockRequest(db, request.id, {
        sourceItemId: effectiveSourceItemId, sourceShopId, quantity: Number(quantity), approvedBy: approverId,
      });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Approve Request — ${request.itemSku}`} onClose={onClose} dirty>
      <form onSubmit={handleApprove} className="item-form">
        <p className="item-form-shop-confirm">
          Approving creates a Transfer Out from the source location you pick below. Stock only moves once the
          destination confirms receipt (Transfer In).
        </p>
        <div className="item-form-grid">
          {role === 'admin' ? (
            <label className="item-form-field">
              <span className="item-form-field-label">Source location</span>
              <select value={sourceShopId} onChange={(e) => { setSourceShopId(e.target.value); setSourceItemId(''); }} required autoFocus>
                <option value="">Select source…</option>
                {sourceCandidateShops.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type === 'warehouse' ? 'Warehouse' : 'Store'})</option>)}
              </select>
            </label>
          ) : (
            <p className="item-form-shop-confirm">Shipping from your own warehouse.</p>
          )}
          <label className="item-form-field">
            <span className="item-form-field-label">Matching item at source</span>
            <select value={effectiveSourceItemId} onChange={(e) => setSourceItemId(e.target.value)} required disabled={!sourceShopId}>
              <option value="">{sourceShopId ? (matchingItems.length ? 'Select item…' : `No item with SKU ${request.itemSku} there`) : 'Pick a source location first'}</option>
              {matchingItems.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name} ({it.quantity} in stock)</option>)}
            </select>
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Quantity to ship</span>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Approving…' : 'Approve & ship'}</button>
        </div>
      </form>
    </Modal>
  );
}
