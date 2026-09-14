import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { completeSale, cancelSale, refundSaleItems, backfillLineIds } from './salesActions';

let testEnv, mgrDb, ownerDb;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'motolite-ims-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => testEnv.cleanup());
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', 'mgrA'), { role: 'manager', shopId: 'shopA' });
    await setDoc(doc(ctx.firestore(), 'users', 'owner1'), { role: 'owner', shopId: null });
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 10, unitStock: { Piece: 10 }, units: [],
      unitCost: 800, sellingPrice: 1000,
    });
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
  // Cancelling a sale is Admin-only per the spec's permission table (a
  // Manager gets "—" for Cancel sales, same as Cashier used to before it
  // was removed) — so the cancelSale tests below run against ownerDb
  // (role 'owner', the isAdmin() legacy alias), not mgrDb.
  ownerDb = testEnv.authenticatedContext('owner1').firestore();
});

describe('completeSale', () => {
  it('deducts stock and records a sale', async () => {
    const sale = await completeSale(
      mgrDb,
      [{ itemId: 'item1', qty: 3, unitName: 'Piece', unitPrice: 1000 }],
      5000,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    expect(sale.total).toBe(3000);
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7);
  });

  it('rejects a sale that would oversell, without deducting anything', async () => {
    await expect(completeSale(
      mgrDb,
      [{ itemId: 'item1', qty: 999, unitName: 'Piece', unitPrice: 1000 }],
      null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    )).rejects.toThrow(/not enough stock/i);
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
  });

  it('re-reads stock fresh so two sequential sales on the same item both see the latest total (no lost update)', async () => {
    await completeSale(mgrDb, [{ itemId: 'item1', qty: 4, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' });
    await completeSale(mgrDb, [{ itemId: 'item1', qty: 4, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' });
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(2); // 10 - 4 - 4, never double-counted or lost
  });
});

describe('cancelSale', () => {
  it('restores both quantity and unitStock for the exact unit sold', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 3, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    await cancelSale(ownerDb, sale);
    const item = (await getDoc(doc(ownerDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
    expect(item.unitStock.Piece).toBe(10);
  });

  it('refuses to cancel an already-cancelled sale', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 1, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    await cancelSale(ownerDb, sale);
    await expect(cancelSale(ownerDb, { ...sale, cancelled: true })).rejects.toThrow(/already cancelled/i);
  });

  it('rejects a second cancelSale call using the ORIGINAL stale sale object (race/double-click), without double-restoring stock', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 3, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    // First call succeeds and restores stock.
    await cancelSale(ownerDb, sale);
    const afterFirst = (await getDoc(doc(ownerDb, 'items', 'item1'))).data();
    expect(afterFirst.quantity).toBe(10);
    expect(afterFirst.unitStock.Piece).toBe(10);

    // Second call reuses the ORIGINAL `sale` object (as returned by
    // completeSale, before the first cancelSale ever ran) — simulating a
    // duplicate click or a second admin session that still has the stale,
    // pre-cancellation object in memory. The caller-side guard on `sale`
    // would pass (sale.cancelled is still false on this object), so this
    // only fails if the transaction re-reads the sale doc fresh.
    expect(sale.cancelled).toBe(false);
    await expect(cancelSale(ownerDb, sale)).rejects.toThrow(/already cancelled/i);

    // Stock must not have been restored a second time.
    const afterSecond = (await getDoc(doc(ownerDb, 'items', 'item1'))).data();
    expect(afterSecond.quantity).toBe(10);
    expect(afterSecond.unitStock.Piece).toBe(10);
  });
});

describe('completeSale discount', () => {
  it('applies no discount when none is given (unchanged behavior)', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 2, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    expect(sale.subtotal).toBe(2000);
    expect(sale.discountType).toBeNull();
    expect(sale.discountAmount).toBe(0);
    expect(sale.total).toBe(2000);
  });

  it('applies a percent discount, clamped to 0-100, and reduces profit by the same amount', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 2, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com', discount: { type: 'percent', value: 10 } }
    );
    expect(sale.subtotal).toBe(2000);
    expect(sale.discountType).toBe('percent');
    expect(sale.discountAmount).toBe(200);
    expect(sale.total).toBe(1800);
    // Gross profit at full price is (1000-800)*2 = 400; the 200 discount comes out of that.
    expect(sale.totalProfit).toBe(200);
  });

  it('applies a fixed discount, capped at the subtotal (never a negative total)', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 1, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com', discount: { type: 'fixed', value: 5000 } }
    );
    expect(sale.subtotal).toBe(1000);
    expect(sale.discountAmount).toBe(1000); // capped, not 5000
    expect(sale.total).toBe(0);
  });

  it('ignores a discount with no usable value', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 1, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com', discount: { type: 'percent', value: 0 } }
    );
    expect(sale.discountType).toBeNull();
    expect(sale.total).toBe(1000);
  });
});

describe('refundSaleItems', () => {
  it('restores stock, records the refund, and reduces net revenue via refundedAmount', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 4, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    const lineId = sale.items[0].lineId;
    await refundSaleItems(ownerDb, sale, [{ lineId, qty: 1 }], { refundedBy: 'owner1' });

    const item = (await getDoc(doc(ownerDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7); // 10 - 4 sold + 1 refunded

    const saleDoc = (await getDoc(doc(ownerDb, 'sales', sale.id))).data();
    expect(saleDoc.refundedAmount).toBe(1000);
    expect(saleDoc.refunds).toHaveLength(1);
    expect(saleDoc.refunds[0].items[0]).toMatchObject({ lineId, qty: 1, amount: 1000 });
  });

  it('refuses to refund more than what remains unrefunded on a line', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 2, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    const lineId = sale.items[0].lineId;
    await refundSaleItems(ownerDb, sale, [{ lineId, qty: 2 }], { refundedBy: 'owner1' });
    await expect(refundSaleItems(ownerDb, sale, [{ lineId, qty: 1 }], { refundedBy: 'owner1' }))
      .rejects.toThrow(/cannot refund more than the remaining 0/i);
  });

  it('refuses to refund a cancelled sale', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 1, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    await cancelSale(ownerDb, sale);
    await expect(refundSaleItems(ownerDb, sale, [{ lineId: sale.items[0].lineId, qty: 1 }], { refundedBy: 'owner1' }))
      .rejects.toThrow(/cancelled/i);
  });
});

describe('backfillLineIds', () => {
  it('assigns a lineId to every item on a pre-refund-era sale, without touching totals', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sales', 'oldSale1'), {
        id: 'oldSale1', receiptNo: 'ROLD1', shopId: 'shopA', total: 1000, totalProfit: 200,
        refunds: [], refundedAmount: 0, refundedProfit: 0, cancelled: false,
        items: [{ itemId: 'item1', sku: 'N50', name: 'Old Item', qty: 1, unitName: 'Piece', unitPrice: 1000, unitCost: 800 }],
      });
    });
    const oldSale = (await getDoc(doc(ownerDb, 'sales', 'oldSale1'))).data();
    expect(oldSale.items[0].lineId).toBeUndefined();

    const updated = await backfillLineIds(ownerDb, oldSale);
    expect(updated.items[0].lineId).toBeTruthy();
    expect(updated.total).toBe(1000); // untouched

    const saleDoc = (await getDoc(doc(ownerDb, 'sales', 'oldSale1'))).data();
    expect(saleDoc.items[0].lineId).toBe(updated.items[0].lineId);
  });

  it('makes a refund possible afterward, exactly like a sale that always had lineIds', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sales', 'oldSale2'), {
        id: 'oldSale2', receiptNo: 'ROLD2', shopId: 'shopA', total: 1000, totalProfit: 200,
        refunds: [], refundedAmount: 0, refundedProfit: 0, cancelled: false,
        items: [{ itemId: 'item1', sku: 'N50', name: 'Old Item', qty: 1, unitName: 'Piece', unitPrice: 1000, unitCost: 800 }],
      });
    });
    const oldSale = (await getDoc(doc(ownerDb, 'sales', 'oldSale2'))).data();
    const updated = await backfillLineIds(ownerDb, oldSale);

    await refundSaleItems(ownerDb, updated, [{ lineId: updated.items[0].lineId, qty: 1 }], { refundedBy: 'owner1' });
    const saleDoc = (await getDoc(doc(ownerDb, 'sales', 'oldSale2'))).data();
    expect(saleDoc.refundedAmount).toBe(1000);
  });

  it('is a no-op (no write, same object) when every item already has a lineId', async () => {
    const sale = await completeSale(
      mgrDb, [{ itemId: 'item1', qty: 1, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    );
    const result = await backfillLineIds(ownerDb, sale);
    expect(result).toBe(sale);
  });
});

describe('completeSale validation', () => {
  it('rejects a cart line with qty <= 0 instead of silently inflating stock', async () => {
    await expect(completeSale(
      mgrDb,
      [{ itemId: 'item1', qty: -2, unitName: 'Piece', unitPrice: 1000 }],
      null,
      { shopId: 'shopA', cashierId: 'mgrA', cashierEmail: 'cash@test.com' }
    )).rejects.toThrow(/invalid quantity/i);
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
  });
});
