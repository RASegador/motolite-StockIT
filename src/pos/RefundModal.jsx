import { useState } from 'react';
import { refundSaleItems } from './salesActions';
import { db } from '../firebase';
import { currency } from '../lib/format';
import Modal from '../shared/Modal';

// How much of one sale line is still eligible to come back, after
// subtracting whatever prior refunds already took from it.
function remainingQty(sale, line) {
  const refundedSoFar = (sale.refunds || []).reduce((sum, r) => {
    const match = (r.items || []).find((ri) => ri.lineId === line.lineId);
    return sum + (match ? match.qty : 0);
  }, 0);
  return line.qty - refundedSoFar;
}

export default function RefundModal({ sale, userId, onClose, onDone }) {
  const [qtyByLine, setQtyByLine] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Sales from before refund support existed have no `lineId` on their
  // items — nothing here is refundable for those, same limitation
  // refundSaleItems() itself enforces server-side.
  const lines = (sale.items || [])
    .filter((line) => line.lineId)
    .map((line) => ({ ...line, remaining: remainingQty(sale, line) }))
    .filter((line) => line.remaining > 0);

  const refundTotal = lines.reduce((s, l) => {
    const qty = Math.min(Number(qtyByLine[l.lineId]) || 0, l.remaining);
    return s + qty * l.unitPrice;
  }, 0);

  const dirty = Object.values(qtyByLine).some((v) => Number(v) > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const refundLines = lines
      .map((l) => ({ lineId: l.lineId, qty: Number(qtyByLine[l.lineId]) || 0 }))
      .filter((rl) => rl.qty > 0);
    if (refundLines.length === 0) {
      setError('Enter a quantity to refund for at least one item.');
      return;
    }
    setSaving(true);
    try {
      await refundSaleItems(db, sale, refundLines, { refundedBy: userId });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (lines.length === 0) {
    return (
      <Modal title={`Refund — ${sale.receiptNo}`} onClose={onClose} dirty={false}>
        <p>
          {sale.items?.some((l) => !l.lineId)
            ? "This sale predates refund support, so nothing on it can be refunded here."
            : 'Everything on this sale has already been refunded.'}
        </p>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Refund — ${sale.receiptNo}`} onClose={onClose} dirty={dirty}>
      <form onSubmit={handleSubmit} className="item-form">
        <p className="item-form-shop-confirm">
          Enter how many of each item are being returned — stock is restored automatically.
        </p>
        <div className="item-form-grid">
          {lines.map((l) => (
            <label key={l.lineId} className="item-form-field">
              <span className="item-form-field-label">
                {l.sku} — {l.name} ({l.remaining} {l.unitName} refundable)
              </span>
              <input
                type="number" min="0" max={l.remaining}
                value={qtyByLine[l.lineId] || ''}
                onChange={(e) => setQtyByLine({ ...qtyByLine, [l.lineId]: e.target.value })}
                placeholder="0"
              />
            </label>
          ))}
        </div>
        <p className="item-form-price-preview">Refund total: {currency(refundTotal)}</p>
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Processing…' : 'Process refund'}</button>
        </div>
      </form>
    </Modal>
  );
}
