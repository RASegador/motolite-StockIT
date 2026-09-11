import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { recordMovement, createRestock } from './inventoryActions';

let testEnv, mgrDb;

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
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 5, unitStock: { Piece: 5 }, units: [],
    });
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
});

describe('recordMovement', () => {
  it('adds to loose base-unit stock on receive', async () => {
    await recordMovement(mgrDb, 'item1', 'in', 3, 'Delivery');
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(8);
    expect(item.unitStock.Piece).toBe(8);
  });

  it('deducts on issue and clamps at zero instead of going negative', async () => {
    await recordMovement(mgrDb, 'item1', 'out', 20, 'Shrinkage');
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(0);
  });

  it('writes a movement record with the shop id carried over from the item', async () => {
    await recordMovement(mgrDb, 'item1', 'in', 1, 'Delivery');
    const snap = await getDocs(collection(mgrDb, 'movements'));
    expect(snap.docs).toHaveLength(1);
    expect(snap.docs[0].data()).toMatchObject({ itemId: 'item1', type: 'in', qty: 1, shopId: 'shopA' });
  });
});

describe('createRestock', () => {
  it('adds stock at the given unit and logs a restock record', async () => {
    await createRestock(mgrDb, {
      itemId: 'item1', quantity: 2, unitName: 'Piece', unitCost: 800, notes: 'Weekly delivery',
    });
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7);
    const restocks = await getDocs(collection(mgrDb, 'restocks'));
    expect(restocks.docs).toHaveLength(1);
    expect(restocks.docs[0].data()).toMatchObject({ itemId: 'item1', quantity: 2, shopId: 'shopA' });
  });
});
