import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, XCircle } from 'lucide-react';
import { db } from '../firebase';
import { currency } from '../lib/format';

// Reached by scanning a receipt's transaction QR code (customer or owner
// copy — they carry the same code). No login: reads only the curated
// `receiptsPublic/{token}` mirror (see buildPublicReceipt), which never
// contains cashier identity, cost, or profit. The token itself is a random
// 128-bit value (see generateSecureToken), not the sale's internal ID, so
// it can't be guessed or enumerated, and the record is entirely read-only
// from here — there is no write path a customer could reach.
export default function PublicReceiptView({ token }) {
  const [state, setState] = useState({ loading: true, receipt: null });

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'receiptsPublic', token))
      .then((snap) => {
        if (cancelled) return;
        setState({ loading: false, receipt: snap.exists() ? snap.data() : null });
      })
      .catch(() => !cancelled && setState({ loading: false, receipt: null }));
    return () => { cancelled = true; };
  }, [token]);

  if (state.loading) return <div className="public-page public-page-loading">Loading receipt…</div>;
  if (!state.receipt) {
    return (
      <div className="public-page public-page-error">
        <h2>Receipt not found</h2>
        <p>This QR code doesn't match any transaction we have on file.</p>
      </div>
    );
  }

  const r = state.receipt;
  return (
    <div className="public-page">
      <div className="public-card">
        {r.cancelled ? (
          <p className="public-card-status public-card-status-voided"><XCircle size={16} /> Voided transaction</p>
        ) : (
          <p className="public-card-status public-card-status-valid"><ShieldCheck size={16} /> Verified transaction</p>
        )}
        <h1>Receipt {r.receiptNo}</h1>
        <p className="public-card-sku">{r.shopName}</p>
        <p className="public-card-sku">{new Date(r.timestamp).toLocaleString()}</p>

        <table className="public-receipt-table">
          <tbody>
            {r.items.map((line, i) => (
              <tr key={i}>
                <td>{line.sku} × {line.qty} {line.unitName}</td>
                <td>{currency(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="public-card-price">{currency(r.total)}</p>
        <dl className="public-card-specs">
          <dt>Payment method</dt><dd>{r.paymentMethod}</dd>
          {r.amountReceived != null && <><dt>Amount received</dt><dd>{currency(r.amountReceived)}</dd></>}
          {r.change != null && <><dt>Change</dt><dd>{currency(r.change)}</dd></>}
        </dl>
        <p className="public-card-footer">This page confirms your purchase matches our records. Motolite IMS.</p>
      </div>
    </div>
  );
}
