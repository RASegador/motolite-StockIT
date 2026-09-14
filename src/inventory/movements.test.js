import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { recordMovement, createRestock } from './inventoryActions';

let testEnv, adminDb;

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
    // recordMovement/createRestock are the manual "Move stock"/"Restock"
    // buttons in InventoryList.jsx, gated on stockReceive — Admin-only per
    // the "Inventory Permissions, Requests, and Receiving Workflow" spec
    // (Manager only ever touches stock through the request/receive
    // workflow). Also, `getDocs(collection(db, 'movements'))` below has no
    // `where` filter, and Firestore denies an entire unfiltered `list`
    // unless the security rule can be proven true independent of each
    // document's data — isAdmin() can, a shop-scoped Manager rule can't.
    await setDoc(doc(ctx.firestore(), 'users', 'admin1'), { role: 'admin' });
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 5, unitStock: { Piece: 5 }, units: [],
    });
  });
  adminDb = testEnv.authenticatedContext('admin1').firestore();
});

describe('recordMovement', () => {
  it('adds to loose base-unit stock on receive', async () => {
    await recordMovement(adminDb, 'item1', 'in', 3, 'Delivery');
    const item = (await getDoc(doc(adminDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(8);
    expect(item.unitStock.Piece).toBe(8);
  });

  it('deducts on issue and clamps at zero instead of going negative', async () => {
    await recordMovement(adminDb, 'item1', 'out', 20, 'Shrinkage');
    const item = (await getDoc(doc(adminDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(0);
  });

  it('writes a movement record with the shop id carried over from the item', async () => {
    await recordMovement(adminDb, 'item1', 'in', 1, 'Delivery');
    const snap = await getDocs(collection(adminDb, 'movements'));
    expect(snap.docs).toHaveLength(1);
    expect(snap.docs[0].data()).toMatchObject({ itemId: 'item1', type: 'in', qty: 1, shopId: 'shopA' });
  });
});

describe('createRestock', () => {
  it('adds stock at the given unit and logs a restock record', async () => {
    await createRestock(adminDb, {
      itemId: 'item1', quantity: 2, unitName: 'Piece', unitCost: 800, notes: 'Weekly delivery',
    });
    const item = (await getDoc(doc(adminDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7);
    const restocks = await getDocs(collection(adminDb, 'restocks'));
    expect(restocks.docs).toHaveLength(1);
    expect(restocks.docs[0].data()).toMatchObject({ itemId: 'item1', quantity: 2, shopId: 'shopA' });
  });
});
