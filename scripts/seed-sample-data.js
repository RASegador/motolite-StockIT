// One-time script to seed sample data (a shop, categories, locations,
// suppliers, and a handful of realistic inventory items) so the Owner
// account has something to look at and test the POS with right away.
//
// Safe to re-run: categories/locations/suppliers/items are looked up by
// name/SKU first and skipped if they already exist, so running this twice
// won't create duplicates.
//
// Usage: node scripts/seed-sample-data.js

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { getItemUnits, totalBaseUnits } from '../src/lib/units.js';
import { computeSellingPrice } from '../src/lib/pricing.js';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function findOrCreate(collectionName, name, extraFields = {}) {
  const snap = await db.collection(collectionName).where('name', '==', name).limit(1).get();
  if (!snap.empty) return snap.docs[0].data();
  const id = newId(collectionName[0]);
  const doc = { id, name, ...extraFields };
  await db.collection(collectionName).doc(id).set(doc);
  return doc;
}

async function main() {
  // --- Shop ---
  const shopsSnap = await db.collection('shops').limit(1).get();
  let shop;
  if (!shopsSnap.empty) {
    shop = shopsSnap.docs[0].data();
    console.log(`Using existing shop: ${shop.name} (${shop.id})`);
  } else {
    const shopId = newId('shop');
    shop = { id: shopId, name: 'Main Branch', createdAt: Date.now() };
    await db.collection('shops').doc(shopId).set(shop);
    console.log(`Created shop: ${shop.name} (${shop.id})`);
  }

  // --- Categories, locations, suppliers ---
  const categories = await Promise.all(
    ['Motorcycle Batteries', 'Automotive Batteries', 'Deep Cycle / Marine'].map((n) => findOrCreate('categories', n))
  );
  const locations = await Promise.all(
    ['Front Shelf', 'Warehouse A'].map((n) => findOrCreate('locations', n))
  );
  const suppliers = await Promise.all([
    findOrCreate('suppliers', 'Motolite Distribution Center', { contact: '(02) 8555-0101' }),
    findOrCreate('suppliers', 'City Battery Supplies', { contact: '0917-555-0123' }),
  ]);
  console.log(`Categories: ${categories.map((c) => c.name).join(', ')}`);
  console.log(`Locations: ${locations.map((l) => l.name).join(', ')}`);
  console.log(`Suppliers: ${suppliers.map((s) => s.name).join(', ')}`);

  // --- Items ---
  const itemDefs = [
    {
      sku: 'MTL-N50-001', name: 'Motolite N50 Maintenance-Free', category: categories[1].name,
      location: locations[0].name, supplierIds: [suppliers[0].id],
      batteryModel: 'N50', voltage: 12, capacity: '35Ah / 320CCA', warrantyMonths: 12, vehicleType: 'Car',
      baseUnitStock: 24, unitCost: 3200, markupType: 'percent', markupValue: 25,
      reorderPoint: 5, reorderUnit: 'Piece', units: [],
    },
    {
      sku: 'MTL-N70-002', name: 'Motolite N70 Heavy Duty', category: categories[1].name,
      location: locations[1].name, supplierIds: [suppliers[0].id],
      batteryModel: 'N70', voltage: 12, capacity: '65Ah / 550CCA', warrantyMonths: 18, vehicleType: 'Truck',
      baseUnitStock: 12, unitCost: 5400, markupType: 'percent', markupValue: 22,
      reorderPoint: 3, reorderUnit: 'Piece', units: [],
    },
    {
      sku: 'MTL-NS40ZL-003', name: 'Motolite NS40ZL Motorcycle', category: categories[0].name,
      location: locations[0].name, supplierIds: [suppliers[1].id],
      batteryModel: 'NS40ZL', voltage: 12, capacity: '12Ah / 100CCA', warrantyMonths: 12, vehicleType: 'Motorcycle',
      baseUnitStock: 40, unitCost: 950, markupType: 'percent', markupValue: 30,
      reorderPoint: 10, reorderUnit: 'Piece',
      // Demonstrates the multi-unit hierarchy: this one is also sold by the Box (12 pieces).
      units: [{ name: 'Box', factor: 12, cost: 10800, price: 13680, stock: 3 }],
    },
    {
      sku: 'MTL-GTZ4V-004', name: 'Motolite GTZ4V Motorcycle (Sealed)', category: categories[0].name,
      location: locations[0].name, supplierIds: [suppliers[1].id],
      batteryModel: 'GTZ4V', voltage: 12, capacity: '3Ah / 50CCA', warrantyMonths: 6, vehicleType: 'Motorcycle',
      baseUnitStock: 30, unitCost: 620, markupType: 'percent', markupValue: 35,
      reorderPoint: 8, reorderUnit: 'Piece', units: [],
    },
    {
      sku: 'MTL-DC100-005', name: 'Motolite Deep Cycle 100Ah Marine', category: categories[2].name,
      location: locations[1].name, supplierIds: [suppliers[0].id],
      batteryModel: 'DC100', voltage: 12, capacity: '100Ah', warrantyMonths: 24, vehicleType: 'Marine',
      baseUnitStock: 6, unitCost: 8900, markupType: 'percent', markupValue: 20,
      reorderPoint: 2, reorderUnit: 'Piece', units: [],
    },
  ];

  let created = 0, skipped = 0;
  for (const def of itemDefs) {
    const existing = await db.collection('items').where('sku', '==', def.sku).limit(1).get();
    if (!existing.empty) { console.log(`Skipping ${def.sku} (already exists)`); skipped++; continue; }

    const id = newId('i');
    const baseUnitName = 'Piece';
    const unitStock = { [baseUnitName]: def.baseUnitStock };
    def.units.forEach((u) => { unitStock[u.name] = u.stock; });

    const units = getItemUnits({ ...def, baseUnitName, unitStock, unitCost: def.unitCost });
    const quantity = totalBaseUnits(unitStock, units);
    const sellingPrice = computeSellingPrice(def.unitCost, def.markupType, def.markupValue);

    await db.collection('items').doc(id).set({
      id, shopId: shop.id, sku: def.sku, name: def.name, category: def.category, location: def.location,
      supplierIds: def.supplierIds, baseUnitName, unitCost: def.unitCost,
      markupType: def.markupType, markupValue: def.markupValue, sellingPrice,
      batteryModel: def.batteryModel, voltage: def.voltage, capacity: def.capacity,
      warrantyMonths: def.warrantyMonths, vehicleType: def.vehicleType,
      reorderPoint: def.reorderPoint, reorderUnit: def.reorderUnit, barcode: def.sku,
      quantity, unitStock, reservedForReview: 0,
      units: def.units.map(({ stock, ...u }) => u),
    });
    console.log(`Created item: ${def.sku} — ${def.name} (₱${sellingPrice.toFixed(2)}, qty ${quantity})`);
    created++;
  }

  console.log(`\nDone. ${created} item(s) created, ${skipped} skipped (already existed).`);
  console.log(`Shop: ${shop.name} — sign in as Owner and everything will show under this shop (or pick it from the Owner shop dropdown).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
