// tests/rules/rules.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'motolite-ims-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seedUser(uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), data);
  });
}

async function seedItem(itemId, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'items', itemId), data);
  });
}

describe('items collection shop scoping', () => {
  it('lets an owner read an item from any shop', async () => {
    await seedUser('owner1', { role: 'owner', shopId: null });
    await seedItem('item1', { sku: 'BAT-1', shopId: 'shopA', quantity: 5 });
    const ownerCtx = testEnv.authenticatedContext('owner1');
    await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'items', 'item1')));
  });

  it('lets a manager read an item from their own shop', async () => {
    await seedUser('mgrA', { role: 'manager', shopId: 'shopA' });
    await seedItem('item1', { sku: 'BAT-1', shopId: 'shopA', quantity: 5 });
    const mgrCtx = testEnv.authenticatedContext('mgrA');
    await assertSucceeds(getDoc(doc(mgrCtx.firestore(), 'items', 'item1')));
  });

  it('blocks a manager from reading another shop\'s item', async () => {
    await seedUser('mgrA', { role: 'manager', shopId: 'shopA' });
    await seedItem('item1', { sku: 'BAT-1', shopId: 'shopB', quantity: 5 });
    const mgrCtx = testEnv.authenticatedContext('mgrA');
    await assertFails(getDoc(doc(mgrCtx.firestore(), 'items', 'item1')));
  });

  it('blocks a cashier from editing price/name fields, even on their own shop\'s item', async () => {
    await seedUser('cashA', { role: 'cashier', shopId: 'shopA' });
    await seedItem('item1', { sku: 'BAT-1', shopId: 'shopA', quantity: 5, sellingPrice: 100 });
    const cashCtx = testEnv.authenticatedContext('cashA');
    await assertFails(
      updateDoc(doc(cashCtx.firestore(), 'items', 'item1'), { sellingPrice: 999 })
    );
  });

  it('lets a cashier update only quantity/unitStock on their own shop\'s item', async () => {
    await seedUser('cashA', { role: 'cashier', shopId: 'shopA' });
    await seedItem('item1', {
      sku: 'BAT-1', shopId: 'shopA', quantity: 5, unitStock: { Piece: 5 }, sellingPrice: 100,
    });
    const cashCtx = testEnv.authenticatedContext('cashA');
    await assertSucceeds(
      updateDoc(doc(cashCtx.firestore(), 'items', 'item1'), {
        quantity: 4, unitStock: { Piece: 4 },
      })
    );
  });

  it('blocks an unauthenticated user entirely', async () => {
    await seedItem('item1', { sku: 'BAT-1', shopId: 'shopA', quantity: 5 });
    const anonCtx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anonCtx.firestore(), 'items', 'item1')));
  });
});

describe('shops collection', () => {
  it('lets any signed-in user read shops', async () => {
    await seedUser('cashA', { role: 'cashier', shopId: 'shopA' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'shops', 'shopA'), { id: 'shopA', name: 'Branch A' });
    });
    const cashCtx = testEnv.authenticatedContext('cashA');
    await assertSucceeds(getDoc(doc(cashCtx.firestore(), 'shops', 'shopA')));
  });

  it('blocks a manager from creating a shop', async () => {
    await seedUser('mgrA', { role: 'manager', shopId: 'shopA' });
    const mgrCtx = testEnv.authenticatedContext('mgrA');
    await assertFails(
      setDoc(doc(mgrCtx.firestore(), 'shops', 'shopB'), { id: 'shopB', name: 'Branch B' })
    );
  });

  it('lets an owner create a shop', async () => {
    await seedUser('owner1', { role: 'owner', shopId: null });
    const ownerCtx = testEnv.authenticatedContext('owner1');
    await assertSucceeds(
      setDoc(doc(ownerCtx.firestore(), 'shops', 'shopB'), { id: 'shopB', name: 'Branch B' })
    );
  });
});

describe('users collection', () => {
  it('blocks a cashier from changing their own role', async () => {
    await seedUser('cashA', { role: 'cashier', shopId: 'shopA' });
    const cashCtx = testEnv.authenticatedContext('cashA');
    await assertFails(
      updateDoc(doc(cashCtx.firestore(), 'users', 'cashA'), { role: 'owner' })
    );
  });

  it('lets an owner change another user\'s role', async () => {
    await seedUser('owner1', { role: 'owner', shopId: null });
    await seedUser('cashA', { role: 'cashier', shopId: 'shopA' });
    const ownerCtx = testEnv.authenticatedContext('owner1');
    await assertSucceeds(
      updateDoc(doc(ownerCtx.firestore(), 'users', 'cashA'), { role: 'manager' })
    );
  });
});
