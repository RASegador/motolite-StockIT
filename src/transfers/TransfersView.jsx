import { useState } from 'react';
import { Truck, Plus } from 'lucide-react';
import { useTransfers } from './useTransfers';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { initiateTransfer, confirmReceipt } from './transferActions';
import { can } from '../lib/permissions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

const BLANK_FORM = { itemId: '', toShopId: '', quantity: 1 };

export default function TransfersView({ role, shopId, userId }) {
  const transfers = useTransfers({ role, shopId });
  const items = useItems({ role, shopId });
  const shops = useShops();
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [confirmQty, setConfirmQty] = useState({});
  const [confirmNotes, setConfirmNotes] = useState({});
  const [error, setError] = useState('');

  async function handleInitiate(e) {
    e.preventDefault();
    setError('');
    try {
      await initiateTransfer(db, {
        itemId: form.itemId, fromShopId: shopId, toShopId: form.toShopId,
        quantity: Number(form.quantity), initiatedBy: userId,
      });
      setForm(BLANK_FORM);
      setShowAddForm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  // A short/over shipment must be explained — never silently swallowed
  // into a bare "disputed" status (see the "Add a Receive Function" spec:
  // "If the received quantity differs from the expected quantity, require
  // the user to record the discrepancy and reason").
  async function handleConfirm(transferId, expectedQty) {
    setError('');
    const receivedQty = Number(confirmQty[transferId] ?? 0);
    const notes = (confirmNotes[transferId] || '').trim();
    if (receivedQty !== expectedQty && !notes) {
      setError(`Received quantity (${receivedQty}) differs from expected (${expectedQty}) — enter a reason before confirming.`);
      return;
    }
    try {
      await confirmReceipt(db, transferId, receivedQty, userId, notes);
    } catch (err) {
      setError(err.message);
    }
  }

  const formDirty = JSON.stringify(form) !== JSON.stringify(BLANK_FORM);

  return (
    <div className="transfers-view">
      <div className="section-header-row">
        <h2><Truck size={18} /> Branch Transfers</h2>
        {can(role, 'initiateTransfer') && (
          <button type="button" className="btn-primary" onClick={() => setShowAddForm(true)}><Plus size={16} /> Initiate transfer</button>
        )}
      </div>
      {error && !showAddForm && <p className="transfer-error">{error}</p>}

      {showAddForm && can(role, 'initiateTransfer') && (
        <Modal title="Initiate Transfer" onClose={() => setShowAddForm(false)} dirty={formDirty}>
          <form onSubmit={handleInitiate} className="item-form transfer-initiate-form">
            <div className="item-form-grid">
              <label className="item-form-field">
                <span className="item-form-field-label">Item</span>
                <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required autoFocus>
                  <option value="">Item…</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
                </select>
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">To shop</span>
                <select value={form.toShopId} onChange={(e) => setForm({ ...form, toShopId: e.target.value })} required>
                  <option value="">To shop…</option>
                  {shops.filter((s) => s.id !== shopId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">Quantity</span>
                <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </label>
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Ship transfer</button>
            </div>
          </form>
        </Modal>
      )}

      <table>
        <thead>
          <tr><th>Item</th><th>From</th><th>To</th><th>Expected qty</th><th>Status</th><th>Receive</th></tr>
        </thead>
        <tbody>
          {transfers.map((t) => {
            const fromShop = shops.find((s) => s.id === t.fromShopId);
            const toShop = shops.find((s) => s.id === t.toShopId);
            const canConfirmHere = t.status === 'in_transit' && can(role, 'confirmTransfer')
              && (role === 'owner' || t.toShopId === shopId);
            const receivedQty = Number(confirmQty[t.id] ?? t.quantity);
            const qtyDiffers = receivedQty !== t.quantity;
            return (
              <tr key={t.id}>
                <td>{t.itemSku}</td>
                <td>{fromShop?.name || t.fromShopId}</td>
                <td>{toShop?.name || t.toShopId}</td>
                <td>{t.quantity}</td>
                <td>
                  {t.status}
                  {t.status === 'disputed' && t.notes && (
                    <div className="transfer-discrepancy-note">
                      Expected {t.quantity}, received {t.confirmedQuantity} — {t.notes}
                    </div>
                  )}
                </td>
                <td>
                  {canConfirmHere && (
                    <div className="transfer-receive-cell">
                      <input type="number" placeholder="Qty received" style={{ width: 80 }}
                        value={confirmQty[t.id] ?? t.quantity}
                        onChange={(e) => setConfirmQty({ ...confirmQty, [t.id]: e.target.value })} />
                      {qtyDiffers && (
                        <input placeholder="Reason for discrepancy (required)" style={{ width: 200 }}
                          value={confirmNotes[t.id] || ''}
                          onChange={(e) => setConfirmNotes({ ...confirmNotes, [t.id]: e.target.value })} />
                      )}
                      <button className="btn-primary" onClick={() => handleConfirm(t.id, t.quantity)}>Confirm receipt</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
