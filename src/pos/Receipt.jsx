import { useRef } from 'react';
import { Printer, Download, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { currency } from '../lib/format';
import { receiptUrl } from '../lib/receipts';
import QRCodeImage from '../barcode/QRCodeImage';
import Tooltip from '../shared/Tooltip';

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
    if (sale.discountAmount > 0) {
      line(`Subtotal: ${currency(sale.subtotal)}`, 9);
      line(`Discount${sale.discountType === 'percent' ? ` (${sale.discountValue}%)` : ''}: -${currency(sale.discountAmount)}`, 9);
    }
    line(`Total: ${currency(sale.total)}`, 11);
    line(`Payment: ${sale.paymentMethod || 'Cash'}`, 9);
    if (sale.amountReceived != null) {
      line(`Received: ${currency(sale.amountReceived)}`, 9);
      line(`Change: ${currency(sale.change)}`, 9);
    }
    if (sale.refundedAmount > 0) {
      y += 4;
      line(`Refunded: -${currency(sale.refundedAmount)}`, 9);
      line(`Net total: ${currency(sale.total - sale.refundedAmount)}`, 10);
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
        {/* `receipt-close` (position: absolute) goes on the Tooltip wrapper,
            not the button — Tooltip's own wrapper is position: relative, so
            putting it on the button would position the button relative to
            that wrapper instead of the .receipt panel. */}
        <Tooltip label="Close this receipt" className="receipt-close">
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </Tooltip>
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
                <td>
                  {line.sku} × {line.qty} {line.unitName}<br /><span className="receipt-unit-price">{currency(line.unitPrice)} each</span>
                  {line.serials?.length > 0 && <><br /><span className="receipt-unit-price">Serial: {line.serials.join(', ')}</span></>}
                  {line.warrantyMonths > 0 && <><br /><span className="receipt-unit-price">Warranty: {line.warrantyMonths} months</span></>}
                  {line.coreExchange && <><br /><span className="receipt-unit-price">Trade-in credit ({line.coreExchange.oldBrand || 'old unit'}): -{currency(line.coreExchange.creditAmount)}</span></>}
                </td>
                <td>{currency(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(sale.customerName || sale.customerPhone) && (
          <p className="receipt-meta">Customer: {sale.customerName}{sale.customerName && sale.customerPhone ? ' — ' : ''}{sale.customerPhone}</p>
        )}
        {sale.discountAmount > 0 && (
          <>
            <p className="receipt-meta">Subtotal: {currency(sale.subtotal)}</p>
            <p className="receipt-meta">Discount{sale.discountType === 'percent' ? ` (${sale.discountValue}%)` : ''}: -{currency(sale.discountAmount)}</p>
          </>
        )}
        <p className="receipt-total">Total: {currency(sale.total)}</p>
        <p className="receipt-meta">Payment method: {sale.paymentMethod || 'Cash'}</p>
        {sale.amountReceived != null && (
          <>
            <p className="receipt-meta">Received: {currency(sale.amountReceived)}</p>
            <p className="receipt-meta">Change: {currency(sale.change)}</p>
          </>
        )}
        {sale.cancelled && <p className="receipt-cancelled">VOIDED — this transaction was cancelled</p>}
        {!sale.cancelled && sale.refundedAmount > 0 && (
          <div className="receipt-refunds">
            <p className="receipt-refunds-title">Refunds</p>
            {(sale.refunds || []).map((r) => (
              <div key={r.id}>
                {r.items.map((ri) => (
                  <p key={ri.lineId} className="receipt-meta">{ri.sku} × {ri.qty} {ri.unitName} — -{currency(ri.amount)}</p>
                ))}
                {r.reason && <p className="receipt-meta receipt-refund-reason">Reason: {r.reason}</p>}
              </div>
            ))}
            <p className="receipt-meta">Refunded: -{currency(sale.refundedAmount)}</p>
            <p className="receipt-total">Net total: {currency(sale.total - sale.refundedAmount)}</p>
          </div>
        )}

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
