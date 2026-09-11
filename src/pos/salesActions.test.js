import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { completeSale, cancelSale } from './salesActions';

let testEnv, cashDb, ownerDb;

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
    await setDoc(doc(ctx.firestore(), 'users', 'cashA'), { role: 'cashier', shopId: 'shopA' });
    await setDoc(doc(ctx.firestore(), 'users', 'owner1'), { role: 'owner', shopId: null });
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 10, unitStock: { Piece: 10 }, units: [],
      unitCost: 800, sellingPrice: 1000,
    });
  });
  cashDb = testEnv.authenticatedContext('cashA').firestore();
  // Cancelling a sale is Owner/Admin-only per the spec's permission table
  // (Shop Manager and Cashier both get "—" for Cancel sales) — so the
  // cancelSale tests below run against ownerDb, not cashDb.
  ownerDb = testEnv.authenticatedContext('owner1').firestore();
});

describe('completeSale', () => {
  it('deducts stock and records a sale', async () => {
    const sale = await completeSale(
      cashDb,
      [{ itemId: 'item1', qty: 3, unitName: 'Piece', unitPrice: 1000 }],
      5000,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    );
    expect(sale.total).toBe(3000);
    const item = (await getDoc(doc(cashDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7);
  });

  it('rejects a sale that would oversell, without deducting anything', async () => {
    await expect(completeSale(
      cashDb,
      [{ itemId: 'item1', qty: 999, unitName: 'Piece', unitPrice: 1000 }],
      null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    )).rejects.toThrow(/not enough stock/i);
    const item = (await getDoc(doc(cashDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
  });

  it('re-reads stock fresh so two sequential sales on the same item both see the latest total (no lost update)', async () => {
    await completeSale(cashDb, [{ itemId: 'item1', qty: 4, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' });
    await completeSale(cashDb, [{ itemId: 'item1', qty: 4, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' });
    const item = (await getDoc(doc(cashDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(2); // 10 - 4 - 4, never double-counted or lost
  });
});

describe('cancelSale', () => {
  it('restores both quantity and unitStock for the exact unit sold', async () => {
    const sale = await completeSale(
      cashDb, [{ itemId: 'item1', qty: 3, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    );
    await cancelSale(ownerDb, sale);
    const item = (await getDoc(doc(ownerDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
    expect(item.unitStock.Piece).toBe(10);
  });

  it('refuses to cancel an already-cancelled sale', async () => {
    const sale = await completeSale(
      cashDb, [{ itemId: 'item1', qty: 1, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    );
    await cancelSale(ownerDb, sale);
    await expect(cancelSale(ownerDb, { ...sale, cancelled: true })).rejects.toThrow(/already cancelled/i);
  });
});
