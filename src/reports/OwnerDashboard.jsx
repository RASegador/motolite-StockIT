import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useItems } from '../inventory/useItems';
import { useSales } from './useSales';
import { useMovementsLog } from './useMovementsLog';
import { useShops } from '../shops/useShops';
import { useUsers } from '../users/useUsers';
import { computeShopComparisonStats, filterSalesForChart, groupSalesByDate } from './dashboardStats';
import { exportSalesReportPdf, exportInventoryReportPdf } from './pdfExport';
import { currency } from '../lib/format';

export default function OwnerDashboard() {
  const items = useItems({ role: 'owner' });
  const sales = useSales({ role: 'owner' });
  const movements = useMovementsLog({ role: 'owner' });
  const shops = useShops();
  const users = useUsers();

  const { perShop, totals } = computeShopComparisonStats(items, sales, shops);

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

      <h3>Users</h3>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Shop</th></tr></thead>
        <tbody>
          {users.map((u) => {
            const shop = shops.find((s) => s.id === u.shopId);
            return <tr key={u.uid}><td>{u.fullName}</td><td>{u.role}</td><td>{shop?.name || '—'}</td></tr>;
          })}
        </tbody>
      </table>

      <h3>Activity log</h3>
      <ul className="dashboard-activity-log">
        {movements.map((m) => (
          <li key={m.id}>{new Date(m.timestamp).toLocaleString()} — {m.type === 'in' ? 'Received' : 'Issued'} {m.qty} × {m.itemId} ({m.reason})</li>
        ))}
      </ul>
    </div>
  );
}
