import { useEffect, useState } from 'react';
import { refundSaleItems, backfillLineIds } from './salesActions';
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

export default function RefundModal({ sale: saleProp, userId, onClose, onDone }) {
  // Sales from before partial-refund support existed have no `lineId` on
  // their items. Rather than permanently refuse to refund those (the old
  // behavior), backfill one in on open — see salesActions.js's
  // backfillLineIds for why that's safe — and use the (possibly updated)
  // result from here on. `sale` starts as the prop and is swapped for the
  // backfilled version once/if that finishes; `backfilling` guards the rest
  // of the modal from rendering against half-migrated data in between.
  const [sale, setSale] = useState(saleProp);
  const [backfilling, setBackfilling] = useState(() => (saleProp.items || []).some((l) => !l.lineId));
  const [backfillError, setBackfillError] = useState('');
  const [qtyByLine, setQtyByLine] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!backfilling) return;
    let cancelled = false;
    backfillLineIds(db, saleProp)
      .then((updated) => { if (!cancelled) { setSale(updated); setBackfilling(false); } })
      .catch((err) => { if (!cancelled) { setBackfillError(err.message); setBackfilling(false); } });
    return () => { cancelled = true; };
    // Intentionally runs once per mount (a fresh RefundModal per sale, per
    // SalesHistory's key={s.id}-less usage) — not re-keyed on saleProp
    // identity, which can change every render if the caller doesn't memoize it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await refundSaleItems(db, sale, refundLines, { refundedBy: userId, reason: reason.trim() });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (backfilling) {
    return (
      <Modal title={`Refund — ${sale.receiptNo}`} onClose={onClose} dirty={false}>
        <p>Preparing this sale for refund…</p>
      </Modal>
    );
  }

  if (backfillError) {
    return (
      <Modal title={`Refund — ${sale.receiptNo}`} onClose={onClose} dirty={false}>
        <p className="modal-error">{backfillError}</p>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }

  if (lines.length === 0) {
    return (
      <Modal title={`Refund — ${sale.receiptNo}`} onClose={onClose} dirty={false}>
        <p>Everything on this sale has already been refunded.</p>
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
        <label className="item-form-field">
          <span className="item-form-field-label">Reason / notes (optional)</span>
          <input
            type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer changed their mind, defective unit…"
          />
        </label>
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
