import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { initiateTransfer, confirmReceipt } from './transferActions';

let testEnv, mgrDb, mgrBDb;

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
    // mgrB manages the destination shop (shopB) — confirming receipt is
    // the destination shop's job per the spec, so confirmReceipt tests
    // below use mgrBDb, not mgrDb (shopA).
    await setDoc(doc(ctx.firestore(), 'users', 'mgrB'), { role: 'manager', shopId: 'shopB' });
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', name: 'Motolite N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 10, unitStock: { Piece: 10 }, units: [], reservedForReview: 0,
    });
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
  mgrBDb = testEnv.authenticatedContext('mgrB').firestore();
});

describe('initiateTransfer', () => {
  it('deducts from the source shop immediately and marks the transfer in_transit', async () => {
    const transferId = await initiateTransfer(mgrDb, {
      itemId: 'item1', fromShopId: 'shopA', toShopId: 'shopB', quantity: 4, initiatedBy: 'mgrA',
    });
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(6);
    const transfer = (await getDoc(doc(mgrDb, 'transfers', transferId))).data();
    expect(transfer).toMatchObject({ status: 'in_transit', quantity: 4, fromShopId: 'shopA', toShopId: 'shopB' });
  });

  it('refuses to transfer more than is on hand', async () => {
    await expect(initiateTransfer(mgrDb, {
      itemId: 'item1', fromShopId: 'shopA', toShopId: 'shopB', quantity: 999, initiatedBy: 'mgrA',
    })).rejects.toThrow(/not enough stock/i);
  });
});

describe('confirmReceipt', () => {
  it('creates the item at the destination shop when it does not exist there yet, on a matching-quantity confirm', async () => {
    const transferId = await initiateTransfer(mgrDb, {
      itemId: 'item1', fromShopId: 'shopA', toShopId: 'shopB', quantity: 4, initiatedBy: 'mgrA',
    });
    await confirmReceipt(mgrBDb, transferId, 4, 'mgrB');
    const destItemId = 'xfer_shopB_item1';
    const destItem = (await getDoc(doc(mgrBDb, 'items', destItemId))).data();
    expect(destItem.quantity).toBe(4);
    expect(destItem.shopId).toBe('shopB');
    expect(destItem.sku).toBe('N50');
    const transfer = (await getDoc(doc(mgrBDb, 'transfers', transferId))).data();
    expect(transfer.status).toBe('received');
  });

  it('tops up the destination item on a second transfer of the same item to the same shop', async () => {
    const t1 = await initiateTransfer(mgrDb, { itemId: 'item1', fromShopId: 'shopA', toShopId: 'shopB', quantity: 4, initiatedBy: 'mgrA' });
    await confirmReceipt(mgrBDb, t1, 4, 'mgrB');
    const t2 = await initiateTransfer(mgrDb, { itemId: 'item1', fromShopId: 'shopA', toShopId: 'shopB', quantity: 2, initiatedBy: 'mgrA' });
    await confirmReceipt(mgrBDb, t2, 2, 'mgrB');
    const destItem = (await getDoc(doc(mgrBDb, 'items', 'xfer_shopB_item1'))).data();
    expect(destItem.quantity).toBe(6);
  });

  it('marks the transfer disputed instead of trusting a mismatched confirmed quantity', async () => {
    const transferId = await initiateTransfer(mgrDb, {
      itemId: 'item1', fromShopId: 'shopA', toShopId: 'shopB', quantity: 4, initiatedBy: 'mgrA',
    });
    await confirmReceipt(mgrBDb, transferId, 3, 'mgrB'); // shipped 4, only 3 arrived
    const transfer = (await getDoc(doc(mgrBDb, 'transfers', transferId))).data();
    expect(transfer.status).toBe('disputed');
    expect(transfer.confirmedQuantity).toBe(3);
    const destSnap = await getDoc(doc(mgrBDb, 'items', 'xfer_shopB_item1'));
    expect(destSnap.exists()).toBe(false); // nothing added while disputed
  });

  it('refuses to confirm the same transfer twice', async () => {
    const transferId = await initiateTransfer(mgrDb, {
      itemId: 'item1', fromShopId: 'shopA', toShopId: 'shopB', quantity: 4, initiatedBy: 'mgrA',
    });
    await confirmReceipt(mgrBDb, transferId, 4, 'mgrB');
    await expect(confirmReceipt(mgrBDb, transferId, 4, 'mgrB')).rejects.toThrow(/already/i);
  });
});
