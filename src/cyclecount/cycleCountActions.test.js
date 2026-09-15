import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { startCycleCount, recordCountedQty, applyCycleCount, cancelCycleCount } from './cycleCountActions';

let testEnv, mgrDb, adminDb;

const ITEM = {
  id: 'item1', sku: 'N50', name: 'Motolite N50', shopId: 'branchA', baseUnitName: 'Piece',
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
    await setDoc(doc(ctx.firestore(), 'shops', 'branchA'), { id: 'branchA', name: 'Branch A', type: 'store' });
    await setDoc(doc(ctx.firestore(), 'items', ITEM.id), ITEM);
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
  adminDb = testEnv.authenticatedContext('admin1').firestore();
});

describe('startCycleCount / recordCountedQty', () => {
  it('snapshots the system quantity and lets a Manager enter a count', async () => {
    const id = await startCycleCount(mgrDb, { shopId: 'branchA', items: [ITEM], startedBy: 'mgrA' });
    const count = (await getDoc(doc(mgrDb, 'cycleCounts', id))).data();
    expect(count.items[0]).toMatchObject({ itemId: 'item1', systemQty: 20, countedQty: null });

    const items = await recordCountedQty(mgrDb, count, 'item1', 18);
    expect(items[0].countedQty).toBe(18);
  });
});

describe('applyCycleCount', () => {
  it('adjusts item stock down to match a shortage and logs a movement', async () => {
    const id = await startCycleCount(mgrDb, { shopId: 'branchA', items: [ITEM], startedBy: 'mgrA' });
    let count = (await getDoc(doc(mgrDb, 'cycleCounts', id))).data();
    count = { ...count, items: await recordCountedQty(mgrDb, count, 'item1', 18) };

    await applyCycleCount(mgrDb, count, { appliedBy: 'mgrA' });

    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(18);
    const applied = (await getDoc(doc(mgrDb, 'cycleCounts', id))).data();
    expect(applied.status).toBe('applied');
  });

  it('leaves an uncounted line untouched', async () => {
    const secondItem = { ...ITEM, id: 'item2', sku: 'N70' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'items', 'item2'), secondItem);
    });
    const id = await startCycleCount(mgrDb, { shopId: 'branchA', items: [ITEM, secondItem], startedBy: 'mgrA' });
    let count = (await getDoc(doc(mgrDb, 'cycleCounts', id))).data();
    count = { ...count, items: await recordCountedQty(mgrDb, count, 'item1', 25) };

    await applyCycleCount(mgrDb, count, { appliedBy: 'mgrA' });

    const untouched = (await getDoc(doc(mgrDb, 'items', 'item2'))).data();
    expect(untouched.quantity).toBe(20);
  });

  it('refuses to apply a count that was already applied', async () => {
    const id = await startCycleCount(mgrDb, { shopId: 'branchA', items: [ITEM], startedBy: 'mgrA' });
    let count = (await getDoc(doc(mgrDb, 'cycleCounts', id))).data();
    count = { ...count, items: await recordCountedQty(mgrDb, count, 'item1', 18) };
    await applyCycleCount(adminDb, count, { appliedBy: 'admin1' });
    await expect(applyCycleCount(adminDb, count, { appliedBy: 'admin1' })).rejects.toThrow(/already been closed/i);
  });
});

describe('cancelCycleCount', () => {
  it('marks an open count cancelled', async () => {
    const id = await startCycleCount(mgrDb, { shopId: 'branchA', items: [ITEM], startedBy: 'mgrA' });
    await cancelCycleCount(mgrDb, id);
    const count = (await getDoc(doc(mgrDb, 'cycleCounts', id))).data();
    expect(count.status).toBe('cancelled');
  });
});
