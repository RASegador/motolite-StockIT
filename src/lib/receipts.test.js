import { describe, it, expect } from 'vitest';
import { buildPublicProduct, buildPublicReceipt, receiptUrl, productUrl } from './receipts';

describe('buildPublicProduct', () => {
  it('includes only customer-safe fields', () => {
    const item = {
      id: 'i1', name: 'Battery N50', sku: 'MTL-N50', category: 'Motorcycle',
      barcode: '123456789012', batteryModel: 'N50', voltage: 12, capacity: '35Ah',
      warrantyMonths: 12, vehicleType: 'Motorcycle', sellingPrice: 1500,
      unitCost: 900, supplierIds: ['s1'], location: 'Warehouse A',
      reorderPoint: 5, reorderUnit: 'Piece', quantity: 40, unitStock: { Piece: 40 },
      shopId: 'shop1',
    };
    const pub = buildPublicProduct(item);
    expect(pub).toEqual({
      itemId: 'i1', name: 'Battery N50', sku: 'MTL-N50', category: 'Motorcycle',
      barcode: '123456789012', batteryModel: 'N50', voltage: 12, capacity: '35Ah',
      warrantyMonths: 12, vehicleType: 'Motorcycle', sellingPrice: 1500,
    });
    expect(pub.unitCost).toBeUndefined();
    expect(pub.supplierIds).toBeUndefined();
    expect(pub.quantity).toBeUndefined();
    expect(pub.shopId).toBeUndefined();
  });
});

describe('buildPublicReceipt', () => {
  const sale = {
    id: 's1', receiptNo: 'R123', timestamp: 1700000000000,
    items: [{ itemId: 'i1', sku: 'MTL-N50', name: 'Battery N50', qty: 2, unitName: 'Piece', unitPrice: 1500, lineTotal: 3000, unitCost: 900, lineProfit: 1200 }],
    subtotal: 3000, total: 3000, totalCost: 1800, totalProfit: 1200,
    amountReceived: 3000, change: 0, paymentMethod: 'Cash',
    cashierId: 'u1', cashierEmail: 'cashier@example.com', shopId: 'shop1', cancelled: false,
  };

  it('includes only customer-safe fields and starts uncancelled', () => {
    const pub = buildPublicReceipt(sale, 'Main Branch');
    expect(pub).toEqual({
      saleId: 's1', receiptNo: 'R123', timestamp: 1700000000000, shopName: 'Main Branch',
      items: [{ sku: 'MTL-N50', name: 'Battery N50', qty: 2, unitName: 'Piece', unitPrice: 1500, lineTotal: 3000 }],
      subtotal: 3000, total: 3000, paymentMethod: 'Cash',
      amountReceived: 3000, change: 0, cancelled: false,
    });
    expect(pub.cashierId).toBeUndefined();
    expect(pub.cashierEmail).toBeUndefined();
    expect(pub.items[0].unitCost).toBeUndefined();
    expect(pub.items[0].lineProfit).toBeUndefined();
  });

  it('defaults paymentMethod to Cash when absent', () => {
    const pub = buildPublicReceipt({ ...sale, paymentMethod: undefined }, 'Main Branch');
    expect(pub.paymentMethod).toBe('Cash');
  });
});

describe('URL builders', () => {
  it('builds a receipt URL', () => {
    expect(receiptUrl('https://example.com', 'abc123')).toBe('https://example.com/r/abc123');
  });
  it('builds a product URL', () => {
    expect(productUrl('https://example.com', 'i1')).toBe('https://example.com/p/i1');
  });
});
