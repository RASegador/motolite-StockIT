import { useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import BarcodeImage from './BarcodeImage';
import QRCodeImage from './QRCodeImage';
import { productUrl } from '../lib/receipts';

function downloadCanvas(canvas, filename) {
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Shown wherever an item's codes need to be visible: the Add/Edit Item form
// (barcode/QR are generated up front, before the item is even saved — see
// ItemForm's blankDraft()) and the read-only item detail view. The barcode
// is for inventory ID / POS scanning; the QR encodes a public product-info
// URL — different purposes, same underlying item.
export default function ProductCodes({ item }) {
  const barcodeRef = useRef(null);
  const qrRef = useRef(null);
  const qrValue = item.id ? productUrl(window.location.origin, item.id) : '';

  function handlePrint() {
    const win = window.open('', '_blank', 'width=420,height=520');
    if (!win) return;
    win.document.write(`
      <html><head><title>${item.sku || item.name || 'Product'} — Codes</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 24px; }
        h3 { margin: 0 0 4px; }
        p { margin: 0 0 16px; color: #666; font-size: 13px; }
        img { display: block; margin: 0 auto 24px; }
      </style></head><body>
        <h3>${item.name || ''}</h3>
        <p>${item.sku || ''}</p>
        <img src="${barcodeRef.current?.toDataURL('image/png') || ''}" alt="Barcode" />
        <img src="${qrRef.current?.toDataURL('image/png') || ''}" alt="QR Code" width="140" height="140" />
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="product-codes">
      <div className="product-codes-item">
        <p className="product-codes-label">Barcode <span>Inventory ID &amp; POS scanning</span></p>
        <BarcodeImage ref={barcodeRef} value={item.barcode} />
        <button type="button" className="btn-secondary" onClick={() => downloadCanvas(barcodeRef.current, `${item.sku || item.barcode || 'barcode'}.png`)}>
          <Download size={14} /> Download
        </button>
      </div>
      <div className="product-codes-item">
        <p className="product-codes-label">QR Code <span>Product info lookup</span></p>
        <QRCodeImage ref={qrRef} value={qrValue} />
        <button type="button" className="btn-secondary" onClick={() => downloadCanvas(qrRef.current, `${item.sku || item.id || 'qr'}-qr.png`)}>
          <Download size={14} /> Download
        </button>
      </div>
      <button type="button" className="btn-secondary product-codes-print" onClick={handlePrint}>
        <Printer size={14} /> Print both
      </button>
    </div>
  );
}
