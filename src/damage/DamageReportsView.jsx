import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useDamageReports } from './useDamageReports';
import { useItems } from '../inventory/useItems';
import { reportDamage, approveDamage, rejectDamage } from './damageActions';
import { can } from '../lib/permissions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

const REASONS = ['damaged', 'returned', 'defective'];
const BLANK_FORM = { itemId: '', quantity: 1, reason: 'damaged' };

export default function DamageReportsView({ role, shopId, userId }) {
  const reports = useDamageReports({ role, shopId });
  const items = useItems({ role, shopId });
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [error, setError] = useState('');

  async function handleReport(e) {
    e.preventDefault();
    setError('');
    try {
      await reportDamage(db, {
        itemId: form.itemId, shopId, quantity: Number(form.quantity), reason: form.reason, reportedBy: userId,
      });
      setForm(BLANK_FORM);
      setShowAddForm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  const formDirty = JSON.stringify(form) !== JSON.stringify(BLANK_FORM);

  return (
    <div className="damage-reports-view">
      <div className="section-header-row">
        <h2><AlertTriangle size={18} /> Damaged / Returned / Defective</h2>
        {can(role, 'reportDamage') && (
          <button type="button" className="btn-primary" onClick={() => setShowAddForm(true)}><Plus size={16} /> Report damage</button>
        )}
      </div>
      {error && !showAddForm && <p className="damage-error">{error}</p>}

      {showAddForm && can(role, 'reportDamage') && (
        <Modal title="Report Damage" onClose={() => setShowAddForm(false)} dirty={formDirty}>
          <form onSubmit={handleReport} className="item-form damage-report-form">
            <div className="item-form-grid">
              <label className="item-form-field">
                <span className="item-form-field-label">Item</span>
                <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required autoFocus>
                  <option value="">Select item…</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
                </select>
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">Quantity</span>
                <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">Reason</span>
                <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                  {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Report</button>
            </div>
          </form>
        </Modal>
      )}

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
                    <div className="list-row-actions">
                      <button className="btn-danger" onClick={() => rejectDamage(db, r.id, userId)}>Reject</button>
                      <button className="btn-primary" onClick={() => approveDamage(db, r.id, userId)}>Approve</button>
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
