import { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useDamageReports } from './useDamageReports';
import { useShops } from '../shops/useShops';
import { useUsers } from '../users/useUsers';
import { sendReportToWarehouse, markReportReceived, resolveReportOutcome } from './damageActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

const TYPES = ['damaged', 'returned', 'defective'];
const STATUSES = [
  'pending', 'rejected', 'approved', 'sent_to_warehouse', 'received_at_destination',
  'repaired', 'replaced', 'disposed',
];
const STATUS_LABELS = {
  pending: 'Pending', rejected: 'Rejected', approved: 'Approved',
  sent_to_warehouse: 'Sent Onward', received_at_destination: 'Received at Destination',
  repaired: 'Repaired', replaced: 'Replaced', disposed: 'Disposed',
};

function statusBadgeClass(status) {
  if (status === 'rejected') return 'status-out';
  if (['repaired', 'replaced', 'disposed'].includes(status)) return 'status-in';
  return 'status-low';
}

// Admin Dashboard's "Damaged / Returned / Defective" section — the one
// place the Owner can see every such report across every store, filter it
// down, and drive its full subsequent-movement chain (send onward /
// receive / resolve). This is deliberately separate from
// DamageReportsView.jsx (the per-store report/approve screen every
// location uses): the source store's own report+approve step happens
// there, and this section takes over once a report is 'approved',
// covering the "regardless of where the item is currently located" half
// of the spec.
export default function DamageDashboardSection({ userId: actorId }) {
  const reports = useDamageReports({ role: 'owner' });
  const shops = useShops();
  const users = useUsers();

  const [shopId, setShopId] = useState('all');
  const [itemQuery, setItemQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [userId, setUserId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [historyReport, setHistoryReport] = useState(null);

  const shopById = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]);
  const userById = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);
  function shopName(id) { return id ? (shopById.get(id)?.name || id) : '—'; }
  function userLabel(uid) { if (!uid) return '—'; const u = userById.get(uid); return u ? (u.fullName || u.username || uid) : uid; }

  const filtered = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
    return reports.filter((r) => {
      if (shopId !== 'all' && r.shopId !== shopId) return false;
      if (type !== 'all' && r.reason !== type) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (userId !== 'all' && r.reportedBy !== userId) return false;
      if (start != null && r.reportedAt < start) return false;
      if (end != null && r.reportedAt > end) return false;
      if (q && !`${r.itemSku || ''} ${r.itemName || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [reports, shopId, type, status, userId, startDate, endDate, itemQuery]);

  // Totals — summed quantity, not just report count, since "Total damaged
  // items" reads more naturally as "how many units" than "how many reports".
  const totalsByType = useMemo(() => {
    const totals = { damaged: 0, returned: 0, defective: 0 };
    reports.forEach((r) => { if (totals[r.reason] != null) totals[r.reason] += r.quantity || 0; });
    return totals;
  }, [reports]);

  const perStore = useMemo(() => {
    const byShop = new Map();
    reports.forEach((r) => {
      const key = r.shopId || '—';
      if (!byShop.has(key)) byShop.set(key, { shopId: key, damaged: 0, returned: 0, defective: 0, total: 0 });
      const row = byShop.get(key);
      if (row[r.reason] != null) row[r.reason] += r.quantity || 0;
      row.total += r.quantity || 0;
    });
    return [...byShop.values()].sort((a, b) => b.total - a.total);
  }, [reports]);

  const hasFilters = shopId !== 'all' || type !== 'all' || status !== 'all' || userId !== 'all' || startDate || endDate || itemQuery;
  function resetFilters() {
    setShopId('all'); setType('all'); setStatus('all'); setUserId('all');
    setStartDate(''); setEndDate(''); setItemQuery('');
  }

  return (
    <>
      <h3><AlertTriangle size={16} /> Damaged / Returned / Defective</h3>

      <div className="dashboard-stat-row">
        <div className="stat-tile"><span>Total damaged</span><strong>{totalsByType.damaged}</strong></div>
        <div className="stat-tile"><span>Total returned</span><strong>{totalsByType.returned}</strong></div>
        <div className="stat-tile"><span>Total defective</span><strong>{totalsByType.defective}</strong></div>
      </div>

      <h4>Affected units per store</h4>
      <table className="dashboard-shop-table">
        <thead><tr><th>Store</th><th>Damaged</th><th>Returned</th><th>Defective</th><th>Total</th></tr></thead>
        <tbody>
          {perStore.map((row) => (
            <tr key={row.shopId}>
              <td>{shopName(row.shopId)}</td><td>{row.damaged}</td><td>{row.returned}</td><td>{row.defective}</td><td>{row.total}</td>
            </tr>
          ))}
          {perStore.length === 0 && <tr><td colSpan={5} className="activity-log-empty">No damaged/returned/defective reports yet.</td></tr>}
        </tbody>
      </table>

      <div className="activity-log-filters">
        <label>
          Store
          <select value={shopId} onChange={(e) => setShopId(e.target.value)}>
            <option value="all">All stores</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          Item/SKU
          <input placeholder="Search item or SKU…" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label>
          Reporting user
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="all">All users</option>
            {users.map((u) => <option key={u.uid} value={u.uid}>{u.fullName || u.username}</option>)}
          </select>
        </label>
        <label>
          From
          <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        {hasFilters && <button type="button" className="btn-link" onClick={resetFilters}>Reset filters</button>}
      </div>

      <div className="activity-log-table-wrap">
        <table className="activity-log-table">
          <thead>
            <tr><th>Type</th><th>Item</th><th>SKU</th><th>Qty</th><th>Source Store</th><th>Status</th><th>Date reported</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.reason}</td>
                <td>{r.itemName || '—'}</td>
                <td>{r.itemSku || '—'}</td>
                <td>{r.quantity}</td>
                <td>{shopName(r.shopId)}</td>
                <td><span className={`status-badge ${statusBadgeClass(r.status)}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
                <td>{new Date(r.reportedAt).toLocaleString()}</td>
                <td><button type="button" className="btn-link" onClick={() => setHistoryReport(r)}>View history</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="activity-log-empty">No records match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {historyReport && (
        <ReportHistoryModal
          report={historyReport}
          shops={shops}
          shopName={shopName}
          userLabel={userLabel}
          actorId={actorId}
          onClose={() => setHistoryReport(null)}
        />
      )}
    </>
  );
}

// Shows the full chain a single report has been through — Original Store →
// Item/SKU → Qty → Reported By → Date/Time → Reason → Subsequent Movement →
// Current Status — and, for an Owner, the actions to advance that chain.
// `report` is a live object from the `reports` array above; each action
// below re-fetches the current doc itself (see damageActions.js), so this
// modal doesn't need its own subscription — it just closes/refreshes via
// the parent's list re-rendering on the next Firestore snapshot.
function ReportHistoryModal({ report: r, shops, shopName, userLabel, actorId, onClose }) {
  const [destinationShopId, setDestinationShopId] = useState('');
  const [outcome, setOutcome] = useState('repaired');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const destinationCandidates = shops.filter((s) => s.id !== r.shopId);

  async function run(fn) {
    setError(''); setBusy(true);
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`History — ${r.itemSku || r.itemId}`} onClose={onClose} className="damage-history-modal">
      <ul className="damage-history-list">
        <li><strong>Original store:</strong> {shopName(r.shopId)}</li>
        <li><strong>Item/SKU:</strong> {r.itemName || '—'} ({r.itemSku || '—'})</li>
        <li><strong>Quantity:</strong> {r.quantity}</li>
        <li><strong>Reported by:</strong> {userLabel(r.reportedBy)} on {new Date(r.reportedAt).toLocaleString()}</li>
        <li><strong>Reason:</strong> {r.reason}</li>
        {r.relatedReceipt && <li><strong>Related transaction/receipt:</strong> {r.relatedReceipt}</li>}
        <li><strong>Reviewed:</strong> {r.resolvedBy ? `${r.status === 'rejected' ? 'Rejected' : 'Approved'} by ${userLabel(r.resolvedBy)} on ${new Date(r.resolvedAt).toLocaleString()}` : 'Awaiting review'}</li>
        {r.sentAt && <li><strong>Sent onward:</strong> to {shopName(r.destinationShopId)} by {userLabel(r.sentBy)} on {new Date(r.sentAt).toLocaleString()}</li>}
        {r.receivedAt && <li><strong>Received at destination:</strong> by {userLabel(r.receivedBy)} on {new Date(r.receivedAt).toLocaleString()}</li>}
        {r.outcomeAt && <li><strong>Outcome:</strong> {r.outcome} by {userLabel(r.outcomeBy)} on {new Date(r.outcomeAt).toLocaleString()}{r.outcomeNotes ? ` — ${r.outcomeNotes}` : ''}</li>}
        <li><strong>Current status:</strong> {r.status}</li>
      </ul>

      {error && <p className="modal-error">{error}</p>}

      {r.status === 'approved' && (
        <div className="damage-history-action">
          <p className="item-form-shop-confirm">Send this item onward (e.g. to a warehouse) for repair, replacement, or disposal:</p>
          <div className="item-form-grid">
            <label className="item-form-field">
              <span className="item-form-field-label">Destination</span>
              <select value={destinationShopId} onChange={(e) => setDestinationShopId(e.target.value)}>
                <option value="">Select destination…</option>
                {destinationCandidates.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-primary" disabled={busy || !destinationShopId}
              onClick={() => run(() => sendReportToWarehouse(db, r.id, { destinationShopId, sentBy: actorId }))}>
              Send onward
            </button>
          </div>
        </div>
      )}

      {r.status === 'sent_to_warehouse' && (
        <div className="damage-history-action">
          <div className="form-actions">
            <button type="button" className="btn-primary" disabled={busy}
              onClick={() => run(() => markReportReceived(db, r.id, { receivedBy: actorId }))}>
              Mark received at {shopName(r.destinationShopId)}
            </button>
          </div>
        </div>
      )}

      {(r.status === 'approved' || r.status === 'received_at_destination') && (
        <div className="damage-history-action">
          <p className="item-form-shop-confirm">Record the final outcome:</p>
          <div className="item-form-grid">
            <label className="item-form-field">
              <span className="item-form-field-label">Outcome</span>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="repaired">Repaired</option>
                <option value="replaced">Replaced</option>
                <option value="disposed">Disposed</option>
              </select>
            </label>
            <label className="item-form-field">
              <span className="item-form-field-label">Notes</span>
              <input placeholder="Notes (optional)" value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-primary" disabled={busy}
              onClick={() => run(() => resolveReportOutcome(db, r.id, { outcome, resolvedBy: actorId, notes: outcomeNotes }))}>
              Resolve outcome
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
