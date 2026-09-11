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

  it('round-trips through the ItemForm-shaped draft without zeroing stock or ignoring markup edits', async () => {
    // Regression test for the final-review finding: ItemForm used to seed
    // its `draft` state directly from a loaded item document, which has
    // `unitStock`/`quantity`/`units[].{cost,price,factor}` (no per-unit
    // `stock` field) — not the form's input shape (`baseUnitStock`,
    // `units[].stock`). saveItem read those form-shaped fields straight off
    // the draft, found them undefined on a real document, and silently
    // recomputed stock to zero. This builds a draft via saveItem, reads the
    // doc back, adapts it into the form's shape the same way
    // ItemForm/draftFromItem does, and feeds THAT into saveItem again for
    // an edit — the "editing a document only to fix a typo" scenario.
    const itemId = await saveItem(mgrDb, {
      sku: 'N70', name: 'Motolite N70', baseUnitName: 'Piece', baseUnitStock: 12,
      units: [{ name: 'Pack', factor: 4, cost: 3200, price: 4000, stock: 3 }],
      unitCost: 800, markupType: 'percent', markupValue: 25,
    }, { shopId: 'shopA' });

    const firstSnap = await getDoc(doc(mgrDb, 'items', itemId));
    const savedDoc = firstSnap.data();
    expect(savedDoc.quantity).toBe(24); // 12 loose Pieces + 3 Packs * factor 4
    expect(savedDoc.sellingPrice).toBe(1000); // 800 * 1.25

    // Adapt the saved document into the form's input shape, exactly as
    // ItemForm's draftFromItem() does.
    const baseUnitName = savedDoc.baseUnitName || 'Piece';
    const formShapedDraft = {
      ...savedDoc,
      baseUnitStock: savedDoc.unitStock?.[baseUnitName] ?? savedDoc.quantity ?? 0,
      units: (savedDoc.units || []).map((u) => ({ ...u, stock: savedDoc.unitStock?.[u.name] ?? 0 })),
      name: 'Motolite N70 (typo fixed)', // the only thing the user actually changed
    };

    await saveItem(mgrDb, formShapedDraft, { shopId: 'shopA' });

    const secondSnap = await getDoc(doc(mgrDb, 'items', itemId));
    const updatedDoc = secondSnap.data();
    expect(updatedDoc.name).toBe('Motolite N70 (typo fixed)');
    expect(updatedDoc.quantity).toBe(24); // unchanged, not zeroed
    expect(updatedDoc.unitStock).toEqual({ Piece: 12, Pack: 3 }); // unchanged
    expect(updatedDoc.sellingPrice).toBe(1000); // markup fields unchanged -> same price
  });

  it('recomputes sellingPrice from fresh markup inputs on edit instead of always keeping the old price', async () => {
    const itemId = await saveItem(mgrDb, {
      sku: 'N50Z', name: 'Motolite N50Z', baseUnitName: 'Piece', baseUnitStock: 5, units: [],
      unitCost: 1000, markupType: 'percent', markupValue: 10,
    }, { shopId: 'shopA' });

    const firstSnap = await getDoc(doc(mgrDb, 'items', itemId));
    expect(firstSnap.data().sellingPrice).toBe(1100);

    // Simulate the user raising the markup on an edit (same form-shaped
    // draft an edit would submit).
    await saveItem(mgrDb, {
      ...firstSnap.data(),
      baseUnitStock: firstSnap.data().unitStock.Piece,
      units: [],
      markupValue: 50,
    }, { shopId: 'shopA' });

    const secondSnap = await getDoc(doc(mgrDb, 'items', itemId));
    expect(secondSnap.data().sellingPrice).toBe(1500); // 1000 * 1.5, not stuck at 1100
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
