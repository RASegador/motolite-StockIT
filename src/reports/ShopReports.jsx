import { useItems } from '../inventory/useItems';
import { useSales } from './useSales';
import { exportSalesReportPdf, exportInventoryReportPdf } from './pdfExport';
import { currency } from '../lib/format';
import { itemInventoryValue } from '../lib/units';

export default function ShopReports({ shopId, shopName }) {
  const items = useItems({ role: 'manager', shopId });
  const sales = useSales({ role: 'manager', shopId });
  const activeSales = sales.filter((s) => !s.cancelled);

  const revenue = activeSales.reduce((s, sale) => s + sale.total, 0);
  const profit = activeSales.reduce((s, sale) => s + (sale.totalProfit || 0), 0);
  const inventoryValue = items.reduce((s, it) => s + itemInventoryValue(it), 0);

  return (
    <div className="shop-reports">
      <h2>{shopName} — Reports</h2>
      <div className="dashboard-stat-row">
        <div className="stat-tile"><span>Inventory value</span><strong>{currency(inventoryValue)}</strong></div>
        <div className="stat-tile"><span>Revenue</span><strong>{currency(revenue)}</strong></div>
        <div className="stat-tile"><span>Profit</span><strong>{currency(profit)}</strong></div>
      </div>
      <div className="dashboard-export-buttons">
        <button onClick={() => exportSalesReportPdf(sales, { title: `${shopName} — Sales Report` })}>Export sales PDF</button>
        <button onClick={() => exportInventoryReportPdf(items, { title: `${shopName} — Inventory Report` })}>Export inventory PDF</button>
      </div>
    </div>
  );
}
