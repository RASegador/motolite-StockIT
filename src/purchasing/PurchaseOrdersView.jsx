import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { PackagePlus } from 'lucide-react';
import { useItems } from '../inventory/useItems';
import { useSuppliers } from '../catalog/useCatalog';
import { createPurchaseOrder, receivePurchaseOrderLine, cancelPurchaseOrder } from './purchaseOrderActions';
import { currency } from '../lib/format';
import { db } from '../firebase';
import Modal from '../shared/Modal';

function usePurchaseOrders(shopId) {
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, 'purchaseOrders'), where('shopId', '==', shopId), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setOrders(snap.docs.map((d) => d.data())));
  }, [shopId]);
  return orders;
}

function NewPOModal({ shopId, items, userId, onDone }) {
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState([{ itemId: '', orderedQty: '', unitCost: '' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function setLine(idx, field, value) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLine() {
    setLines([...lines, { itemId: '', orderedQty: '', unitCost: '' }]);
  }
  function removeLine(idx) {
    setLines(lines.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const supplier = suppliers.find((s) => s.id === supplierId);
      const cleanLines = lines
        .filter((l) => l.itemId)
        .map((l) => {
          const item = items.find((it) => it.id === l.itemId);
          return { itemId: l.itemId, sku: item?.sku, name: item?.name, orderedQty: l.orderedQty, unitCost: l.unitCost || item?.unitCost || 0 };
        });
      await createPurchaseOrder(db, {
        shopId, supplierId: supplierId || null, supplierName: supplier?.name || '',
        lines: cleanLines, createdBy: userId,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Purchase Order" onClose={onDone}>
      <form onSubmit={handleSubmit} className="item-form">
        <label className="item-form-field">
          <span className="item-form-field-label">Supplier</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Supplier…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {lines.map((line, idx) => (
          <div className="item-form-unit-row" key={idx}>
            <select value={line.itemId} onChange={(e) => setLine(idx, 'itemId', e.target.value)}>
              <option value="">Item…</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
            </select>
            <input type="number" placeholder="Qty ordered" value={line.orderedQty} onChange={(e) => setLine(idx, 'orderedQty', e.target.value)} />
            <input type="number" placeholder="Unit cost" value={line.unitCost} onChange={(e) => setLine(idx, 'unitCost', e.target.value)} />
            <button type="button" className="btn-danger item-form-unit-remove" onClick={() => removeLine(idx)}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addLine}>+ Add line</button>
        {error && <p className="item-form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onDone} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create PO'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({ po, userId, onDone }) {
  const [qtyByLine, setQtyByLine] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleReceive(itemId) {
    setError('');
    setSaving(true);
    try {
      await receivePurchaseOrderLine(db, po, itemId, qtyByLine[itemId], { receivedBy: userId });
      setQtyByLine({ ...qtyByLine, [itemId]: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Receive — ${po.supplierName || 'Purchase Order'}`} onClose={onDone}>
      <table className="dashboard-shop-table">
        <thead><tr><th>Item</th><th>Ordered</th><th>Received</th><th>Receive now</th><th /></tr></thead>
        <tbody>
          {po.lines.map((line) => {
            const remaining = line.orderedQty - line.receivedQty;
            return (
              <tr key={line.itemId}>
                <td>{line.sku} — {line.name}</td><td>{line.orderedQty}</td><td>{line.receivedQty}</td>
                <td>
                  <input type="number" max={remaining} disabled={remaining <= 0}
                    value={qtyByLine[line.itemId] ?? ''} placeholder={remaining <= 0 ? 'Complete' : String(remaining)}
                    onChange={(e) => setQtyByLine({ ...qtyByLine, [line.itemId]: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="btn-secondary" disabled={saving || remaining <= 0 || !qtyByLine[line.itemId]}
                    onClick={() => handleReceive(line.itemId)}>Receive</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <p className="pos-error">{error}</p>}
      <div className="form-actions"><button className="btn-primary" onClick={onDone}>Done</button></div>
    </Modal>
  );
}

export default function PurchaseOrdersView({ role, shopId, userId }) {
  const items = useItems({ role, shopId });
  const orders = usePurchaseOrders(shopId);
  const [showNew, setShowNew] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const canCreate = role === 'admin';

  return (
    <div className="purchase-orders-view">
      <div className="inventory-toolbar">
        <h2><PackagePlus size={18} /> Purchase Orders</h2>
        {canCreate && <button className="btn-primary" onClick={() => setShowNew(true)}>New purchase order</button>}
      </div>
      <table className="dashboard-shop-table">
        <thead><tr><th>Supplier</th><th>Lines</th><th>Status</th><th>Created</th><th /></tr></thead>
        <tbody>
          {orders.map((po) => (
            <tr key={po.id}>
              <td>{po.supplierName || '—'}</td>
              <td>{po.lines.reduce((s, l) => s + l.receivedQty, 0)} / {po.lines.reduce((s, l) => s + l.orderedQty, 0)}</td>
              <td>{po.status}</td>
              <td>{new Date(po.createdAt).toLocaleDateString()}</td>
              <td>
                {po.status !== 'received' && po.status !== 'cancelled' && (
                  <button className="btn-secondary" onClick={() => setReceiving(po)}>Receive</button>
                )}
                {canCreate && po.status === 'open' && (
                  <button className="btn-danger" onClick={() => cancelPurchaseOrder(db, po.id)}>Cancel</button>
                )}
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={5} className="inventory-empty">No purchase orders yet.</td></tr>}
        </tbody>
      </table>
      {showNew && <NewPOModal shopId={shopId} items={items} userId={userId} onDone={() => setShowNew(false)} />}
      {receiving && <ReceiveModal po={receiving} userId={userId} onDone={() => setReceiving(null)} />}
    </div>
  );
}
