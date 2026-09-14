// One-time (safely re-runnable) script to seed placeholder/demo data — a
// warehouse, two stores, a few categories/suppliers, a handful of
// realistic warehouse items (including a couple already below their
// reorder point, so the Restock section's Low-stock alerts table has
// something to show), and two sample pending Restock Requests — so the
// Inventory and Restock sections have something to look at right away
// instead of being empty on a fresh install.
//
// Uses the same service-account.json as scripts/create-owner.js (Firebase
// Console -> Project Settings -> Service Accounts -> Generate new private
// key), saved locally as service-account.json (already gitignored).
//
// Usage: node scripts/seed-demo-data.js
//
// Safe to re-run: every document here uses a fixed `seed-*` id and is only
// ever created if it doesn't already exist — re-running never overwrites
// quantities you've since changed in the app, and never creates
// duplicates. To remove all of it later, delete every document whose id
// starts with `seed-` from the shops/categories/suppliers/items/
// productPublic/restockRequests collections (Firestore Console, or a
// follow-up script) — nothing else in the app depends on that prefix.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { generateSku } from '../src/lib/sku.js';
import { generateBarcode } from '../src/lib/barcode.js';
import { computeSellingPrice } from '../src/lib/pricing.js';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function ensureDoc(collection, id, data) {
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`Skipped ${collection}/${id} (already exists)`);
    return false;
  }
  await ref.set(data);
  console.log(`Created ${collection}/${id}`);
  return true;
}

const WAREHOUSE_ID = 'seed-warehouse-main';
const BRANCH_A_ID = 'seed-branch-a';
const BRANCH_B_ID = 'seed-branch-b';

const CATEGORIES = ['Motorcycle Batteries', 'Automotive Batteries', 'Chargers & Accessories'];
const SUPPLIERS = ['Motolite Distributors Inc.', 'PowerCell Supply Co.'];

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// `qty` deliberately sits below `reorderPoint` for two of these, on
// purpose — that's what makes them show up in the Restock section's
// Low-stock alerts table right away.
const ITEMS = [
  { key: 'mf-100', name: 'Motolite MF100 Motorcycle Battery', category: 'Motorcycle Batteries', supplier: 'Motolite Distributors Inc.', battery: 'MF100', voltage: 12, capacity: '3.5Ah', qty: 4, reorderPoint: 10, cost: 850 },
  { key: 'mf-9', name: 'Motolite MF9 Motorcycle Battery', category: 'Motorcycle Batteries', supplier: 'Motolite Distributors Inc.', battery: 'MF9', voltage: 12, capacity: '9Ah', qty: 45, reorderPoint: 15, cost: 1200 },
  { key: 'ns40', name: 'Motolite NS40 Car Battery', category: 'Automotive Batteries', supplier: 'Motolite Distributors Inc.', battery: 'NS40', voltage: 12, capacity: '35Ah', qty: 22, reorderPoint: 8, cost: 3200 },
  { key: 'ns60', name: 'Motolite NS60 Car Battery', category: 'Automotive Batteries', supplier: 'Motolite Distributors Inc.', battery: 'NS60', voltage: 12, capacity: '45Ah', qty: 3, reorderPoint: 10, cost: 3800 },
  { key: 'n70', name: 'Motolite N70 Truck Battery', category: 'Automotive Batteries', supplier: 'PowerCell Supply Co.', battery: 'N70', voltage: 12, capacity: '65Ah', qty: 12, reorderPoint: 5, cost: 5200 },
  { key: 'gtz5s', name: 'Motolite GTZ5S Motorcycle Battery', category: 'Motorcycle Batteries', supplier: 'PowerCell Supply Co.', battery: 'GTZ5S', voltage: 12, capacity: '3.5Ah', qty: 60, reorderPoint: 20, cost: 900 },
  { key: 'charger-12v', name: '12V Smart Battery Charger', category: 'Chargers & Accessories', supplier: 'PowerCell Supply Co.', battery: '', voltage: 12, capacity: '', qty: 18, reorderPoint: 6, cost: 650 },
  { key: 'terminal-kit', name: 'Battery Terminal Cleaning Kit', category: 'Chargers & Accessories', supplier: 'PowerCell Supply Co.', battery: '', voltage: 0, capacity: '', qty: 30, reorderPoint: 10, cost: 120 },
];

async function main() {
  await ensureDoc('shops', WAREHOUSE_ID, { id: WAREHOUSE_ID, name: 'Central Warehouse', type: 'warehouse', createdAt: Date.now() });
  await ensureDoc('shops', BRANCH_A_ID, { id: BRANCH_A_ID, name: 'Branch A', type: 'store', createdAt: Date.now() });
  await ensureDoc('shops', BRANCH_B_ID, { id: BRANCH_B_ID, name: 'Branch B', type: 'store', createdAt: Date.now() });

  for (const name of CATEGORIES) {
    const id = `seed-cat-${slug(name)}`;
    await ensureDoc('categories', id, { id, name });
  }

  const supplierIdByName = {};
  for (const name of SUPPLIERS) {
    const id = `seed-sup-${slug(name)}`;
    supplierIdByName[name] = id;
    await ensureDoc('suppliers', id, { id, name, contact: '' });
  }

  for (const it of ITEMS) {
    const id = `seed-item-${it.key}`;
    const sku = generateSku(id);
    const barcode = generateBarcode(id);
    const sellingPrice = computeSellingPrice(it.cost, 'percent', 25);
    const itemDoc = {
      id, sku, barcode, name: it.name, category: it.category, location: '',
      supplierIds: [supplierIdByName[it.supplier]], shopId: WAREHOUSE_ID,
      baseUnitName: 'Piece', unitStock: { Piece: it.qty }, units: [],
      quantity: it.qty, reservedForReview: 0,
      unitCost: it.cost, markupType: 'percent', markupValue: 25, sellingPrice,
      batteryModel: it.battery, voltage: it.voltage, capacity: it.capacity,
      warrantyMonths: 12, vehicleType: '', reorderPoint: it.reorderPoint, reorderUnit: 'Piece',
    };
    const created = await ensureDoc('items', id, itemDoc);
    if (created) {
      await ensureDoc('productPublic', id, {
        id, sku, barcode, name: it.name, category: it.category,
        batteryModel: it.battery, voltage: it.voltage, capacity: it.capacity,
        warrantyMonths: 12, sellingPrice,
      });
    }
  }

  // Two sample pending Restock Requests, from each store, so the Requests
  // table isn't empty either — open the Restock screen as Admin and you
  // can Approve & Ship one right away to see the rest of the workflow.
  await ensureDoc('restockRequests', 'seed-req-branch-a-ns60', {
    id: 'seed-req-branch-a-ns60', itemId: 'seed-item-ns60', itemSku: generateSku('seed-item-ns60'), itemName: 'Motolite NS60 Car Battery',
    requestedQty: 10, requestingShopId: BRANCH_A_ID, requestedBy: '', notes: 'Sample placeholder request',
    status: 'pending', createdAt: Date.now(), reviewedBy: null, reviewedAt: null, transferId: null, fulfilledAt: null,
  });
  await ensureDoc('restockRequests', 'seed-req-branch-b-mf100', {
    id: 'seed-req-branch-b-mf100', itemId: 'seed-item-mf-100', itemSku: generateSku('seed-item-mf-100'), itemName: 'Motolite MF100 Motorcycle Battery',
    requestedQty: 20, requestingShopId: BRANCH_B_ID, requestedBy: '', notes: 'Sample placeholder request',
    status: 'pending', createdAt: Date.now(), reviewedBy: null, reviewedAt: null, transferId: null, fulfilledAt: null,
  });

  console.log('\nDone. Sign in as Admin and check Inventory (warehouse items) and Restock (low-stock alerts + requests).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
