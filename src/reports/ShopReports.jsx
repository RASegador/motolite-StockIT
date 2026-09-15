import { useMemo } from 'react';
import { useItems } from '../inventory/useItems';
import { useSales } from './useSales';
import { exportSalesReportPdf, exportInventoryReportPdf } from './pdfExport';
import { currency } from '../lib/format';
import { itemInventoryValue } from '../lib/units';
import { netRevenue, netProfit } from '../lib/salesMath';
import { computeRestockAlerts } from '../restock/restockAlerts';
import LowStockDigest from './LowStockDigest';
import ProfitSlowMoverReport from './ProfitSlowMoverReport';

export default function ShopReports({ shopId, shopName }) {
  const items = useItems({ role: 'manager', shopId });
  const sales = useSales({ role: 'manager', shopId });
  const activeSales = sales.filter((s) => !s.cancelled);

  // Net of any partial refunds — see src/lib/salesMath.js.
  const revenue = activeSales.reduce((s, sale) => s + netRevenue(sale), 0);
  const profit = activeSales.reduce((s, sale) => s + netProfit(sale), 0);
  const inventoryValue = items.reduce((s, it) => s + itemInventoryValue(it), 0);
  // Manager's own dashboard previously had no low-stock visibility at all
  // (unlike the Admin dashboard, which already lists alerts further down
  // the page) — a Manager only ever saw this by separately opening
  // Restock. `computeRestockAlerts` only needs a shops list to resolve a
  // name, so a single-shop stub is enough here.
  const lowStockAlerts = useMemo(
    () => computeRestockAlerts(items, [{ id: shopId, name: shopName }]),
    [items, shopId, shopName]
  );

  return (
    <div className="shop-reports">
      <h2>{shopName} — Reports</h2>
      <LowStockDigest alerts={lowStockAlerts} scopeKey={`shop:${shopId}`} />
      <div className="dashboard-stat-row">
        <div className="stat-tile"><span>Inventory value</span><strong>{currency(inventoryValue)}</strong></div>
        <div className="stat-tile"><span>Revenue</span><strong>{currency(revenue)}</strong></div>
        <div className="stat-tile"><span>Profit</span><strong>{currency(profit)}</strong></div>
      </div>
      <div className="dashboard-export-buttons">
        <button onClick={() => exportSalesReportPdf(sales, { title: `${shopName} — Sales Report` })}>Export sales PDF</button>
        <button onClick={() => exportInventoryReportPdf(items, { title: `${shopName} — Inventory Report` })}>Export inventory PDF</button>
      </div>

      <h3>Profit &amp; slow movers</h3>
      <ProfitSlowMoverReport items={items} sales={sales} />
    </div>
  );
}
