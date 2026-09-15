import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createPurchaseOrder, receivePurchaseOrderLine, cancelPurchaseOrder } from './purchaseOrderActions';

let testEnv, mgrDb, adminDb;

const ITEM = {
  id: 'item1', sku: 'N50', name: 'Motolite N50', shopId: 'branchA', baseUnitName: 'Piece',
  quantity: 10, unitStock: { Piece: 10 }, units: [], unitCost: 100,
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
    await setDoc(doc(ctx.firestore(), 'users', 'mgrA'), { role: 'manager', shopId: 'branchA' });
    await setDoc(doc(ctx.firestore(), 'users', 'admin1'), { role: 'admin' });
    await setDoc(doc(ctx.firestore(), 'shops', 'branchA'), { id: 'branchA', name: 'Branch A', type: 'store' });
    await setDoc(doc(ctx.firestore(), 'items', ITEM.id), ITEM);
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
  adminDb = testEnv.authenticatedContext('admin1').firestore();
});

describe('createPurchaseOrder', () => {
  it('creates an open PO and refuses to be creatable by a Manager', async () => {
    const id = await createPurchaseOrder(adminDb, {
      shopId: 'branchA', supplierId: 'sup1', supplierName: 'Acme Batteries',
      lines: [{ itemId: 'item1', sku: 'N50', name: 'Motolite N50', orderedQty: 20, unitCost: 90 }],
      createdBy: 'admin1',
    });
    const po = (await getDoc(doc(adminDb, 'purchaseOrders', id))).data();
    expect(po.status).toBe('open');
    expect(po.lines[0]).toMatchObject({ orderedQty: 20, receivedQty: 0 });

    await expect(createPurchaseOrder(mgrDb, {
      shopId: 'branchA', supplierId: 'sup1', supplierName: 'Acme Batteries',
      lines: [{ itemId: 'item1', orderedQty: 5, unitCost: 90 }], createdBy: 'mgrA',
    })).rejects.toThrow();
  });

  it('refuses a PO with no positive-quantity lines', async () => {
    await expect(createPurchaseOrder(adminDb, {
      shopId: 'branchA', supplierId: 'sup1', lines: [{ itemId: 'item1', orderedQty: 0 }], createdBy: 'admin1',
    })).rejects.toThrow(/at least one line/i);
  });
});

describe('receivePurchaseOrderLine', () => {
  it('lets a Manager at the destination shop book a partial receipt, crediting stock and cost', async () => {
    const id = await createPurchaseOrder(adminDb, {
      shopId: 'branchA', supplierId: 'sup1', supplierName: 'Acme Batteries',
      lines: [{ itemId: 'item1', sku: 'N50', name: 'Motolite N50', orderedQty: 20, unitCost: 90 }],
      createdBy: 'admin1',
    });
    const po = (await getDoc(doc(adminDb, 'purchaseOrders', id))).data();

    await receivePurchaseOrderLine(mgrDb, po, 'item1', 12, { receivedBy: 'mgrA' });

    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(22);
    expect(item.unitCost).toBe(90);
    const updated = (await getDoc(doc(mgrDb, 'purchaseOrders', id))).data();
    expect(updated.status).toBe('partial');
    expect(updated.lines[0].receivedQty).toBe(12);
  });

  it('marks the PO fully received once every line is complete', async () => {
    const id = await createPurchaseOrder(adminDb, {
      shopId: 'branchA', supplierId: 'sup1',
      lines: [{ itemId: 'item1', orderedQty: 10, unitCost: 90 }], createdBy: 'admin1',
    });
    let po = (await getDoc(doc(adminDb, 'purchaseOrders', id))).data();
    await receivePurchaseOrderLine(adminDb, po, 'item1', 10, { receivedBy: 'admin1' });
    const updated = (await getDoc(doc(adminDb, 'purchaseOrders', id))).data();
    expect(updated.status).toBe('received');
  });

  it('refuses to receive more than what remains on order', async () => {
    const id = await createPurchaseOrder(adminDb, {
      shopId: 'branchA', supplierId: 'sup1',
      lines: [{ itemId: 'item1', orderedQty: 10, unitCost: 90 }], createdBy: 'admin1',
    });
    const po = (await getDoc(doc(adminDb, 'purchaseOrders', id))).data();
    await expect(receivePurchaseOrderLine(adminDb, po, 'item1', 15, { receivedBy: 'admin1' }))
      .rejects.toThrow(/cannot receive more/i);
  });
});

describe('cancelPurchaseOrder', () => {
  it('cancels an open PO', async () => {
    const id = await createPurchaseOrder(adminDb, {
      shopId: 'branchA', supplierId: 'sup1',
      lines: [{ itemId: 'item1', orderedQty: 10, unitCost: 90 }], createdBy: 'admin1',
    });
    await cancelPurchaseOrder(adminDb, id);
    const po = (await getDoc(doc(adminDb, 'purchaseOrders', id))).data();
    expect(po.status).toBe('cancelled');
  });
});
