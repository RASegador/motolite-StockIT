import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { saveItem, deleteItem } from './inventoryActions';

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
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
});

describe('saveItem', () => {
  it('creates a new item, computing quantity from the per-unit stock breakdown', async () => {
    const itemId = await saveItem(mgrDb, {
      sku: 'N50', name: 'Motolite N50', baseUnitName: 'Piece', baseUnitStock: 8,
      units: [{ name: 'Pack', factor: 4, stock: 2, cost: 3200, price: 4000 }],
      unitCost: 800, sellingPrice: 1000, markupType: 'percent', markupValue: 25,
      batteryModel: 'N50', voltage: 12, capacity: '35Ah/320CCA', warrantyMonths: 12,
      vehicleType: 'Car',
    }, { shopId: 'shopA' });

    const snap = await getDoc(doc(mgrDb, 'items', itemId));
    const data = snap.data();
    expect(data.shopId).toBe('shopA');
    expect(data.quantity).toBe(16); // 8 loose Pieces + 2 Packs * factor 4
    expect(data.unitStock).toEqual({ Piece: 8, Pack: 2 });
    expect(data.batteryModel).toBe('N50');
    expect(data.vehicleType).toBe('Car');
    expect(data.reservedForReview).toBe(0);
  });

  it('updates an existing item in place, keeping its id and shopId', async () => {
    const itemId = await saveItem(mgrDb, {
      sku: 'N50', name: 'Motolite N50', baseUnitName: 'Piece', baseUnitStock: 8, units: [],
      unitCost: 800, sellingPrice: 1000, markupType: 'percent', markupValue: 25,
    }, { shopId: 'shopA' });

    await saveItem(mgrDb, {
      id: itemId, sku: 'N50', name: 'Motolite N50 (Updated)', baseUnitName: 'Piece',
      baseUnitStock: 10, units: [], unitCost: 800, sellingPrice: 1000,
      markupType: 'percent', markupValue: 25,
    }, { shopId: 'shopA' });

    const snap = await getDoc(doc(mgrDb, 'items', itemId));
    expect(snap.data().name).toBe('Motolite N50 (Updated)');
    expect(snap.data().quantity).toBe(10);
    expect(snap.data().shopId).toBe('shopA');
  });
});

describe('deleteItem', () => {
  it('removes the item document', async () => {
    const itemId = await saveItem(mgrDb, {
      sku: 'N50', name: 'Motolite N50', baseUnitName: 'Piece', baseUnitStock: 1, units: [],
      unitCost: 800, sellingPrice: 1000, markupType: 'percent', markupValue: 25,
    }, { shopId: 'shopA' });
    await deleteItem(mgrDb, itemId);
    expect((await getDoc(doc(mgrDb, 'items', itemId))).exists()).toBe(false);
  });
});
