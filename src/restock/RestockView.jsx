import { useState } from 'react';
import { PackageSearch, Plus } from 'lucide-react';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { useRestockRequests } from './useRestockRequests';
import { computeRestockAlerts } from './restockAlerts';
import {
  createRestockRequest, approveRestockRequest, rejectRestockRequest, cancelRestockRequest,
} from './restockRequestActions';
import { can } from '../lib/permissions';
import { currency } from '../lib/format';
import { db } from '../firebase';
import Modal from '../shared/Modal';
import Tooltip from '../shared/Tooltip';

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', fulfilled: 'Fulfilled', cancelled: 'Cancelled' };

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

// The reviewer (Owner or Warehouse) picks which location's stock actually
// ships. A Warehouse reviewer can only ever ship from their OWN assigned
// warehouse — Firestore rules only grant them read access to their own
// location's items — so their source is fixed and only the Owner gets a
// location picker. The source ITEM is then matched by SKU: items are
// separate documents per location (see transferActions.js), linked only by
// sharing the same auto-generated SKU (see src/lib/sku.js), so this is the
// same "find the matching item at the other location" lookup Transfers
// already relies on implicitly.
function ApproveRequestModal({ request, role, ownShopId, approverId, onClose, onDone }) {
  const shops = useShops();
  const [sourceShopId, setSourceShopId] = useState(role === 'owner' ? '' : ownShopId);
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
          {role === 'owner' ? (
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

export default function RestockView({ role, shopId, userId }) {
  const isReviewer = can(role, 'reviewRestockRequest');
  const items = useItems({ role, shopId });
  // Only the Owner's rules grant an unfiltered items read — Warehouse
  // staff (also a reviewer) can only ever read their OWN assigned
  // location's items, so their alert view is scoped like everyone else's
  // even though they review requests system-wide.
  const allItems = useItems(role === 'owner' ? { role: 'owner' } : { role, shopId });
  const shops = useShops();
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
                  <td><span className={`status-badge status-${r.status === 'fulfilled' ? 'in' : r.status === 'rejected' || r.status === 'cancelled' ? 'out' : 'low'}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
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

      {creatingFor !== undefined && (
        <CreateRequestModal
          shopId={shopId} userId={userId} items={items} prefill={creatingFor}
          onClose={() => setCreatingFor(undefined)} onDone={() => setCreatingFor(undefined)}
        />
      )}
      {approving && (
        <ApproveRequestModal
          request={approving} role={role} ownShopId={shopId} approverId={userId}
          onClose={() => setApproving(null)} onDone={() => setApproving(null)}
        />
      )}
    </div>
  );
}
