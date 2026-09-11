import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDamageReports } from './useDamageReports';
import { useItems } from '../inventory/useItems';
import { reportDamage, approveDamage, rejectDamage } from './damageActions';
import { can } from '../lib/permissions';
import { db } from '../firebase';

const REASONS = ['damaged', 'returned', 'defective'];

export default function DamageReportsView({ role, shopId, userId }) {
  const reports = useDamageReports({ role, shopId });
  const items = useItems({ role, shopId });
  const [form, setForm] = useState({ itemId: '', quantity: 1, reason: 'damaged' });
  const [error, setError] = useState('');

  async function handleReport(e) {
    e.preventDefault();
    setError('');
    try {
      await reportDamage(db, {
        itemId: form.itemId, shopId, quantity: Number(form.quantity), reason: form.reason, reportedBy: userId,
      });
      setForm({ itemId: '', quantity: 1, reason: 'damaged' });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="damage-reports-view">
      <h2><AlertTriangle size={18} /> Damaged / Returned / Defective</h2>

      {can(role, 'reportDamage') && (
        <form onSubmit={handleReport} className="damage-report-form">
          <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required>
            <option value="">Select item…</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
          </select>
          <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit">Report</button>
        </form>
      )}
      {error && <p className="damage-error">{error}</p>}

      <table>
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const item = items.find((it) => it.id === r.itemId);
            return (
              <tr key={r.id}>
                <td>{item?.sku || r.itemId}</td>
                <td>{r.quantity}</td>
                <td>{r.reason}</td>
                <td>{r.status}</td>
                <td>
                  {r.status === 'pending' && can(role, 'approveDamage') && (
                    <>
                      <button onClick={() => approveDamage(db, r.id, userId)}>Approve</button>
                      <button onClick={() => rejectDamage(db, r.id, userId)}>Reject</button>
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
