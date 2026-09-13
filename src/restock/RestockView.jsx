import { useState } from 'react';
import { PackageSearch, Plus } from 'lucide-react';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { useRestockRequests } from './useRestockRequests';
import { computeRestockAlerts } from './restockAlerts';
import { createRestockRequest, rejectRestockRequest, cancelRestockRequest } from './restockRequestActions';
import { STATUS_LABELS, statusBadgeClass } from './restockStatus';
import ApproveRestockRequestModal from './ApproveRestockRequestModal';
import WarehouseRestockModal from './WarehouseRestockModal';
import { can } from '../lib/permissions';
import { db } from '../firebase';
import Modal from '../shared/Modal';
import Tooltip from '../shared/Tooltip';

// Pre-fills from a low-stock alert when opened via "Create request" on an
// alert row; otherwise starts blank and the requester picks an item.
function CreateRequestModal({ shopId, userId, items, prefill, onClose, onDone }) {
  const [itemId, setItemId] = useState(prefill?.itemId || '');
  const [quantity, setQuantity] = useState(prefill?.suggestedQty || 1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = itemId !== (prefill?.itemId || '') || Number(quantity) !== (prefill?.suggestedQty || 1) || notes !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const item = items.find((it) => it.id === itemId);
    if (!item) { setError('Select an item.'); return; }
    setSaving(true);
    try {
      await createRestockRequest(db, { item, quantity: Number(quantity), requestingShopId: shopId, requestedBy: userId, notes });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Restock Request" onClose={onClose} dirty={dirty}>
      <form onSubmit={handleSubmit} className="item-form">
        <div className="item-form-grid">
          <label className="item-form-field">
            <span className="item-form-field-label">Item</span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} required autoFocus disabled={!!prefill}>
              <option value="">Select item…</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
            </select>
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Requested quantity</span>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Notes</span>
            <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function RestockView({ role, shopId, userId }) {
  const isReviewer = can(role, 'reviewRestockRequest');
  const items = useItems({ role, shopId });
  // Only the Owner's rules grant an unfiltered items read — Warehouse
  // staff (also a reviewer) can only ever read their OWN assigned
  // location's items, so their alert view is scoped like everyone else's
  // even though they review requests system-wide.
  const allItems = useItems(role === 'owner' ? { role: 'owner' } : { role, shopId });
  const shops = useShops();
  const warehouseShopIds = shops.filter((s) => s.type === 'warehouse').map((s) => s.id);
  const requests = useRestockRequests({ role, shopId });

  const [creatingFor, setCreatingFor] = useState(undefined); // undefined = closed, null = blank form, {itemId,...} = prefilled
  const [approving, setApproving] = useState(null);
  const [error, setError] = useState('');

  const alerts = computeRestockAlerts(allItems, shops);

  async function handleReject(request) {
    setError('');
    const notes = window.prompt('Reason for rejecting this request (optional):') || '';
    try {
      await rejectRestockRequest(db, request.id, { reviewedBy: userId, notes });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCancel(request) {
    setError('');
    try {
      await cancelRestockRequest(db, request.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="restock-view">
      <div className="section-header-row">
        <h2><PackageSearch size={18} /> Restock</h2>
        {can(role, 'createRestockRequest') && (
          <button type="button" className="btn-primary" onClick={() => setCreatingFor(null)}>
            <Plus size={16} /> New restock request
          </button>
        )}
      </div>
      {error && <p className="restock-error">{error}</p>}

      <h3>Low-stock alerts{role === 'owner' ? ' (all locations)' : ''}</h3>
      <div className="activity-log-table-wrap">
        <table className="activity-log-table">
          <thead>
            <tr><th>Shop/Warehouse</th><th>Item</th><th>SKU</th><th>Current stock</th><th>Min stock</th><th>Suggested restock</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.itemId}>
                <td>{a.shopName} <span className={`shop-type-badge shop-type-${a.shopType}`}>{a.shopType === 'warehouse' ? 'Warehouse' : 'Store'}</span></td>
                <td>{a.name}</td><td>{a.sku}</td><td>{a.currentStock}</td><td>{a.minStock}</td><td>{a.suggestedQty}</td>
                <td>
                  {can(role, 'createRestockRequest') && a.shopId === shopId && (
                    <button type="button" className="btn-link" onClick={() => setCreatingFor(a)}>Create request</button>
                  )}
                </td>
              </tr>
            ))}
            {alerts.length === 0 && <tr><td colSpan={7} className="activity-log-empty">No items are at or below their reorder point.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>{isReviewer ? 'All Restock Requests' : 'My Restock Requests'}</h3>
      <div className="activity-log-table-wrap">
        <table className="activity-log-table">
          <thead>
            <tr><th>Requested</th><th>Item</th><th>SKU</th><th>Qty</th><th>Requesting shop</th><th>Status</th><th>Notes</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const shop = shops.find((s) => s.id === r.requestingShopId);
              return (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.itemName}</td>
                  <td>{r.itemSku}</td>
                  <td>{r.requestedQty}</td>
                  <td>{shop?.name || r.requestingShopId}</td>
                  <td><span className={`status-badge ${statusBadgeClass(r.status)}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
                  <td>{r.notes || (r.transferId ? `Transfer ${r.transferId}` : '—')}</td>
                  <td>
                    <div className="list-row-actions">
                      {r.status === 'pending' && isReviewer && (
                        <>
                          <Tooltip label="Approve and start the outgoing transfer">
                            <button className="btn-primary" onClick={() => setApproving(r)}>Approve</button>
                          </Tooltip>
                          <button className="btn-danger" onClick={() => handleReject(r)}>Reject</button>
                        </>
                      )}
                      {r.status === 'pending' && !isReviewer && r.requestingShopId === shopId && (
                        <button className="btn-secondary" onClick={() => handleCancel(r)}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && <tr><td colSpan={8} className="activity-log-empty">No restock requests yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Plain "New restock request" (creatingFor === null) opens the
          full warehouse browser (WarehouseRestockModal) — the per-item
          "Create request" link on a low-stock alert row (creatingFor is
          the alert object) keeps the older quick single-item form, since
          that flow already knows exactly which item/quantity to suggest. */}
      {creatingFor === null && (
        <WarehouseRestockModal
          shopId={shopId} userId={userId} warehouseShopIds={warehouseShopIds}
          onClose={() => setCreatingFor(undefined)} onDone={() => setCreatingFor(undefined)}
        />
      )}
      {creatingFor !== undefined && creatingFor !== null && (
        <CreateRequestModal
          shopId={shopId} userId={userId} items={items} prefill={creatingFor}
          onClose={() => setCreatingFor(undefined)} onDone={() => setCreatingFor(undefined)}
        />
      )}
      {approving && (
        <ApproveRestockRequestModal
          request={approving} role={role} ownShopId={shopId} approverId={userId}
          onClose={() => setApproving(null)} onDone={() => setApproving(null)}
        />
      )}
    </div>
  );
}
