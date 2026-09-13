import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useItems } from '../inventory/useItems';
import { useSales } from './useSales';
import { useMovementsLog } from './useMovementsLog';
import { useDamageReports } from '../damage/useDamageReports';
import DamageDashboardSection from '../damage/DamageDashboardSection';
import { useTransfers } from '../transfers/useTransfers';
import { useRestockRequests } from '../restock/useRestockRequests';
import { computeRestockAlerts } from '../restock/restockAlerts';
import { useShops } from '../shops/useShops';
import { useUsers } from '../users/useUsers';
import { computeShopComparisonStats, filterSalesForChart, groupSalesByDate } from './dashboardStats';
import { buildActivityFeed, activityLabel } from './activityFeed';
import { exportSalesReportPdf, exportInventoryReportPdf } from './pdfExport';
import { currency } from '../lib/format';

export default function OwnerDashboard({ userId }) {
  const items = useItems({ role: 'owner' });
  const sales = useSales({ role: 'owner' });
  const movements = useMovementsLog({ role: 'owner' });
  const damageReports = useDamageReports({ role: 'owner' });
  const transfers = useTransfers({ role: 'owner' });
  const restockRequests = useRestockRequests({ role: 'owner' });
  const shops = useShops();
  const users = useUsers();

  const { perShop, totals } = computeShopComparisonStats(items, sales, shops);

  const pendingDamageCount = damageReports.filter((r) => r.status === 'pending').length;
  const inTransitTransferCount = transfers.filter((t) => t.status === 'in_transit').length;
  const returnedCount = damageReports.filter((r) => r.reason === 'returned').length;
  const pendingRestockCount = restockRequests.filter((r) => r.status === 'pending').length;
  const lowStockAlerts = useMemo(() => computeRestockAlerts(items, shops), [items, shops]);

  const activity = useMemo(
    () => buildActivityFeed({ movements, damageReports, transfers, restockRequests }).slice(0, 20),
    [movements, damageReports, transfers, restockRequests]
  );
  const userById = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);
  const shopById = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]);
  function userLabel(uid) {
    if (!uid) return '—';
    const u = userById.get(uid);
    return u ? (u.fullName || u.username || uid) : uid;
  }
  function shopLabel(id) {
    return id ? (shopById.get(id)?.name || id) : '—';
  }

  // Sales chart filters — 'all' shops is the default, dates start unset
  // (no bound). Both combine, and the chart re-derives on every change with
  // no refetch: `sales` is already every shop's data (useSales({role:'owner'})
  // has no shopId filter), so this is a pure client-side recompute.
  const [chartShopId, setChartShopId] = useState('all');
  const [chartStartDate, setChartStartDate] = useState('');
  const [chartEndDate, setChartEndDate] = useState('');
  const salesByDate = useMemo(() => {
    const filtered = filterSalesForChart(sales, {
      shopId: chartShopId, startDate: chartStartDate || null, endDate: chartEndDate || null,
    });
    return groupSalesByDate(filtered);
  }, [sales, chartShopId, chartStartDate, chartEndDate]);

  return (
    <div className="owner-dashboard">
      <h2>All Shops Overview</h2>

      <div className="dashboard-stat-row">
        <div className="stat-tile"><span>Inventory value</span><strong>{currency(totals.inventoryValue)}</strong></div>
        <div className="stat-tile"><span>Low stock</span><strong>{totals.lowStockCount}</strong></div>
        <div className="stat-tile"><span>Out of stock</span><strong>{totals.outOfStockCount}</strong></div>
        <div className="stat-tile"><span>Revenue</span><strong>{currency(totals.revenue)}</strong></div>
        <div className="stat-tile"><span>Profit</span><strong>{currency(totals.profit)}</strong></div>
        <div className="stat-tile"><span>Pending damage reports</span><strong>{pendingDamageCount}</strong></div>
        <div className="stat-tile"><span>Returned items (all-time)</span><strong>{returnedCount}</strong></div>
        <div className="stat-tile"><span>Transfers in transit</span><strong>{inTransitTransferCount}</strong></div>
        <div className="stat-tile"><span>Pending restock requests</span><strong>{pendingRestockCount}</strong></div>
        <div className="stat-tile"><span>Low-stock alerts</span><strong>{lowStockAlerts.length}</strong></div>
      </div>

      <h3>Sales</h3>
      <div className="dashboard-chart-filters">
        <label>
          Shop
          <select value={chartShopId} onChange={(e) => setChartShopId(e.target.value)}>
            <option value="all">All Shops</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          From
          <input type="date" value={chartStartDate} max={chartEndDate || undefined}
            onChange={(e) => setChartStartDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={chartEndDate} min={chartStartDate || undefined}
            onChange={(e) => setChartEndDate(e.target.value)} />
        </label>
        {(chartShopId !== 'all' || chartStartDate || chartEndDate) && (
          <button type="button" className="btn-link"
            onClick={() => { setChartShopId('all'); setChartStartDate(''); setChartEndDate(''); }}>
            Reset filters
          </button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={salesByDate}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value) => currency(value)} />
          <Bar dataKey="revenue" fill="#c1272d" />
        </BarChart>
      </ResponsiveContainer>
      {salesByDate.length === 0 && <p className="dashboard-chart-empty">No sales match the current filters.</p>}

      <h3>Shop comparison</h3>
      <table className="dashboard-shop-table">
        <thead>
          <tr><th>Shop</th><th>Inventory value</th><th>Low stock</th><th>Out of stock</th><th>Revenue</th><th>Units sold</th><th>Profit</th></tr>
        </thead>
        <tbody>
          {perShop.map((s) => (
            <tr key={s.shopId}>
              <td>{s.shopName}</td><td>{currency(s.inventoryValue)}</td><td>{s.lowStockCount}</td>
              <td>{s.outOfStockCount}</td><td>{currency(s.revenue)}</td><td>{s.unitsSold}</td><td>{currency(s.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dashboard-export-buttons">
        <button onClick={() => exportSalesReportPdf(sales, { title: 'All Shops — Sales Report' })}>Export sales PDF</button>
        <button onClick={() => exportInventoryReportPdf(items, { title: 'All Shops — Inventory Report' })}>Export inventory PDF</button>
      </div>

      <h3>Low-stock alerts</h3>
      <p className="dashboard-activity-hint">
        Computed live from each item's own reorder point — create a Restock Request for any of these from
        the Restock section (top navigation).
      </p>
      <table className="dashboard-shop-table">
        <thead>
          <tr><th>Shop/Warehouse</th><th>Item</th><th>SKU</th><th>Current stock</th><th>Min stock</th><th>Suggested restock</th></tr>
        </thead>
        <tbody>
          {lowStockAlerts.slice(0, 15).map((a) => (
            <tr key={a.itemId}>
              <td>{a.shopName} <span className={`shop-type-badge shop-type-${a.shopType}`}>{a.shopType === 'warehouse' ? 'Warehouse' : 'Store'}</span></td>
              <td>{a.name}</td><td>{a.sku}</td><td>{a.currentStock}</td><td>{a.minStock}</td><td>{a.suggestedQty}</td>
            </tr>
          ))}
          {lowStockAlerts.length === 0 && (
            <tr><td colSpan={6} className="inventory-empty">No items are at or below their reorder point.</td></tr>
          )}
        </tbody>
      </table>

      <h3>Users</h3>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Shop</th></tr></thead>
        <tbody>
          {users.map((u) => {
            const shop = shops.find((s) => s.id === u.shopId);
            return (
              <tr key={u.uid}>
                <td>{u.fullName}</td><td>{u.role}</td>
                <td>{shop ? <>{shop.name} <span className={`shop-type-badge shop-type-${shop.type === 'warehouse' ? 'warehouse' : 'store'}`}>{shop.type === 'warehouse' ? 'Warehouse' : 'Store'}</span></> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <DamageDashboardSection userId={userId} />

      <h3>Recent activity</h3>
      <p className="dashboard-activity-hint">
        Every inventory, sales, damage/return, and transfer action across all shops — see the Activity Log
        (top navigation) for the full, filterable history.
      </p>
      <ul className="dashboard-activity-log">
        {activity.map((e) => (
          <li key={e.id}>
            {new Date(e.timestamp).toLocaleString()} — <strong>{activityLabel(e.type)}</strong>
            {' '}by {userLabel(e.userId)} at {shopLabel(e.shopIds[0])}
            {e.quantity != null && <> ({e.quantity} unit{e.quantity === 1 ? '' : 's'})</>}
          </li>
        ))}
        {activity.length === 0 && <li className="dashboard-activity-empty">No activity recorded yet.</li>}
      </ul>
    </div>
  );
}
