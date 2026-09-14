import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { productUrl } from '../lib/receipts';
import { escapeHtml } from '../lib/html';

// Renders one item's barcode to a detached <canvas> (never attached to the
// DOM — JsBarcode and canvas.toDataURL both work fine on an off-screen
// canvas) and returns a data URL, the same way BarcodeImage.jsx does for a
// single item, but without needing a mounted React component per item.
function barcodeDataUrl(value) {
  if (!value) return '';
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, value, { format: 'CODE128', height: 50, displayValue: true });
    return canvas.toDataURL('image/png');
  } catch {
    // Invalid barcode value — skip it rather than fail the whole sheet.
    return '';
  }
}

// Builds one self-contained, print-ready HTML document containing a label
// (name, SKU, barcode, QR code) for every item passed in — the batch
// counterpart to ProductCodes.jsx's single-item "Print both". Used from
// InventoryList's "Print labels" button, which passes whichever items are
// currently checked.
export async function buildLabelSheetHtml(items, origin) {
  const labels = await Promise.all(items.map(async (item) => {
    const qrValue = item.id ? productUrl(origin, item.id) : '';
    const qrDataUrl = qrValue
      ? await QRCode.toDataURL(qrValue, { width: 140, margin: 1 }).catch(() => '')
      : '';
    return { name: item.name || '', sku: item.sku || '', barcodeDataUrl: barcodeDataUrl(item.barcode), qrDataUrl };
  }));

  const cards = labels.map((l) => `
    <div class="label">
      <h3>${escapeHtml(l.name)}</h3>
      <p>${escapeHtml(l.sku)}</p>
      ${l.barcodeDataUrl ? `<img class="label-barcode" src="${l.barcodeDataUrl}" alt="Barcode" />` : ''}
      ${l.qrDataUrl ? `<img class="label-qr" src="${l.qrDataUrl}" alt="QR Code" />` : ''}
    </div>
  `).join('');

  return `
    <html><head><title>Product Labels (${labels.length})</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 16px; }
      .label-sheet { display: flex; flex-wrap: wrap; gap: 16px; }
      .label { width: 220px; text-align: center; border: 1px solid #ddd; border-radius: 6px;
        padding: 12px; page-break-inside: avoid; }
      .label h3 { margin: 0 0 4px; font-size: 13px; }
      .label p { margin: 0 0 8px; color: #666; font-size: 11px; }
      .label-barcode { display: block; margin: 0 auto 8px; max-width: 100%; }
      .label-qr { display: block; margin: 0 auto; width: 90px; height: 90px; }
      @media print { .label { border: 1px solid #ccc; } }
    </style></head>
    <body><div class="label-sheet">${cards}</div></body></html>
  `;
}

// Opens a new window, fills it with the label sheet, and triggers Print —
// same pattern as ProductCodes.jsx's handlePrint, just for many items.
export async function printLabelSheet(items, origin) {
  if (!items || items.length === 0) return;
  const html = await buildLabelSheetHtml(items, origin);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
