import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { addStockDirectly } from './manualStockActions';

let testEnv, adminDb;

const WAREHOUSE_ITEM = {
  id: 'whItem1', sku: 'N50', name: 'Motolite N50', category: 'Batteries', shopId: 'warehouseA',
  baseUnitName: 'Piece', quantity: 20, unitStock: { Piece: 20 }, units: [], reservedForReview: 0,
  unitCost: 1000, sellingPrice: 1250, supplierIds: [],
};

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
    await setDoc(doc(ctx.firestore(), 'users', 'admin1'), { role: 'admin' });
    await setDoc(doc(ctx.firestore(), 'items', WAREHOUSE_ITEM.id), WAREHOUSE_ITEM);
  });
  adminDb = testEnv.authenticatedContext('admin1').firestore();
});

describe('addStockDirectly', () => {
  it('creates the item at a different shop, crediting the deterministic transfer-style doc id — never a second doc for the same SKU', async () => {
    await addStockDirectly(adminDb, { shopId: 'branchA', sourceItem: WAREHOUSE_ITEM, quantity: 5, actorId: 'admin1' });
    const destId = 'xfer_branchA_whItem1';
    const dest = (await getDoc(doc(adminDb, 'items', destId))).data();
    expect(dest.quantity).toBe(5);
    expect(dest.shopId).toBe('branchA');
    expect(dest.sku).toBe('N50');
    // The source warehouse item itself is untouched — this is a credit at
    // the destination, not a move/deduction from the warehouse.
    const source = (await getDoc(doc(adminDb, 'items', WAREHOUSE_ITEM.id))).data();
    expect(source.quantity).toBe(20);
  });

  it('tops up the same destination item on a second call instead of creating a duplicate', async () => {
    await addStockDirectly(adminDb, { shopId: 'branchA', sourceItem: WAREHOUSE_ITEM, quantity: 5, actorId: 'admin1' });
    await addStockDirectly(adminDb, { shopId: 'branchA', sourceItem: WAREHOUSE_ITEM, quantity: 3, actorId: 'admin1' });
    const dest = (await getDoc(doc(adminDb, 'items', 'xfer_branchA_whItem1'))).data();
    expect(dest.quantity).toBe(8);
  });

  it('adds directly to the source item itself when the target shop IS the item\'s own shop', async () => {
    await addStockDirectly(adminDb, { shopId: 'warehouseA', sourceItem: WAREHOUSE_ITEM, quantity: 10, actorId: 'admin1' });
    const source = (await getDoc(doc(adminDb, 'items', WAREHOUSE_ITEM.id))).data();
    expect(source.quantity).toBe(30);
    // No deterministic xfer_ doc should exist for this same-shop case.
    const strayDoc = await getDoc(doc(adminDb, 'items', 'xfer_warehouseA_whItem1'));
    expect(strayDoc.exists()).toBe(false);
  });

  it('writes a movement record tagged inventory_adjusted for traceability', async () => {
    await addStockDirectly(adminDb, { shopId: 'branchA', sourceItem: WAREHOUSE_ITEM, quantity: 5, notes: 'initial load', actorId: 'admin1' });
    const movementsSnap = await getDocs(query(collection(adminDb, 'movements'), where('shopId', '==', 'branchA')));
    expect(movementsSnap.size).toBe(1);
    const movement = movementsSnap.docs[0].data();
    expect(movement).toMatchObject({
      type: 'in', qty: 5, activityType: 'inventory_adjusted', actorId: 'admin1', previousQuantity: 0, newQuantity: 5,
    });
    expect(movement.reason).toMatch(/manual stock entry/i);
    expect(movement.reason).toMatch(/initial load/);
  });

  it('refuses a zero or negative quantity', async () => {
    await expect(addStockDirectly(adminDb, { shopId: 'branchA', sourceItem: WAREHOUSE_ITEM, quantity: 0, actorId: 'admin1' }))
      .rejects.toThrow(/greater than zero/i);
  });

  it('refuses when no shop is given', async () => {
    await expect(addStockDirectly(adminDb, { shopId: '', sourceItem: WAREHOUSE_ITEM, quantity: 5, actorId: 'admin1' }))
      .rejects.toThrow(/select a shop/i);
  });
});
