import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useMovementsLog } from './useMovementsLog';
import { useDamageReports } from '../damage/useDamageReports';
import { useTransfers } from '../transfers/useTransfers';
import { useRestockRequests } from '../restock/useRestockRequests';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { useUsers } from '../users/useUsers';
import { buildActivityFeed, filterActivityFeed, activityLabel, ACTIVITY_TYPES } from './activityFeed';

// Owner-only, system-wide audit trail — see activityFeed.js for how the
// four underlying collections (movements/damageReports/transfers, plus
// items/shops/users for name lookups only) are normalized and merged.
// Every hook below is called with `{ role: 'owner' }` deliberately, so this
// view always sees every shop regardless of which shop the Owner has
// picked as their "active shop" elsewhere in the app (that picker is only
// for screens that WRITE a shopId — see App.jsx — and has no bearing on
// what the Owner is allowed to read here).
export default function OwnerActivityLog() {
  // 500 rows is generous headroom over useMovementsLog's own 100-row
  // default — this is meant to be the comprehensive log, not a recent-N
  // preview like the one on OwnerDashboard.
  const movements = useMovementsLog({ role: 'owner' }, 500);
  const damageReports = useDamageReports({ role: 'owner' });
  const transfers = useTransfers({ role: 'owner' });
  const restockRequests = useRestockRequests({ role: 'owner' });
  const items = useItems({ role: 'owner' });
  const shops = useShops();
  const users = useUsers();

  const [shopId, setShopId] = useState('all');
  const [userId, setUserId] = useState('all');
  const [role, setRole] = useState('all');
  const [itemId, setItemId] = useState('all');
  const [type, setType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const feed = useMemo(
    () => buildActivityFeed({ movements, damageReports, transfers, restockRequests }),
    [movements, damageReports, transfers, restockRequests]
  );

  const userById = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);
  const shopById = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const roleOf = (uid) => userById.get(uid)?.role || null;

  const filtered = useMemo(
    () => filterActivityFeed(feed, { shopId, userId, role, itemId, type, startDate, endDate }, roleOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed, shopId, userId, role, itemId, type, startDate, endDate, userById]
  );

  const hasFilters = shopId !== 'all' || userId !== 'all' || role !== 'all' || itemId !== 'all' || type !== 'all' || startDate || endDate;
  function resetFilters() {
    setShopId('all'); setUserId('all'); setRole('all'); setItemId('all'); setType('all');
    setStartDate(''); setEndDate('');
  }

  function userLabel(uid) {
    if (!uid) return '—';
    const u = userById.get(uid);
    return u ? (u.fullName || u.username || uid) : uid;
  }
  function shopLabel(id) {
    if (!id) return '—';
    return shopById.get(id)?.name || id;
  }
  function itemLabel(id) {
    if (!id) return '—';
    const it = itemById.get(id);
    return it ? `${it.sku || ''} — ${it.name || ''}`.replace(/^— /, '') : id;
  }

  return (
    <div className="activity-log-view">
      <h2><ClipboardList size={18} /> Owner Activity Log</h2>

      <div className="activity-log-filters">
        <label>
          Shop
          <select value={shopId} onChange={(e) => setShopId(e.target.value)}>
            <option value="all">All locations</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type === 'warehouse' ? 'Warehouse' : 'Store'})</option>)}
          </select>
        </label>
        <label>
          User
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="all">All users</option>
            {users.map((u) => <option key={u.uid} value={u.uid}>{u.fullName || u.username}</option>)}
          </select>
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">All roles</option>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="warehouse">Warehouse</option>
          </select>
        </label>
        <label>
          Item
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="all">All items</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
          </select>
        </label>
        <label>
          Activity type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All activity</option>
            {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{activityLabel(t)}</option>)}
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
            <tr>
              <th>Date/time</th><th>User</th><th>Role</th><th>Shop</th><th>Item</th>
              <th>Action</th><th>Qty</th><th>Prev → New</th><th>Route</th><th>Reason/Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.timestamp).toLocaleString()}</td>
                <td>{userLabel(e.userId)}</td>
                <td>{roleOf(e.userId) || '—'}</td>
                <td>{shopLabel(e.shopIds[0])}</td>
                <td>{itemLabel(e.itemId)}</td>
                <td><span className={`activity-badge activity-${e.type}`}>{activityLabel(e.type)}</span></td>
                <td>{e.quantity ?? '—'}</td>
                <td>{e.previousQuantity != null && e.newQuantity != null ? `${e.previousQuantity} → ${e.newQuantity}` : '—'}</td>
                <td>{e.fromShopId || e.toShopId ? `${shopLabel(e.fromShopId)} → ${shopLabel(e.toShopId)}` : '—'}</td>
                <td>{[e.reason, e.notes].filter(Boolean).join(' — ') || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="activity-log-empty">No activity matches the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
