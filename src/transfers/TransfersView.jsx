import { useState } from 'react';
import { Truck } from 'lucide-react';
import { useTransfers } from './useTransfers';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { initiateTransfer, confirmReceipt } from './transferActions';
import { can } from '../lib/permissions';
import { db } from '../firebase';

export default function TransfersView({ role, shopId, userId }) {
  const transfers = useTransfers({ role, shopId });
  const items = useItems({ role, shopId });
  const shops = useShops();
  const [form, setForm] = useState({ itemId: '', toShopId: '', quantity: 1 });
  const [confirmQty, setConfirmQty] = useState({});
  const [error, setError] = useState('');

  async function handleInitiate(e) {
    e.preventDefault();
    setError('');
    try {
      await initiateTransfer(db, {
        itemId: form.itemId, fromShopId: shopId, toShopId: form.toShopId,
        quantity: Number(form.quantity), initiatedBy: userId,
      });
      setForm({ itemId: '', toShopId: '', quantity: 1 });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConfirm(transferId) {
    setError('');
    try {
      await confirmReceipt(db, transferId, Number(confirmQty[transferId] ?? 0), userId);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="transfers-view">
      <h2><Truck size={18} /> Branch Transfers</h2>

      {can(role, 'initiateTransfer') && (
        <form onSubmit={handleInitiate} className="transfer-initiate-form">
          <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required>
            <option value="">Item…</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
          </select>
          <select value={form.toShopId} onChange={(e) => setForm({ ...form, toShopId: e.target.value })} required>
            <option value="">To shop…</option>
            {shops.filter((s) => s.id !== shopId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <button type="submit">Ship transfer</button>
        </form>
      )}
      {error && <p className="transfer-error">{error}</p>}

      <table>
        <thead>
          <tr><th>Item</th><th>From</th><th>To</th><th>Qty</th><th>Status</th><th>Confirm</th></tr>
        </thead>
        <tbody>
          {transfers.map((t) => {
            const fromShop = shops.find((s) => s.id === t.fromShopId);
            const toShop = shops.find((s) => s.id === t.toShopId);
            const canConfirmHere = t.status === 'in_transit' && can(role, 'confirmTransfer')
              && (role === 'owner' || t.toShopId === shopId);
            return (
              <tr key={t.id}>
                <td>{t.itemSku}</td>
                <td>{fromShop?.name || t.fromShopId}</td>
                <td>{toShop?.name || t.toShopId}</td>
                <td>{t.quantity}</td>
                <td>{t.status}</td>
                <td>
                  {canConfirmHere && (
                    <>
                      <input type="number" placeholder="Qty received" style={{ width: 80 }}
                        value={confirmQty[t.id] ?? t.quantity}
                        onChange={(e) => setConfirmQty({ ...confirmQty, [t.id]: e.target.value })} />
                      <button onClick={() => handleConfirm(t.id)}>Confirm</button>
                    </>
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
