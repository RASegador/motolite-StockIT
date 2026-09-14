import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  createRestockRequest, approveRestockRequest, rejectRestockRequest, cancelRestockRequest,
} from './restockRequestActions';

let testEnv, mgrDb, adminDb;

const SOURCE_ITEM = {
  id: 'whItem1', sku: 'N50', name: 'Motolite N50', shopId: 'warehouseA', baseUnitName: 'Piece',
  quantity: 20, unitStock: { Piece: 20 }, units: [], reservedForReview: 0,
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
    // firestore.rules' isWarehouseShop() reads the `shops` doc for the
    // item's shopId to decide whether a non-owning Manager may read it —
    // both shop docs must actually exist or that read denies.
    await setDoc(doc(ctx.firestore(), 'shops', 'warehouseA'), { id: 'warehouseA', name: 'Warehouse A', type: 'warehouse' });
    await setDoc(doc(ctx.firestore(), 'shops', 'branchA'), { id: 'branchA', name: 'Branch A', type: 'store' });
    await setDoc(doc(ctx.firestore(), 'items', SOURCE_ITEM.id), SOURCE_ITEM);
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
  adminDb = testEnv.authenticatedContext('admin1').firestore();
});

describe('createRestockRequest', () => {
  it('creates a pending request denormalizing the item\'s sku/name, without touching any stock', async () => {
    const id = await createRestockRequest(mgrDb, {
      item: { id: 'branchItem1', sku: 'N50', name: 'Motolite N50' }, quantity: 5, requestingShopId: 'branchA', requestedBy: 'mgrA',
    });
    const request = (await getDoc(doc(mgrDb, 'restockRequests', id))).data();
    expect(request).toMatchObject({
      status: 'pending', itemSku: 'N50', itemName: 'Motolite N50', requestedQty: 5, requestingShopId: 'branchA',
    });
    const sourceItem = (await getDoc(doc(mgrDb, 'items', SOURCE_ITEM.id))).data();
    expect(sourceItem.quantity).toBe(20); // unchanged — a request never moves stock by itself
  });

  it('refuses a zero or negative quantity', async () => {
    await expect(createRestockRequest(mgrDb, {
      item: { id: 'branchItem1', sku: 'N50', name: 'Motolite N50' }, quantity: 0, requestingShopId: 'branchA', requestedBy: 'mgrA',
    })).rejects.toThrow(/greater than zero/i);
  });
});

describe('approveRestockRequest', () => {
  it('starts an outgoing transfer from the chosen source item and marks the request approved', async () => {
    const requestId = await createRestockRequest(mgrDb, {
      item: { id: 'branchItem1', sku: 'N50', name: 'Motolite N50' }, quantity: 5, requestingShopId: 'branchA', requestedBy: 'mgrA',
    });
    const transferId = await approveRestockRequest(adminDb, requestId, {
      sourceItemId: SOURCE_ITEM.id, sourceShopId: 'warehouseA', quantity: 5, approvedBy: 'admin1',
    });
    const request = (await getDoc(doc(adminDb, 'restockRequests', requestId))).data();
    expect(request.status).toBe('approved');
    expect(request.transferId).toBe(transferId);
    const transfer = (await getDoc(doc(adminDb, 'transfers', transferId))).data();
    expect(transfer).toMatchObject({ status: 'in_transit', fromShopId: 'warehouseA', toShopId: 'branchA', linkedRequestId: requestId });
    const sourceItem = (await getDoc(doc(adminDb, 'items', SOURCE_ITEM.id))).data();
    expect(sourceItem.quantity).toBe(15); // deducted immediately, same as any transfer
  });

  it('refuses to approve a request that was already reviewed', async () => {
    const requestId = await createRestockRequest(mgrDb, {
      item: { id: 'branchItem1', sku: 'N50', name: 'Motolite N50' }, quantity: 5, requestingShopId: 'branchA', requestedBy: 'mgrA',
    });
    await approveRestockRequest(adminDb, requestId, { sourceItemId: SOURCE_ITEM.id, sourceShopId: 'warehouseA', quantity: 5, approvedBy: 'admin1' });
    await expect(approveRestockRequest(adminDb, requestId, { sourceItemId: SOURCE_ITEM.id, sourceShopId: 'warehouseA', quantity: 5, approvedBy: 'admin1' }))
      .rejects.toThrow(/already been reviewed/i);
  });
});

describe('rejectRestockRequest', () => {
  it('marks a pending request rejected with a reason', async () => {
    const requestId = await createRestockRequest(mgrDb, {
      item: { id: 'branchItem1', sku: 'N50', name: 'Motolite N50' }, quantity: 5, requestingShopId: 'branchA', requestedBy: 'mgrA',
    });
    await rejectRestockRequest(adminDb, requestId, { reviewedBy: 'admin1', notes: 'Out of stock elsewhere' });
    const request = (await getDoc(doc(adminDb, 'restockRequests', requestId))).data();
    expect(request.status).toBe('rejected');
    expect(request.notes).toBe('Out of stock elsewhere');
  });
});

describe('cancelRestockRequest', () => {
  it('lets the requester withdraw their own still-pending request', async () => {
    const requestId = await createRestockRequest(mgrDb, {
      item: { id: 'branchItem1', sku: 'N50', name: 'Motolite N50' }, quantity: 5, requestingShopId: 'branchA', requestedBy: 'mgrA',
    });
    await cancelRestockRequest(mgrDb, requestId);
    const request = (await getDoc(doc(mgrDb, 'restockRequests', requestId))).data();
    expect(request.status).toBe('cancelled');
  });

  it('refuses to cancel a request that is no longer pending', async () => {
    const requestId = await createRestockRequest(mgrDb, {
      item: { id: 'branchItem1', sku: 'N50', name: 'Motolite N50' }, quantity: 5, requestingShopId: 'branchA', requestedBy: 'mgrA',
    });
    await rejectRestockRequest(adminDb, requestId, { reviewedBy: 'admin1' });
    await expect(cancelRestockRequest(mgrDb, requestId)).rejects.toThrow(/only a pending request/i);
  });
});
