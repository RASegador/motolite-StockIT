// Pure data-shaping helpers for the two "public" mirror documents
// (productPublic/{itemId}, receiptsPublic/{token}) that unauthenticated
// customers reach by scanning a QR code. Kept as plain functions — no
// Firestore import — so the "which fields are safe to expose" decision is
// unit-testable without the emulator.

// Fields deliberately EXCLUDED from the public product record: unitCost,
// supplierIds, location, reorderPoint/reorderUnit, quantity/unitStock
// (stock level and sourcing aren't customer-facing), and shopId (internal).
export function buildPublicProduct(item) {
  return {
    itemId: item.id,
    name: item.name || '',
    sku: item.sku || '',
    category: item.category || '',
    barcode: item.barcode || '',
    batteryModel: item.batteryModel || '',
    voltage: item.voltage || null,
    capacity: item.capacity || '',
    warrantyMonths: item.warrantyMonths || null,
    vehicleType: item.vehicleType || '',
    sellingPrice: item.sellingPrice || 0,
  };
}

// Fields deliberately EXCLUDED from the public receipt: cashierId/email,
// per-line unitCost/lineProfit, shopId (internal ref — shopName is included
// instead), and anything about other transactions. `cancelled` starts false
// and is flipped by cancelSale() so a scanned code for a voided sale reads
// as voided rather than showing a stale "valid" receipt.
export function buildPublicReceipt(sale, shopName) {
  return {
    saleId: sale.id,
    receiptNo: sale.receiptNo,
    timestamp: sale.timestamp,
    shopName: shopName || '',
    // Firestore rejects `undefined` field values outright (the whole write
    // fails), so every field here is defaulted rather than passed through
    // raw — a line whose item is missing an optional field (e.g. no `name`)
    // must not be able to take down the entire receipt write.
    items: sale.items.map((line) => ({
      sku: line.sku || '', name: line.name || '', qty: line.qty || 0,
      unitName: line.unitName || '', unitPrice: line.unitPrice || 0, lineTotal: line.lineTotal || 0,
    })),
    subtotal: sale.subtotal,
    total: sale.total,
    paymentMethod: sale.paymentMethod || 'Cash',
    amountReceived: sale.amountReceived ?? null,
    change: sale.change ?? null,
    cancelled: false,
  };
}

export function receiptUrl(origin, token) {
  return `${origin}/r/${token}`;
}

export function productUrl(origin, itemId) {
  return `${origin}/p/${itemId}`;
}
