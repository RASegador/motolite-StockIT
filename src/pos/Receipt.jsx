import { useRef } from 'react';
import { Printer, Download, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { currency } from '../lib/format';
import { receiptUrl } from '../lib/receipts';
import QRCodeImage from '../barcode/QRCodeImage';

// Renders both the customer copy and the owner copy — they carry identical
// data and the same transaction QR code (scanning either one resolves to
// the same /r/<token> record), differing only in the printed copyLabel.
export default function Receipt({ sale, shopName, copyLabel = 'Customer Copy', onClose }) {
  const qrRef = useRef(null);
  const qrValue = sale.receiptToken ? receiptUrl(window.location.origin, sale.receiptToken) : '';

  function handleDownload() {
    const pdf = new jsPDF({ unit: 'pt', format: [227, 500] }); // narrow, receipt-strip proportions
    let y = 30;
    const line = (text, size = 10, gap = 16) => {
      pdf.setFontSize(size);
      pdf.text(String(text), 113, y, { align: 'center' });
      y += gap;
    };
    line(shopName || 'Motolite IMS', 13, 20);
    line(copyLabel, 9, 18);
    line(`Receipt ${sale.receiptNo}`, 10);
    line(new Date(sale.timestamp).toLocaleString(), 9, 20);
    pdf.setFontSize(9);
    sale.items.forEach((l) => {
      pdf.text(`${l.sku} x${l.qty} ${l.unitName}`, 15, y);
      pdf.text(currency(l.lineTotal), 212, y, { align: 'right' });
      y += 14;
    });
    y += 6;
    line(`Total: ${currency(sale.total)}`, 11);
    line(`Payment: ${sale.paymentMethod || 'Cash'}`, 9);
    if (sale.amountReceived != null) {
      line(`Received: ${currency(sale.amountReceived)}`, 9);
      line(`Change: ${currency(sale.change)}`, 9);
    }
    if (qrRef.current) {
      y += 6;
      pdf.addImage(qrRef.current.toDataURL('image/png'), 'PNG', 83, y, 60, 60);
    }
    pdf.save(`${sale.receiptNo}.pdf`);
  }

  return (
    <div className="receipt-modal">
      <div className="receipt">
        <button type="button" className="icon-button receipt-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <img src="/branding/motolite-logo.png" alt="Motolite" className="receipt-logo" />
        <p className="receipt-shop">{shopName || 'Motolite IMS'}</p>
        <p className="receipt-copy-label">{copyLabel}</p>
        <h3>Receipt {sale.receiptNo}</h3>
        <p className="receipt-meta">{new Date(sale.timestamp).toLocaleString()}</p>
        {sale.cashierEmail && <p className="receipt-meta">Cashier: {sale.cashierEmail}</p>}
        <table>
          <tbody>
            {sale.items.map((line, i) => (
              <tr key={i}>
                <td>{line.sku} × {line.qty} {line.unitName}<br /><span className="receipt-unit-price">{currency(line.unitPrice)} each</span></td>
                <td>{currency(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="receipt-total">Total: {currency(sale.total)}</p>
        <p className="receipt-meta">Payment method: {sale.paymentMethod || 'Cash'}</p>
        {sale.amountReceived != null && (
          <>
            <p className="receipt-meta">Received: {currency(sale.amountReceived)}</p>
            <p className="receipt-meta">Change: {currency(sale.change)}</p>
          </>
        )}
        {sale.cancelled && <p className="receipt-cancelled">VOIDED — this transaction was cancelled</p>}

        {qrValue && (
          <div className="receipt-qr">
            <QRCodeImage ref={qrRef} value={qrValue} size={110} />
            <p className="receipt-qr-hint">Scan to verify this receipt online</p>
          </div>
        )}
      </div>
      <div className="receipt-actions">
        <button type="button" className="btn-secondary" onClick={handleDownload}><Download size={14} /> Download PDF</button>
        <button type="button" className="btn-primary" onClick={() => window.print()}><Printer size={14} /> Print</button>
      </div>
    </div>
  );
}
