import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { currency } from '../lib/format';

export function exportSalesReportPdf(sales, { title = 'Sales Report' } = {}) {
  const docPdf = new jsPDF();
  docPdf.text(title, 14, 16);
  autoTable(docPdf, {
    startY: 22,
    head: [['Receipt', 'Date', 'Shop', 'Total', 'Profit', 'Status']],
    body: sales.map((s) => [
      s.receiptNo, new Date(s.timestamp).toLocaleDateString(), s.shopId,
      currency(s.total), currency(s.totalProfit || 0), s.cancelled ? 'Cancelled' : 'Completed',
    ]),
  });
  docPdf.save(`${title.replace(/\s+/g, '_')}.pdf`);
}

export function exportInventoryReportPdf(items, { title = 'Inventory Report' } = {}) {
  const docPdf = new jsPDF();
  docPdf.text(title, 14, 16);
  autoTable(docPdf, {
    startY: 22,
    head: [['SKU', 'Name', 'Model', 'Vehicle', 'Shop', 'Qty', 'Price']],
    body: items.map((it) => [
      it.sku, it.name, it.batteryModel || '', it.vehicleType || '', it.shopId,
      String(it.quantity), currency(it.sellingPrice || 0),
    ]),
  });
  docPdf.save(`${title.replace(/\s+/g, '_')}.pdf`);
}
