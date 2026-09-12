import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { reportDamage, approveDamage, rejectDamage } from './damageActions';

let testEnv, cashDb, mgrDb;

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
    await setDoc(doc(ctx.firestore(), 'users', 'mgrA'), { role: 'manager', shopId: 'shopA' });
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 10, unitStock: { Piece: 10 }, units: [], reservedForReview: 0,
    });
  });
  cashDb = testEnv.authenticatedContext('cashA').firestore();
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
});

describe('reportDamage', () => {
  it('reserves the reported quantity without touching sellable stock yet', async () => {
    await reportDamage(cashDb, { itemId: 'item1', shopId: 'shopA', quantity: 3, reason: 'damaged', reportedBy: 'cashA' });
    const item = (await getDoc(doc(cashDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10); // unchanged
    expect(item.reservedForReview).toBe(3);
  });

  it('refuses to reserve more than is actually sellable', async () => {
    await reportDamage(cashDb, { itemId: 'item1', shopId: 'shopA', quantity: 8, reason: 'damaged', reportedBy: 'cashA' });
    await expect(
      reportDamage(cashDb, { itemId: 'item1', shopId: 'shopA', quantity: 5, reason: 'defective', reportedBy: 'cashA' })
    ).rejects.toThrow(/not enough sellable stock/i);
  });
});

describe('approveDamage', () => {
  it('deducts stock and releases the reservation on approval', async () => {
    const reportId = await reportDamage(mgrDb, { itemId: 'item1', shopId: 'shopA', quantity: 3, reason: 'damaged', reportedBy: 'cashA' });
    await approveDamage(mgrDb, reportId, 'mgrA');
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7);
    expect(item.reservedForReview).toBe(0);
    const report = (await getDoc(doc(mgrDb, 'damageReports', reportId))).data();
    expect(report.status).toBe('approved');
  });

  it('refuses to approve the same report twice', async () => {
    const reportId = await reportDamage(mgrDb, { itemId: 'item1', shopId: 'shopA', quantity: 3, reason: 'damaged', reportedBy: 'cashA' });
    await approveDamage(mgrDb, reportId, 'mgrA');
    await expect(approveDamage(mgrDb, reportId, 'mgrA')).rejects.toThrow(/already been resolved/i);
  });
});

describe('rejectDamage', () => {
  it('releases the reservation without deducting stock', async () => {
    const reportId = await reportDamage(mgrDb, { itemId: 'item1', shopId: 'shopA', quantity: 3, reason: 'returned', reportedBy: 'cashA' });
    await rejectDamage(mgrDb, reportId, 'mgrA');
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
    expect(item.reservedForReview).toBe(0);
    const report = (await getDoc(doc(mgrDb, 'damageReports', reportId))).data();
    expect(report.status).toBe('rejected');
  });
});
