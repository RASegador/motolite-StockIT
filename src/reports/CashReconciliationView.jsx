import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Wallet } from 'lucide-react';
import { useSales } from './useSales';
import { computeExpectedCashByMethod, computeVariance, localDateKey } from './cashReconciliation';
import { reconciliationId, saveCashReconciliation } from './cashReconciliationActions';
import { currency } from '../lib/format';
import { db } from '../firebase';

const METHODS = ['Cash', 'GCash', 'Card', 'Other'];

// End-of-day / shift close: shows what the system expects each payment
// method to total for the day (net of refunds), lets whoever's closing out
// type in what they actually counted, and saves the variance for the
// record. This doesn't touch inventory or sales data at all — it's a
// read-and-record step, so it's safe for a Manager to run at their own shop
// without needing Admin-only write access to anything else.
export default function CashReconciliationView({ shopId, shopName, userId, userName }) {
  const [date, setDate] = useState(localDateKey(Date.now()));
  const [actualCounts, setActualCounts] = useState({});
  const [notes, setNotes] = useState('');
  const [existing, setExisting] = useState(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const sales = useSales({ role: 'manager', shopId });

  const expected = useMemo(() => computeExpectedCashByMethod(sales, shopId, date, METHODS), [sales, shopId, date]);
  const { perMethod, totalVariance } = useMemo(
    () => computeVariance(expected.breakdown, actualCounts),
    [expected, actualCounts]
  );

  // Load a prior close for this shop+date, if one already exists, so
  // re-opening today's (or a past) reconciliation shows what was recorded
  // rather than a blank form.
  useEffect(() => {
    let cancelled = false;
    setLoadingExisting(true);
    setSaved(false);
    getDoc(doc(db, 'cashReconciliations', reconciliationId(shopId, date)))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          setExisting(data);
          setActualCounts(data.actualCounts || {});
          setNotes(data.notes || '');
        } else {
          setExisting(null);
          setActualCounts({});
          setNotes('');
        }
      })
      .finally(() => { if (!cancelled) setLoadingExisting(false); });
    return () => { cancelled = true; };
  }, [shopId, date]);

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await saveCashReconciliation(db, {
        shopId, date, expected: expected.breakdown, actualCounts, variance: totalVariance,
        closedBy: userName || userId, notes,
      });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cash-reconciliation">
      <h2><Wallet size={18} /> {shopName} — Day-End Cash Count</h2>
      <label className="cash-reconciliation-date">
        Date
        <input type="date" value={date} max={localDateKey(Date.now())} onChange={(e) => setDate(e.target.value)} />
      </label>

      {loadingExisting ? (
        <p>Loading…</p>
      ) : (
        <>
          {existing && (
            <p className="cash-reconciliation-existing">
              Already closed for this date by {existing.closedBy || 'someone'} — saving again will overwrite it.
            </p>
          )}
          <table className="dashboard-shop-table">
            <thead>
              <tr><th>Method</th><th>Expected (system)</th><th>Actual count</th><th>Variance</th></tr>
            </thead>
            <tbody>
              {METHODS.map((method) => {
                const row = perMethod[method];
                return (
                  <tr key={method}>
                    <td>{method}</td>
                    <td>{currency(row.expected)}</td>
                    <td>
                      <input type="number" value={actualCounts[method] ?? ''} placeholder="0"
                        onChange={(e) => setActualCounts({ ...actualCounts, [method]: e.target.value })} />
                    </td>
                    <td className={row.variance < 0 ? 'cash-reconciliation-short' : row.variance > 0 ? 'cash-reconciliation-over' : ''}>
                      {currency(row.variance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="cash-reconciliation-total">
            {expected.saleCount} sale{expected.saleCount === 1 ? '' : 's'} today · Total variance: <strong>{currency(totalVariance)}</strong>
          </p>
          <label className="cash-reconciliation-notes">
            Notes (optional — e.g. reason for a shortage)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
          {error && <p className="pos-error">{error}</p>}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save day-end count'}
          </button>
        </>
      )}
    </div>
  );
}
