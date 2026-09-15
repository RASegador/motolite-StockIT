import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { computeItemProfitStats, topByProfit, slowMovers } from './profitReport';
import { currency } from '../lib/format';

// Same "compute on read, nothing stored" approach as restockAlerts.js —
// this is derived entirely from items/sales the caller already has loaded.
export default function ProfitSlowMoverReport({ items, sales }) {
  const [tab, setTab] = useState('top');
  const stats = useMemo(() => computeItemProfitStats(items, sales), [items, sales]);
  const top = useMemo(() => topByProfit(stats, 10), [stats]);
  const slow = useMemo(() => slowMovers(stats), [stats]);
  const rows = tab === 'top' ? top : slow;

  return (
    <div className="profit-report">
      <div className="profit-report-tabs">
        <button type="button" className={`profit-report-tab ${tab === 'top' ? 'active' : ''}`} onClick={() => setTab('top')}>
          <TrendingUp size={14} /> Top by profit
        </button>
        <button type="button" className={`profit-report-tab ${tab === 'slow' ? 'active' : ''}`} onClick={() => setTab('slow')}>
          <TrendingDown size={14} /> Slow movers ({slow.length})
        </button>
      </div>
      <table className="dashboard-shop-table">
        <thead>
          {tab === 'top' ? (
            <tr><th>Item</th><th>SKU</th><th>Units sold</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr>
          ) : (
            <tr><th>Item</th><th>SKU</th><th>Stock on hand</th><th>Last sold</th></tr>
          )}
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.itemId}>
              <td>{s.name}</td><td>{s.sku}</td>
              {tab === 'top' ? (
                <>
                  <td>{s.unitsSold}</td><td>{currency(s.revenue)}</td><td>{currency(s.profit)}</td>
                  <td>{s.marginPct != null ? `${s.marginPct.toFixed(0)}%` : '—'}</td>
                </>
              ) : (
                <>
                  <td>{s.currentStock}</td>
                  <td>{s.daysSinceLastSale != null ? `${s.daysSinceLastSale} days ago` : 'Never sold'}</td>
                </>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={tab === 'top' ? 6 : 4} className="inventory-empty">
              {tab === 'top' ? 'No sales yet.' : 'Nothing is sitting idle right now.'}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
