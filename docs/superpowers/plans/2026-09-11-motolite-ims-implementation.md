# Motolite Inventory & POS Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `motolite-ims`, a standalone React + Firebase multi-shop inventory/POS system for one business (Motolite), with three roles (Owner/Admin, Shop Manager, Cashier/Staff), hard per-shop data scoping, battery-specific product fields, a damage-report approval workflow, two-step branch transfers, and an owner cross-shop dashboard.

**Architecture:** Vite + React frontend, Firebase Auth + Firestore backend (buyer-owned project), Firestore Security Rules enforcing shop/role scoping at the data layer, client logic organized by feature folder (inventory, pos, damage, transfers, reports) each with a `*Actions.js` (Firestore writes, transactional where stock changes) and a live-query hook (`use*.js`) pairing.

**Tech Stack:** React 18, Vite 5, Firebase 12 (Auth + Firestore, modular SDK), Dexie is NOT used here (this project keeps Firestore, unlike the earlier discarded depot-app-local plan), jsbarcode, jspdf + jspdf-autotable, recharts, lucide-react. Testing: Vitest, @testing-library/react, Firebase Emulator Suite + @firebase/rules-unit-testing for security-rules tests.

**Spec:** `docs/superpowers/specs/2026-09-11-motolite-ims-design.md`

## Global Constraints

- Every Firestore query for a Shop Manager or Cashier MUST be scoped with `where('shopId', '==', myShopId)` (or equivalent) — never fetch-then-filter client-side for restricted roles. Security Rules must independently enforce this (a client bug must not become a data leak).
- All stock-mutating operations (sales, cancellations, damage approval, transfer initiate/confirm) run inside a Firestore `runTransaction` that re-reads the affected item(s) fresh — never write based on a stale client-side snapshot. This is the same pattern already fixed in `depot-app`'s `completeSale`/`cancelSale`.
- IDs are client-generated strings via `newId(prefix)` (e.g. `'i' + random base36`), matching the existing `depot-app` convention — not Firestore auto-IDs.
- No placeholder/mock data paths: every screen reads live Firestore data via `onSnapshot`-based hooks, consistent with `depot-app`'s existing pattern.
- Logo asset at `public/branding/motolite-logo.png` (already staged) is the app's branding — used in the login screen, sidebar header, and `index.html` favicon/title.
- Firebase config is read from Vite env vars (`import.meta.env.VITE_FIREBASE_*`), never hardcoded — `.env` is gitignored, `.env.example` documents the required keys.

---

## Task 1: Project scaffold + test harness

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `.env.example`
- Create: `src/main.jsx`, `src/App.jsx` (stub), `src/firebase.js`
- Create: `src/lib/format.js`
- Test: `src/lib/format.test.js`

**Interfaces:**
- Produces: `src/firebase.js` exports `auth` (Firebase Auth instance), `db` (Firestore instance), and `firebaseConfig` (the raw config object) — `auth`/`db` used by every later task's `*Actions.js`/`use*.js` files, `firebaseConfig` used by Task 7's secondary-app-instance user creation.
- Produces: `src/lib/format.js` exports `newId(prefix: string): string` and `currency(amount: number): string` — used throughout later tasks for ID generation and money formatting.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "motolite-ims",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "firebase": "^12.15.0",
    "jsbarcode": "^3.12.3",
    "jspdf": "^4.2.1",
    "jspdf-autotable": "^5.0.8",
    "lucide-react": "^0.383.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^4.0.0",
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@vitejs/plugin-react": "^4.2.1",
    "jsdom": "^24.1.0",
    "vite": "^5.2.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    exclude: ['**/node_modules/**', '**/*.rules.test.js'],
  },
});
```

- [ ] **Step 3: Create `src/test/setup.js`**

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/branding/motolite-logo.png" />
    <title>Motolite IMS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
dist
.env
*.local
firebase-debug.log
firestore-debug.log
ui-debug.log
.firebase
```

- [ ] **Step 6: Create `.env.example`**

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 7: Create `src/firebase.js`**

```js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

`firebaseConfig` is exported (not just `auth`/`db`) because Task 7's user-creation flow needs to spin up a second, differently-named Firebase App instance with the same config — that's the standard workaround for creating a Firebase Auth account for someone else without signing the current user (the Owner) out of their own session.

- [ ] **Step 8: Write the failing test for `src/lib/format.js`**

```js
// src/lib/format.test.js
import { describe, it, expect } from 'vitest';
import { newId, currency } from './format';

describe('newId', () => {
  it('prefixes the id with the given prefix', () => {
    expect(newId('i')).toMatch(/^i[a-z0-9]+$/);
  });

  it('generates different ids on each call', () => {
    expect(newId('i')).not.toBe(newId('i'));
  });
});

describe('currency', () => {
  it('formats a whole number with two decimals and a peso sign', () => {
    expect(currency(1500)).toBe('₱1,500.00');
  });

  it('rounds to two decimals', () => {
    expect(currency(19.999)).toBe('₱20.00');
  });

  it('formats zero', () => {
    expect(currency(0)).toBe('₱0.00');
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npx vitest run src/lib/format.test.js`
Expected: FAIL with "Failed to resolve import './format'" (file doesn't exist yet)

- [ ] **Step 10: Create `src/lib/format.js`**

```js
export function newId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function currency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(amount) || 0);
}
```

- [ ] **Step 11: Create `src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 12: Create a stub `src/App.jsx`**

```jsx
export default function App() {
  return <div>Motolite IMS — under construction</div>;
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `npx vitest run src/lib/format.test.js`
Expected: PASS (5 tests)

- [ ] **Step 14: Install dependencies and verify the dev server boots**

Run: `npm install && npm run build`
Expected: build completes with no errors (Firebase env vars are empty at this stage, which is fine for a build — they're only read at runtime).

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "Scaffold motolite-ims: Vite + React + Firebase + Vitest harness

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 2: Firestore Security Rules + emulator test harness

**Files:**
- Create: `firebase.json`, `firestore.indexes.json`, `firestore.rules`
- Test: `tests/rules/rules.test.js`, `tests/rules/setup.js`

**Interfaces:**
- Produces: `firestore.rules` — the authoritative shop/role scoping enforcement referenced by every later collection (`users`, `shops`, `items`, `movements`, `sales`, `restocks`, `damageReports`, `transfers`, `categories`, `locations`, `suppliers`). Every later task's Firestore reads/writes must satisfy these rules, verified against the emulator, not assumed.
- Consumes: none (this is the foundation the rest of the backend logic must satisfy).

- [ ] **Step 1: Add Firebase CLI and rules-testing config**

```bash
npm install --save-dev firebase-tools
```

- [ ] **Step 2: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

- [ ] **Step 3: Create `firestore.indexes.json`**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 4: Write the failing rules test**

```js
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
```

- [ ] **Step 5: Create `tests/rules/setup.js`** (empty placeholder file so the test directory is a real path Vitest can discover; no setup logic needed beyond what's inline in the test file)

```js
// Intentionally empty — rules tests configure their own emulator environment inline.
```

- [ ] **Step 6: Run the rules test to verify it fails**

Run: `npx firebase emulators:exec --only firestore "vitest run tests/rules/rules.test.js" --project motolite-ims-test`
Expected: FAIL — `firestore.rules` doesn't exist yet, or (once an empty/default-deny file exists) every `assertSucceeds` case fails since nothing is allowed yet.

- [ ] **Step 7: Create `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }
    function myProfile() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function myRole() {
      return isSignedIn() ? myProfile().role : null;
    }
    function myShopId() {
      return isSignedIn() ? myProfile().shopId : null;
    }
    function isOwner() { return myRole() == 'owner'; }
    function isManager() { return myRole() == 'manager'; }
    function isCashier() { return myRole() == 'cashier'; }
    function sameShop(shopId) { return isSignedIn() && shopId == myShopId(); }
    function onlyChanged(keys) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(keys);
    }

    match /users/{uid} {
      allow read: if isSignedIn() && (isOwner() || request.auth.uid == uid);
      allow create: if isOwner();
      allow update: if isOwner() ||
        (request.auth.uid == uid && onlyChanged(['fullName', 'phone']));
      allow delete: if isOwner();
    }

    match /shops/{shopId} {
      allow read: if isSignedIn();
      allow write: if isOwner();
    }

    match /items/{itemId} {
      allow read: if isSignedIn() && (isOwner() || sameShop(resource.data.shopId));
      allow create: if isOwner() ||
        (isManager() && sameShop(request.resource.data.shopId));
      allow update: if isOwner() ||
        (isManager() && sameShop(resource.data.shopId)) ||
        (isCashier() && sameShop(resource.data.shopId) &&
          onlyChanged(['quantity', 'unitStock', 'reservedForReview']));
      allow delete: if isOwner() || (isManager() && sameShop(resource.data.shopId));
    }

    match /movements/{movementId} {
      allow read: if isSignedIn() && (isOwner() || sameShop(resource.data.shopId));
      allow create: if isOwner() || sameShop(request.resource.data.shopId);
      allow update, delete: if isOwner();
    }

    match /sales/{saleId} {
      // Cancelling a sale is Owner/Admin-only per the spec's permission
      // table (Shop Manager and Cashier both get "—" for Cancel sales) —
      // unlike every other per-shop collection, this is NOT opened up to
      // Manager.
      allow read: if isSignedIn() && (isOwner() || sameShop(resource.data.shopId));
      allow create: if isOwner() ||
        (isCashier() && sameShop(request.resource.data.shopId));
      allow update: if isOwner();
      allow delete: if isOwner();
    }

    match /restocks/{restockId} {
      allow read: if isSignedIn() && (isOwner() || sameShop(resource.data.shopId));
      allow create: if isOwner() || sameShop(request.resource.data.shopId);
      allow update, delete: if isOwner();
    }

    match /damageReports/{reportId} {
      allow read: if isSignedIn() && (isOwner() || sameShop(resource.data.shopId));
      allow create: if isOwner() || sameShop(request.resource.data.shopId);
      allow update: if isOwner() ||
        (isManager() && sameShop(resource.data.shopId) &&
          onlyChanged(['status', 'resolvedBy', 'resolvedAt']));
      allow delete: if isOwner();
    }

    match /transfers/{transferId} {
      // Per the spec, confirming receipt is the DESTINATION shop's job
      // (or Owner/Admin) — the sending shop's Manager can read it (to see
      // it's still in transit) but not confirm it themselves.
      allow read: if isSignedIn() && (isOwner() ||
        sameShop(resource.data.fromShopId) || sameShop(resource.data.toShopId));
      allow create: if isOwner() ||
        (isManager() && sameShop(request.resource.data.fromShopId));
      allow update: if isOwner() ||
        (isManager() && sameShop(resource.data.toShopId) &&
          onlyChanged(['status', 'confirmedBy', 'confirmedAt', 'confirmedQuantity']));
      allow delete: if isOwner();
    }

    match /categories/{id} {
      allow read: if isSignedIn();
      allow write: if isOwner() || isManager();
    }
    match /locations/{id} {
      allow read: if isSignedIn();
      allow write: if isOwner() || isManager();
    }
    match /suppliers/{id} {
      allow read: if isSignedIn();
      allow write: if isOwner() || isManager();
    }
  }
}
```

- [ ] **Step 8: Run the rules test to verify it passes**

Run: `npx firebase emulators:exec --only firestore "vitest run tests/rules/rules.test.js" --project motolite-ims-test`
Expected: PASS (10 tests)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add Firestore Security Rules enforcing shop/role scoping, with emulator tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 3: Unit-of-measure and pricing libraries

**Files:**
- Create: `src/lib/units.js`
- Test: `src/lib/units.test.js`
- Create: `src/lib/pricing.js`
- Test: `src/lib/pricing.test.js`

**Interfaces:**
- Produces: `getItemUnits(item)`, `getUnitCounts(item)`, `totalBaseUnits(stock, units)`, `breakOpenOneLevelUp(stock, units, levelIdx)`, `cascadeDeductUnit(stock, units, sellUnitName, qtyNeeded)`, `itemInventoryValue(item)`, `reorderThresholdInBase(item)` — consumed by Task 8 (inventory actions), Task 11 (sales actions), Task 13 (damage actions), Task 15 (transfer actions).
- Produces: `computeSellingPrice(baseCost, markupType, markupValue)`, `computeMarkupFromPrices(baseCost, sellingPrice)` — consumed by Task 8 and item-form UI in Task 10.
- Consumes: none.

These are ported verbatim from `depot-app`'s `InventorySystem.jsx` (functions of the same name, already reviewed and bugfixed there) — same logic, split into their own module files.

- [ ] **Step 1: Write the failing tests for `src/lib/units.js`**

```js
// src/lib/units.test.js
import { describe, it, expect } from 'vitest';
import {
  getItemUnits, getUnitCounts, totalBaseUnits, cascadeDeductUnit,
  itemInventoryValue, reorderThresholdInBase,
} from './units';

const packItem = {
  baseUnitName: 'Piece', unitCost: 100, sellingPrice: 150,
  units: [{ name: 'Pack', factor: 10, cost: 900, price: 1400 }],
  unitStock: { Piece: 5, Pack: 2 },
  reorderPoint: 3, reorderUnit: 'Pack',
};

describe('getItemUnits', () => {
  it('returns the base unit first, then extra units', () => {
    const units = getItemUnits(packItem);
    expect(units[0]).toMatchObject({ name: 'Piece', factor: 1, isBase: true });
    expect(units[1]).toMatchObject({ name: 'Pack', factor: 10, isBase: false });
  });
});

describe('getUnitCounts', () => {
  it('reads the discrete per-unit stock when unitStock is set', () => {
    expect(getUnitCounts(packItem)).toEqual({ Piece: 5, Pack: 2 });
  });

  it('falls back to putting all quantity on the base unit when unitStock is missing', () => {
    expect(getUnitCounts({ baseUnitName: 'Piece', quantity: 7 })).toEqual({ Piece: 7 });
  });
});

describe('totalBaseUnits', () => {
  it('sums each unit count times its factor', () => {
    const units = getItemUnits(packItem);
    expect(totalBaseUnits({ Piece: 5, Pack: 2 }, units)).toBe(25); // 5 + 2*10
  });
});

describe('cascadeDeductUnit', () => {
  it('deducts directly when enough of the sold unit is on hand', () => {
    const units = getItemUnits(packItem);
    const { newStock, shortfall } = cascadeDeductUnit({ Piece: 5, Pack: 2 }, units, 'Piece', 3);
    expect(newStock).toEqual({ Piece: 2, Pack: 2 });
    expect(shortfall).toBe(0);
  });

  it('breaks open a larger unit when the sold unit runs short', () => {
    const units = getItemUnits(packItem);
    const { newStock, shortfall } = cascadeDeductUnit({ Piece: 1, Pack: 2 }, units, 'Piece', 5);
    // 1 Piece on hand, need 5: break open 1 Pack -> +10 Pieces, take 5, leaving 6 Pieces, 1 Pack
    expect(newStock).toEqual({ Piece: 6, Pack: 1 });
    expect(shortfall).toBe(0);
  });

  it('reports a shortfall instead of going negative when truly out of stock', () => {
    const units = getItemUnits(packItem);
    const { newStock, shortfall } = cascadeDeductUnit({ Piece: 0, Pack: 0 }, units, 'Piece', 3);
    expect(newStock).toEqual({ Piece: 0, Pack: 0 });
    expect(shortfall).toBe(3);
  });
});

describe('itemInventoryValue', () => {
  it('values each unit count at that unit\'s own cost, not just base cost', () => {
    // 5 loose Pieces @ 100 + 2 Packs @ 900 = 500 + 1800 = 2300
    expect(itemInventoryValue(packItem)).toBe(2300);
  });
});

describe('reorderThresholdInBase', () => {
  it('converts the reorder point into base-unit terms using its unit\'s factor', () => {
    // reorderPoint 3, reorderUnit 'Pack' (factor 10) -> 30 base units
    expect(reorderThresholdInBase(packItem)).toBe(30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/units.test.js`
Expected: FAIL — `./units` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/units.js`**

```js
// Units of measure. `item.quantity` always represents stock in the item's
// BASE unit (e.g. "Piece") - every other unit (Pack, Box/Case, custom) is
// just a conversion factor + its own price on top of that same underlying
// stock number.

export function getItemUnits(item) {
  const base = {
    name: item.baseUnitName || 'Piece', factor: 1,
    cost: item.unitCost ?? 0, price: item.sellingPrice ?? item.unitCost ?? 0,
    barcode: item.barcode || null, isBase: true,
  };
  const extra = (item.units || []).map((u) => ({
    ...u, isBase: false,
    cost: u.cost ?? (item.unitCost ?? 0) * (u.factor || 1),
    barcode: u.barcode || null,
  }));
  return [base, ...extra];
}

export function getUnitCounts(item) {
  const units = getItemUnits(item);
  const counts = {};
  units.forEach((u) => { counts[u.name] = 0; });
  if (item.unitStock && typeof item.unitStock === 'object') {
    units.forEach((u) => { counts[u.name] = Number(item.unitStock[u.name]) || 0; });
  } else {
    counts[units[0].name] = item.quantity || 0;
  }
  return counts;
}

export function itemInventoryValue(item) {
  const units = getItemUnits(item);
  const counts = getUnitCounts(item);
  return units.reduce((sum, u) => sum + (counts[u.name] || 0) * (u.cost || 0), 0);
}

export function totalBaseUnits(stock, units) {
  return units.reduce((sum, u) => sum + (stock[u.name] || 0) * u.factor, 0);
}

export function reorderThresholdInBase(item) {
  const units = getItemUnits(item);
  const unit = units.find((u) => u.name === item.reorderUnit) || units[0];
  return (Number(item.reorderPoint) || 0) * (unit?.factor || 1);
}

export function breakOpenOneLevelUp(stock, units, levelIdx) {
  if (levelIdx + 1 >= units.length) return false;
  if ((stock[units[levelIdx + 1].name] || 0) <= 0) {
    const gotHigher = breakOpenOneLevelUp(stock, units, levelIdx + 1);
    if (!gotHigher) return false;
  }
  stock[units[levelIdx + 1].name] -= 1;
  const conversion = units[levelIdx + 1].factor / units[levelIdx].factor;
  stock[units[levelIdx].name] = (stock[units[levelIdx].name] || 0) + conversion;
  return true;
}

export function cascadeDeductUnit(stock, units, sellUnitName, qtyNeeded) {
  const newStock = { ...stock };
  const sellLevelIdx = units.findIndex((u) => u.name === sellUnitName);
  if (sellLevelIdx === -1) return { newStock, shortfall: qtyNeeded };

  while ((newStock[sellUnitName] || 0) < qtyNeeded) {
    const opened = breakOpenOneLevelUp(newStock, units, sellLevelIdx);
    if (!opened) break;
  }

  const available = newStock[sellUnitName] || 0;
  const take = Math.min(available, qtyNeeded);
  newStock[sellUnitName] = available - take;
  const shortfall = qtyNeeded - take;
  return { newStock, shortfall };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/units.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Write the failing tests for `src/lib/pricing.js`**

```js
// src/lib/pricing.test.js
import { describe, it, expect } from 'vitest';
import { computeSellingPrice, computeMarkupFromPrices } from './pricing';

describe('computeSellingPrice', () => {
  it('applies a percent markup on top of cost', () => {
    expect(computeSellingPrice(100, 'percent', 20)).toBe(120);
  });

  it('applies a fixed markup on top of cost', () => {
    expect(computeSellingPrice(100, 'fixed', 20)).toBe(120);
  });

  it('rounds to two decimals', () => {
    expect(computeSellingPrice(99.995, 'percent', 10)).toBeCloseTo(109.99, 2);
  });

  it('never returns a negative price for a negative cost input', () => {
    expect(computeSellingPrice(-50, 'percent', 20)).toBe(0);
  });
});

describe('computeMarkupFromPrices', () => {
  it('derives the peso amount and percent from cost and selling price', () => {
    expect(computeMarkupFromPrices(100, 120)).toEqual({ amount: 20, percent: 20 });
  });

  it('guards against divide-by-zero when cost is 0', () => {
    expect(computeMarkupFromPrices(0, 50)).toEqual({ amount: 50, percent: 0 });
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/lib/pricing.test.js`
Expected: FAIL — `./pricing` doesn't exist yet.

- [ ] **Step 7: Create `src/lib/pricing.js`**

```js
export function computeSellingPrice(baseCost, markupType, markupValue) {
  const cost = Math.max(0, Number(baseCost) || 0);
  const markup = Math.max(0, Number(markupValue) || 0);
  const price = markupType === 'fixed' ? cost + markup : cost * (1 + markup / 100);
  return Math.round(price * 100) / 100;
}

export function computeMarkupFromPrices(baseCost, sellingPrice) {
  const cost = Math.max(0, Number(baseCost) || 0);
  const price = Math.max(0, Number(sellingPrice) || 0);
  const amount = Math.round((price - cost) * 100) / 100;
  const percent = cost > 0 ? Math.round((amount / cost) * 10000) / 100 : 0;
  return { amount, percent };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/pricing.test.js`
Expected: PASS (6 tests)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add unit-of-measure and pricing libraries, ported from depot-app

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 4: Client-side permissions library

**Files:**
- Create: `src/lib/permissions.js`
- Test: `src/lib/permissions.test.js`

**Interfaces:**
- Produces: `PERMISSIONS` (object keyed by `'owner' | 'manager' | 'cashier'`), `can(role, permission): boolean`, `resolveRole(profile): 'owner' | 'manager' | 'cashier'` — consumed by every screen component from Task 9 onward to show/hide actions. This is a UX convenience layer only — `firestore.rules` (Task 2) is the actual enforcement boundary, so this file's permission table must stay consistent with the spec's permission table but never be treated as the security mechanism.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/permissions.test.js
import { describe, it, expect } from 'vitest';
import { can, resolveRole } from './permissions';

describe('can', () => {
  it('gives owner full access, including cross-shop reports and user management', () => {
    expect(can('owner', 'editInventory')).toBe(true);
    expect(can('owner', 'pos')).toBe(true);
    expect(can('owner', 'cancelSales')).toBe(true);
    expect(can('owner', 'manageUsers')).toBe(true);
    expect(can('owner', 'viewConsolidatedReports')).toBe(true);
  });

  it('gives manager full inventory/transfer/report control but no POS', () => {
    expect(can('manager', 'editInventory')).toBe(true);
    expect(can('manager', 'initiateTransfer')).toBe(true);
    expect(can('manager', 'approveDamage')).toBe(true);
    expect(can('manager', 'viewReports')).toBe(true);
    expect(can('manager', 'pos')).toBe(false);
    expect(can('manager', 'manageUsers')).toBe(false);
  });

  it('gives cashier POS, read-only inventory, and stock receive/issue, nothing else', () => {
    expect(can('cashier', 'pos')).toBe(true);
    expect(can('cashier', 'viewInventory')).toBe(true);
    expect(can('cashier', 'stockReceive')).toBe(true);
    expect(can('cashier', 'stockIssue')).toBe(true);
    expect(can('cashier', 'viewOwnSales')).toBe(true);
    expect(can('cashier', 'editInventory')).toBe(false);
    expect(can('cashier', 'approveDamage')).toBe(false);
    expect(can('cashier', 'cancelSales')).toBe(false);
  });

  it('returns false for an unknown role or permission', () => {
    expect(can('bogus', 'pos')).toBe(false);
    expect(can('owner', 'bogusPermission')).toBe(false);
  });
});

describe('resolveRole', () => {
  it('reads the role straight off a valid profile', () => {
    expect(resolveRole({ role: 'manager' })).toBe('manager');
  });

  it('defaults to the lowest-privilege role for a missing or invalid role', () => {
    expect(resolveRole({ role: 'nonsense' })).toBe('cashier');
    expect(resolveRole(null)).toBe('cashier');
    expect(resolveRole({})).toBe('cashier');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/permissions.test.js`
Expected: FAIL — `./permissions` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/permissions.js`**

```js
// Client-side convenience layer only. The Firestore Security Rules in
// firestore.rules are the actual enforcement boundary — this table exists
// so the UI can show/hide actions a user isn't allowed to take, but a bug
// here can never turn into a data leak on its own.
export const PERMISSIONS = {
  owner: {
    viewInventory: true, editInventory: true, deleteInventory: true,
    manageCategories: true, manageSuppliers: true, manageLocations: true,
    stockReceive: true, stockIssue: true, editMarkup: true,
    pos: true, viewReports: true, viewSalesReports: true, print: true, cancelSales: true,
    initiateTransfer: true, confirmTransfer: true,
    reportDamage: true, approveDamage: true,
    manageUsers: true, manageShops: true, viewOwnSales: true,
    viewConsolidatedReports: true,
  },
  manager: {
    viewInventory: true, editInventory: true, deleteInventory: true,
    manageCategories: true, manageSuppliers: true, manageLocations: true,
    stockReceive: true, stockIssue: true, editMarkup: true,
    pos: false, viewReports: true, viewSalesReports: true, print: true, cancelSales: false,
    initiateTransfer: true, confirmTransfer: true,
    reportDamage: true, approveDamage: true,
    manageUsers: false, manageShops: false, viewOwnSales: false,
    viewConsolidatedReports: false,
  },
  cashier: {
    viewInventory: true, editInventory: false, deleteInventory: false,
    manageCategories: false, manageSuppliers: false, manageLocations: false,
    stockReceive: true, stockIssue: true, editMarkup: false,
    pos: true, viewReports: false, viewSalesReports: false, print: false, cancelSales: false,
    initiateTransfer: false, confirmTransfer: false,
    reportDamage: true, approveDamage: false,
    manageUsers: false, manageShops: false, viewOwnSales: true,
    viewConsolidatedReports: false,
  },
};

export function can(role, permission) {
  return !!PERMISSIONS[role]?.[permission];
}

export function resolveRole(profile) {
  if (profile?.role && PERMISSIONS[profile.role]) return profile.role;
  return 'cashier';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/permissions.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add client-side permissions table for the three-role model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 5: Authentication — login, session, and owner bootstrap script

There is no public self-signup screen: per the spec, the Owner/Admin creates
every user account and assigns their shop (Task 7). That leaves one
chicken-and-egg problem — the very first Owner account has to come from
somewhere before any Owner exists to create it. This is solved with a
one-time Node script run directly against Firebase Admin SDK (bypassing
Security Rules entirely, which is exactly what the Admin SDK is for), not
by special-casing `firestore.rules`.

**Files:**
- Create: `src/auth/useAuth.js`
- Create: `src/auth/LoginScreen.jsx`
- Create: `scripts/create-owner.js`
- Test: `src/auth/useAuth.test.js`

**Interfaces:**
- Produces: `useAuth()` returning `{ user, profile, role, loading, login(email, password), logout(), resetPassword(email) }` — consumed by `App.jsx` (Task 20) as the top-level auth gate, and by every screen that needs the current user's role/shopId.
- Consumes: `resolveRole` from `src/lib/permissions.js` (Task 4), `auth`/`db` from `src/firebase.js` (Task 1).

- [ ] **Step 1: Create `scripts/create-owner.js`**

```js
// One-time script to bootstrap the first Owner/Admin account. Run this
// once after setting up your Firebase project, using a service account
// key (Firebase Console -> Project Settings -> Service Accounts ->
// Generate new private key), saved locally as service-account.json
// (already gitignored).
//
// Usage: node scripts/create-owner.js owner@example.com "Owner Name"
// It will print a temporary password — change it on first login.

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const [, , email, fullName] = process.argv;
if (!email || !fullName) {
  console.error('Usage: node scripts/create-owner.js <email> "<full name>"');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!';
const auth = getAuth();
const db = getFirestore();

const userRecord = await auth.createUser({ email, password: tempPassword, displayName: fullName });
await db.collection('users').doc(userRecord.uid).set({
  uid: userRecord.uid, email, fullName, role: 'owner', shopId: null, active: true,
  createdAt: Date.now(),
});

console.log(`Owner account created: ${email}`);
console.log(`Temporary password: ${tempPassword}`);
console.log('Sign in and change this password immediately.');
```

- [ ] **Step 2: Add `service-account.json` to `.gitignore`**

```bash
echo "service-account.json" >> .gitignore
```

- [ ] **Step 3: Add `firebase-admin` as a dependency for the script**

```bash
npm install --save-dev firebase-admin
```

- [ ] **Step 4: Write the failing test for `useAuth`**

```js
// src/auth/useAuth.test.js
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, setDoc } from 'firebase/firestore';

// This test talks to the local Firebase emulators (Auth + Firestore) —
// run it via: firebase emulators:exec "vitest run src/auth/useAuth.test.js"
let app, testAuth, testDb, useAuth;

beforeAll(async () => {
  app = initializeApp({ apiKey: 'test', projectId: 'motolite-ims-test' }, 'auth-test-app');
  testAuth = getAuth(app);
  testDb = getFirestore(app);
  connectAuthEmulator(testAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(testDb, '127.0.0.1', 8080);

  // Point src/firebase.js's exported auth/db at this same emulator-backed
  // app by mocking the module — useAuth imports from '../firebase'.
  vi.doMock('../firebase', () => ({ auth: testAuth, db: testDb }));
  ({ useAuth } = await import('./useAuth'));

  // Seed one user via the Auth emulator's REST API (fastest path — avoids
  // needing firebase-admin in the test process).
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', {
    method: 'POST',
    body: JSON.stringify({ email: 'mgr@test.com', password: 'password123', returnSecureToken: true }),
  }).then(async (res) => {
    const { localId } = await res.json();
    await setDoc(doc(testDb, 'users', localId), {
      uid: localId, email: 'mgr@test.com', role: 'manager', shopId: 'shopA', fullName: 'Test Manager',
    });
  });
  await testAuth.signOut();
});

afterAll(async () => {
  await deleteApp(app);
});

describe('useAuth', () => {
  it('starts logged out with loading false once the initial auth check resolves', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBe(null);
  });

  it('loads the matching Firestore profile and resolved role after login', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('mgr@test.com', 'password123');
    });

    await waitFor(() => expect(result.current.profile).not.toBe(null));
    expect(result.current.profile.shopId).toBe('shopA');
    expect(result.current.role).toBe('manager');
  });

  it('rejects a wrong password', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.login('mgr@test.com', 'wrong-password')).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx firebase emulators:exec "vitest run src/auth/useAuth.test.js" --project motolite-ims-test`
Expected: FAIL — `./useAuth` doesn't exist yet.

- [ ] **Step 6: Create `src/auth/useAuth.js`**

```js
import { useEffect, useState } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { resolveRole } from '../lib/permissions';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (!u) { setProfile(null); setLoading(false); }
  }), []);

  useEffect(() => {
    if (!user) return undefined;
    setLoading(true);
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [user]);

  async function login(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  }
  async function logout() {
    await signOut(auth);
  }
  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }

  return { user, profile, role: resolveRole(profile), loading, login, logout, resetPassword };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx firebase emulators:exec "vitest run src/auth/useAuth.test.js" --project motolite-ims-test`
Expected: PASS (3 tests)

- [ ] **Step 8: Create `src/auth/LoginScreen.jsx`**

```jsx
import { useState } from 'react';

export default function LoginScreen({ onLogin, onResetPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch {
      setError('Incorrect email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (!email) { setError('Enter your email above first, then click "Forgot password".'); return; }
    await onResetPassword(email);
    setResetSent(true);
  }

  return (
    <div className="login-screen">
      <img src="/branding/motolite-logo.png" alt="Motolite" className="login-logo" />
      <h1>Motolite IMS</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="login-error">{error}</p>}
        {resetSent && <p className="login-info">Password reset email sent.</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="login-link" onClick={handleReset}>Forgot password?</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add authentication (login-only) and owner bootstrap script

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 6: Shop management (Owner/Admin only)

**Files:**
- Create: `src/shops/shopActions.js`
- Create: `src/shops/useShops.js`
- Create: `src/shops/ShopsView.jsx`
- Test: `src/shops/shopActions.test.js`

**Interfaces:**
- Produces: `createShop(name): Promise<string shopId>`, `renameShop(shopId, name): Promise<void>`, `deleteShop(shopId): Promise<void>` — consumed by `ShopsView.jsx` and, indirectly, by Task 7's user-assignment UI (which needs the shop list).
- Produces: `useShops()` returning a live array of `{ id, name, createdAt }` — consumed by `ShopsView.jsx`, `UsersView.jsx` (Task 7), and every shop-picker dropdown in later tasks.
- Consumes: `db` from `src/firebase.js`, `newId` from `src/lib/format.js`.

- [ ] **Step 1: Write the failing tests for `shopActions`**

```js
// src/shops/shopActions.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

let testEnv, ownerDb;

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
    await setDoc(doc(ctx.firestore(), 'users', 'owner1'), { role: 'owner', shopId: null });
  });
  ownerDb = testEnv.authenticatedContext('owner1').firestore();
});

// shopActions.js takes a Firestore instance as its first argument so it
// can be pointed at the emulator-backed db under test, or at the real
// `db` export from src/firebase.js at runtime.
import { createShop, renameShop, deleteShop } from './shopActions';

describe('shopActions', () => {
  it('creates a shop with a generated id and the given name', async () => {
    const shopId = await createShop(ownerDb, 'Branch A');
    const snap = await getDoc(doc(ownerDb, 'shops', shopId));
    expect(snap.data()).toMatchObject({ id: shopId, name: 'Branch A' });
  });

  it('renames an existing shop', async () => {
    const shopId = await createShop(ownerDb, 'Branch A');
    await renameShop(ownerDb, shopId, 'Branch A - Renamed');
    const snap = await getDoc(doc(ownerDb, 'shops', shopId));
    expect(snap.data().name).toBe('Branch A - Renamed');
  });

  it('deletes a shop', async () => {
    const shopId = await createShop(ownerDb, 'Branch A');
    await deleteShop(ownerDb, shopId);
    const snap = await getDoc(doc(ownerDb, 'shops', shopId));
    expect(snap.exists()).toBe(false);
  });

  it('trims whitespace and rejects an empty name', async () => {
    await expect(createShop(ownerDb, '   ')).rejects.toThrow('Shop name is required');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/shops/shopActions.test.js" --project motolite-ims-test`
Expected: FAIL — `./shopActions` doesn't exist yet.

- [ ] **Step 3: Create `src/shops/shopActions.js`**

```js
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { newId } from '../lib/format';

export async function createShop(db, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Shop name is required');
  const shopId = newId('shop');
  await setDoc(doc(db, 'shops', shopId), { id: shopId, name: trimmed, createdAt: Date.now() });
  return shopId;
}

export async function renameShop(db, shopId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Shop name is required');
  await setDoc(doc(db, 'shops', shopId), { name: trimmed }, { merge: true });
}

export async function deleteShop(db, shopId) {
  await deleteDoc(doc(db, 'shops', shopId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/shops/shopActions.test.js" --project motolite-ims-test`
Expected: PASS (4 tests)

- [ ] **Step 5: Create `src/shops/useShops.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useShops() {
  const [shops, setShops] = useState([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'shops'), orderBy('name')),
    (snap) => setShops(snap.docs.map((d) => d.data()))
  ), []);
  return shops;
}
```

- [ ] **Step 6: Create `src/shops/ShopsView.jsx`**

```jsx
import { useState } from 'react';
import { Store, Plus, Pencil, Trash2 } from 'lucide-react';
import { useShops } from './useShops';
import { createShop, renameShop, deleteShop } from './shopActions';
import { db } from '../firebase';

export default function ShopsView() {
  const shops = useShops();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await createShop(db, newName);
      setNewName('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRename(shopId) {
    try {
      await renameShop(db, shopId, editingName);
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="shops-view">
      <h2><Store size={18} /> Shops</h2>
      <form onSubmit={handleCreate} className="shops-create-form">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New shop name" />
        <button type="submit"><Plus size={16} /> Add shop</button>
      </form>
      {error && <p className="shops-error">{error}</p>}
      <ul className="shops-list">
        {shops.map((shop) => (
          <li key={shop.id}>
            {editingId === shop.id ? (
              <>
                <input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                <button onClick={() => handleRename(shop.id)}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span>{shop.name}</span>
                <button onClick={() => { setEditingId(shop.id); setEditingName(shop.name); }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => deleteShop(db, shop.id)}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add shop management (create/rename/delete, Owner/Admin only)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 7: User management — create, assign shop/role, deactivate

**Files:**
- Create: `src/users/userActions.js`
- Create: `src/users/useUsers.js`
- Create: `src/users/UsersView.jsx`
- Test: `src/users/userActions.test.js`

**Interfaces:**
- Produces: `createUser({ email, fullName, role, shopId }): Promise<{ uid, tempPassword }>`, `updateUserRole(uid, role): Promise<void>`, `updateUserShop(uid, shopId): Promise<void>`, `setUserActive(uid, active): Promise<void>` — consumed by `UsersView.jsx`.
- Produces: `useUsers()` returning a live array of every user (Owner/Admin only view — Security Rules already block anyone else from reading other users' docs, per Task 2) — consumed by `UsersView.jsx`.
- Consumes: `auth`, `db`, `firebaseConfig` from `src/firebase.js`, `newId` from `src/lib/format.js`.

`deactivateUser` here is an application-level flag (`active: false` on the
Firestore user doc), not a Firebase-Auth-level account disable — disabling
the actual Auth account requires the Admin SDK, out of scope for the
client app. `App.jsx` (Task 20) checks `profile.active` and blocks access
with a "contact your Owner/Admin" screen when false, even though the
person could technically still authenticate.

- [ ] **Step 1: Write the failing tests**

```js
// src/users/userActions.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnv, ownerDb;

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
    await setDoc(doc(ctx.firestore(), 'users', 'owner1'), { role: 'owner', shopId: null });
  });
  ownerDb = testEnv.authenticatedContext('owner1').firestore();
});

// userActions.js's Firestore-doc-writing functions take a Firestore
// instance as their first argument, same pattern as shopActions.js —
// makes them testable against the emulator here without touching the
// real Firebase Auth REST API (that part of createUser is exercised
// separately, manually, since the rules-unit-testing emulator project
// doesn't have a live Auth emulator wired to it in this test file).
import { updateUserRole, updateUserShop, setUserActive } from './userActions';

describe('userActions (Firestore doc updates)', () => {
  it('updates a user\'s role', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'cash1'), { role: 'cashier', shopId: 'shopA' });
    });
    await updateUserRole(ownerDb, 'cash1', 'manager');
    const snap = await getDoc(doc(ownerDb, 'users', 'cash1'));
    expect(snap.data().role).toBe('manager');
  });

  it('reassigns a user\'s shop', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'cash1'), { role: 'cashier', shopId: 'shopA' });
    });
    await updateUserShop(ownerDb, 'cash1', 'shopB');
    const snap = await getDoc(doc(ownerDb, 'users', 'cash1'));
    expect(snap.data().shopId).toBe('shopB');
  });

  it('deactivates and reactivates a user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'cash1'), { role: 'cashier', shopId: 'shopA', active: true });
    });
    await setUserActive(ownerDb, 'cash1', false);
    expect((await getDoc(doc(ownerDb, 'users', 'cash1'))).data().active).toBe(false);
    await setUserActive(ownerDb, 'cash1', true);
    expect((await getDoc(doc(ownerDb, 'users', 'cash1'))).data().active).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/users/userActions.test.js" --project motolite-ims-test`
Expected: FAIL — `./userActions` doesn't exist yet.

- [ ] **Step 3: Create `src/users/userActions.js`**

```js
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db as defaultDb, firebaseConfig } from '../firebase';
import { newId } from '../lib/format';

export async function updateUserRole(db, uid, role) {
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function updateUserShop(db, uid, shopId) {
  await updateDoc(doc(db, 'users', uid), { shopId });
}

export async function setUserActive(db, uid, active) {
  await updateDoc(doc(db, 'users', uid), { active });
}

// Creates a brand-new Firebase Auth account + matching Firestore user doc,
// without signing the calling Owner/Admin out of their own session. Spins
// up a second, uniquely-named Firebase App instance sharing the same
// project config purely to perform the account creation, then tears that
// instance down immediately — the primary `auth` export in src/firebase.js
// (and whoever is signed into it) is never touched.
export async function createUser({ email, fullName, role, shopId }) {
  const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!';
  const secondaryApp = initializeApp(firebaseConfig, 'user-creation-' + newId(''));
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    await setDoc(doc(defaultDb, 'users', cred.user.uid), {
      uid: cred.user.uid, email, fullName, role, shopId: shopId || null,
      active: true, createdAt: Date.now(),
    });
    await signOut(secondaryAuth);
    return { uid: cred.user.uid, tempPassword };
  } finally {
    await deleteApp(secondaryApp);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/users/userActions.test.js" --project motolite-ims-test`
Expected: PASS (3 tests)

- [ ] **Step 5: Create `src/users/useUsers.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'users'), orderBy('fullName')),
    (snap) => setUsers(snap.docs.map((d) => d.data())),
    () => setUsers([]) // a non-Owner/Admin will get a permission-denied error here; fail closed to an empty list
  ), []);
  return users;
}
```

- [ ] **Step 6: Create `src/users/UsersView.jsx`**

```jsx
import { useState } from 'react';
import { UserPlus, ShieldCheck } from 'lucide-react';
import { useUsers } from './useUsers';
import { createUser, updateUserRole, updateUserShop, setUserActive } from './userActions';
import { useShops } from '../shops/useShops';

const ROLES = ['owner', 'manager', 'cashier'];

export default function UsersView() {
  const users = useUsers();
  const shops = useShops();
  const [form, setForm] = useState({ email: '', fullName: '', role: 'cashier', shopId: '' });
  const [createdInfo, setCreatedInfo] = useState(null);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreatedInfo(null);
    try {
      const { email, tempPassword } = { email: form.email, ...(await createUser(form)) };
      setCreatedInfo(`Created ${email}. Temporary password: ${tempPassword}`);
      setForm({ email: '', fullName: '', role: 'cashier', shopId: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="users-view">
      <h2><ShieldCheck size={18} /> Users</h2>
      <form onSubmit={handleCreate} className="users-create-form">
        <input placeholder="Email" type="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Full name" value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {form.role !== 'owner' && (
          <select value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} required>
            <option value="">Assign shop…</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button type="submit"><UserPlus size={16} /> Create user</button>
      </form>
      {createdInfo && <p className="users-created-info">{createdInfo}</p>}
      {error && <p className="users-error">{error}</p>}

      <table className="users-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Shop</th><th>Status</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.uid}>
              <td>{u.fullName}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => updateUserRole(u.uid, e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td>
                {u.role === 'owner' ? '—' : (
                  <select value={u.shopId || ''} onChange={(e) => updateUserShop(u.uid, e.target.value)}>
                    <option value="">Unassigned</option>
                    {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </td>
              <td>
                <button onClick={() => setUserActive(u.uid, !u.active)}>
                  {u.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Note: `updateUserRole`/`updateUserShop`/`setUserActive` are called here with
just `(uid, value)` from the UI, while `userActions.test.js` calls them
with `(db, uid, value)`. Both signatures must exist — the UI convenience
wrapper defaults `db` to the real `db` export:

- [ ] **Step 7: Adjust `userActions.js` so the Firestore-instance parameter is optional, defaulting to the real `db`**

```js
export async function updateUserRole(dbOrUid, uidOrRole, maybeRole) {
  const [db, uid, role] = maybeRole === undefined
    ? [defaultDb, dbOrUid, uidOrRole]
    : [dbOrUid, uidOrRole, maybeRole];
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function updateUserShop(dbOrUid, uidOrShopId, maybeShopId) {
  const [db, uid, shopId] = maybeShopId === undefined
    ? [defaultDb, dbOrUid, uidOrShopId]
    : [dbOrUid, uidOrShopId, maybeShopId];
  await updateDoc(doc(db, 'users', uid), { shopId });
}

export async function setUserActive(dbOrUid, uidOrActive, maybeActive) {
  const [db, uid, active] = maybeActive === undefined
    ? [defaultDb, dbOrUid, uidOrActive]
    : [dbOrUid, uidOrActive, maybeActive];
  await updateDoc(doc(db, 'users', uid), { active });
}
```

Replace the three plain versions from Step 3 with these overloaded
versions in the same file.

- [ ] **Step 8: Re-run the Step 1 tests to confirm the overload didn't break the explicit-db call style**

Run: `npx firebase emulators:exec "vitest run src/users/userActions.test.js" --project motolite-ims-test`
Expected: PASS (3 tests, unchanged — they already pass `db` explicitly, which the overload still supports)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add user management: create, assign role/shop, deactivate

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 8: Inventory item CRUD (with battery-specific fields)

**Files:**
- Create: `src/inventory/inventoryActions.js`
- Test: `src/inventory/inventoryActions.test.js`

**Interfaces:**
- Produces: `saveItem(db, draft, { shopId }): Promise<string itemId>`, `deleteItem(db, itemId): Promise<void>` — consumed by `ItemForm.jsx`/`InventoryList.jsx` (Task 10), and referenced by Task 9's movement/restock actions (same file, added there).
- Consumes: `getItemUnits`, `getUnitCounts` from `src/lib/units.js` (Task 3), `computeSellingPrice` from `src/lib/pricing.js` (Task 3), `newId` from `src/lib/format.js` (Task 1).

An item document's shape (superset of `depot-app`'s): `id, sku, name, category, location, supplierIds, baseUnitName, units, unitStock, quantity, reorderPoint, reorderUnit, unitCost, sellingPrice, markupType, markupValue, barcode, shopId, reservedForReview, batteryModel, voltage, capacity, warrantyMonths, vehicleType`.

- [ ] **Step 1: Write the failing tests**

```js
// src/inventory/inventoryActions.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/inventory/inventoryActions.test.js" --project motolite-ims-test`
Expected: FAIL — `./inventoryActions` doesn't exist yet.

- [ ] **Step 3: Create `src/inventory/inventoryActions.js`**

```js
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getItemUnits, totalBaseUnits } from '../lib/units';
import { computeSellingPrice } from '../lib/pricing';
import { newId } from '../lib/format';

export async function saveItem(db, draft, { shopId }) {
  const isNew = !draft.id;
  const id = draft.id || newId('i');
  const baseUnitName = draft.baseUnitName || 'Piece';

  const unitStock = { [baseUnitName]: Math.max(0, Number(draft.baseUnitStock) || 0) };
  (draft.units || []).forEach((u) => {
    unitStock[u.name] = Math.max(0, Number(u.stock) || 0);
  });

  const units = getItemUnits({ ...draft, baseUnitName, unitStock });
  const quantity = totalBaseUnits(unitStock, units);

  const sellingPrice = draft.sellingPrice ??
    computeSellingPrice(draft.unitCost, draft.markupType || 'percent', draft.markupValue || 0);

  await setDoc(doc(db, 'items', id), {
    ...draft, id, shopId, quantity, unitStock, baseUnitName, sellingPrice,
    reservedForReview: draft.reservedForReview ?? 0,
    units: draft.units || [],
  });
  return id;
}

export async function deleteItem(db, itemId) {
  await deleteDoc(doc(db, 'items', itemId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/inventory/inventoryActions.test.js" --project motolite-ims-test`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add item CRUD actions with battery-specific fields and shop scoping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 9: Stock movements (receive/issue) and restock

**Files:**
- Modify: `src/inventory/inventoryActions.js` (append to the file created in Task 8)
- Test: `src/inventory/movements.test.js`

**Interfaces:**
- Produces: `recordMovement(db, itemId, type, qty, reason): Promise<void>` (`type` is `'in' | 'out'`), `createRestock(db, { itemId, quantity, unitName, unitCost, supplierId, notes }): Promise<void>` — consumed by `MoveStockModal.jsx`/`RestockModal.jsx` (Task 10) and by Cashier's receive/issue UI.
- Consumes: `cascadeDeductUnit`, `getItemUnits`, `getUnitCounts` from `src/lib/units.js` (Task 3), `newId` from `src/lib/format.js` (Task 1). Both functions re-read the item fresh inside a `runTransaction`, per the Global Constraints — this is exactly the pattern that fixed `depot-app`'s stock-corruption bugs.

- [ ] **Step 1: Write the failing tests**

```js
// src/inventory/movements.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { recordMovement, createRestock } from './inventoryActions';

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
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 5, unitStock: { Piece: 5 }, units: [],
    });
  });
  mgrDb = testEnv.authenticatedContext('mgrA').firestore();
});

describe('recordMovement', () => {
  it('adds to loose base-unit stock on receive', async () => {
    await recordMovement(mgrDb, 'item1', 'in', 3, 'Delivery');
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(8);
    expect(item.unitStock.Piece).toBe(8);
  });

  it('deducts on issue and clamps at zero instead of going negative', async () => {
    await recordMovement(mgrDb, 'item1', 'out', 20, 'Shrinkage');
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(0);
  });

  it('writes a movement record with the shop id carried over from the item', async () => {
    await recordMovement(mgrDb, 'item1', 'in', 1, 'Delivery');
    const snap = await getDocs(collection(mgrDb, 'movements'));
    expect(snap.docs).toHaveLength(1);
    expect(snap.docs[0].data()).toMatchObject({ itemId: 'item1', type: 'in', qty: 1, shopId: 'shopA' });
  });
});

describe('createRestock', () => {
  it('adds stock at the given unit and logs a restock record', async () => {
    await createRestock(mgrDb, {
      itemId: 'item1', quantity: 2, unitName: 'Piece', unitCost: 800, notes: 'Weekly delivery',
    });
    const item = (await getDoc(doc(mgrDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7);
    const restocks = await getDocs(collection(mgrDb, 'restocks'));
    expect(restocks.docs).toHaveLength(1);
    expect(restocks.docs[0].data()).toMatchObject({ itemId: 'item1', quantity: 2, shopId: 'shopA' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/inventory/movements.test.js" --project motolite-ims-test`
Expected: FAIL — `recordMovement`/`createRestock` don't exist yet.

- [ ] **Step 3: Append to `src/inventory/inventoryActions.js`**

```js
import { runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts } from '../lib/units';

export async function recordMovement(db, itemId, type, qty, reason) {
  const mvId = newId('m');
  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const delta = type === 'in' ? qty : -qty;
    const newQty = Math.max(0, item.quantity + delta);
    const baseUnitName = item.baseUnitName || 'Piece';
    const units = getItemUnits(item);
    const counts = getUnitCounts(item);

    let unitStock;
    if (type === 'in') {
      unitStock = { ...counts, [baseUnitName]: (counts[baseUnitName] || 0) + qty };
    } else {
      const result = cascadeDeductUnit(counts, units, baseUnitName, qty);
      unitStock = result.newStock;
    }

    transaction.set(itemRef, { ...item, quantity: newQty, unitStock });
    transaction.set(doc(db, 'movements', mvId), {
      id: mvId, itemId, type, qty, shopId: item.shopId,
      reason: reason || (type === 'in' ? 'Stock received' : 'Stock issued'),
      timestamp: Date.now(),
    });
  });
}

export async function createRestock(db, { itemId, quantity, unitName, unitCost, supplierId, notes }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  const restockId = newId('rs');
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const units = getItemUnits(item);
    const unit = units.find((u) => u.name === unitName) || units[0];
    const counts = getUnitCounts(item);
    const newStock = { ...counts, [unit.name]: (counts[unit.name] || 0) + qty };
    const newQuantity = units.reduce((sum, u) => sum + (newStock[u.name] || 0) * u.factor, 0);
    const cost = Math.max(0, Number(unitCost) || 0) || (item.unitCost ?? 0);

    transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock });
    transaction.set(doc(db, 'restocks', restockId), {
      id: restockId, itemId, itemSku: item.sku, shopId: item.shopId,
      quantity: qty, unitName: unit.name, unitCost: cost,
      supplierId: supplierId || null, notes: notes || '', receivedAt: now,
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/inventory/movements.test.js" --project motolite-ims-test`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add stock receive/issue and restock actions (transactional)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 10: Inventory UI and catalog (categories/locations/suppliers)

**Files:**
- Create: `src/inventory/useItems.js`
- Create: `src/inventory/InventoryList.jsx`
- Create: `src/inventory/ItemForm.jsx`
- Create: `src/inventory/MoveStockModal.jsx`
- Create: `src/inventory/RestockModal.jsx`
- Create: `src/catalog/catalogActions.js`
- Create: `src/catalog/useCatalog.js`
- Create: `src/catalog/CatalogManager.jsx`
- Test: `src/catalog/catalogActions.test.js`

**Interfaces:**
- Produces: `useItems({ role, shopId }): items[]` (live, scoped: `role === 'owner'` gets every shop, otherwise filtered to `shopId`) — consumed by `InventoryList.jsx`, `POSView.jsx` (Task 12), `OwnerDashboard.jsx` (Task 18).
- Produces: `addCategory(db, name): Promise<void>`, `deleteCategory(db, name): Promise<void>` (throws if any item still references it) — same shape for `addLocation`/`deleteLocation`, `addSupplier({name, contact})`/`deleteSupplier(id)` — consumed by `CatalogManager.jsx` and `ItemForm.jsx`'s dropdowns.
- Consumes: `saveItem`, `deleteItem` (Task 8), `recordMovement`, `createRestock` (Task 9), `db` from `src/firebase.js`, `can` from `src/lib/permissions.js` (Task 4) to hide actions the current role can't take.

- [ ] **Step 1: Write the failing tests for `catalogActions`**

```js
// src/catalog/catalogActions.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { addCategory, deleteCategory } from './catalogActions';

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

describe('addCategory / deleteCategory', () => {
  it('adds a category', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    const snap = await getDocs(collection(mgrDb, 'categories'));
    expect(snap.docs.map((d) => d.data().name)).toContain('Motorcycle Batteries');
  });

  it('rejects a duplicate (case-insensitive) category name', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    await expect(addCategory(mgrDb, 'motorcycle batteries')).rejects.toThrow('already exists');
  });

  it('refuses to delete a category still referenced by an item', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
        id: 'item1', shopId: 'shopA', category: 'Motorcycle Batteries',
      });
    });
    await expect(deleteCategory(mgrDb, 'Motorcycle Batteries')).rejects.toThrow('still use it');
  });

  it('deletes a category with no items referencing it', async () => {
    await addCategory(mgrDb, 'Motorcycle Batteries');
    await deleteCategory(mgrDb, 'Motorcycle Batteries');
    const snap = await getDocs(collection(mgrDb, 'categories'));
    expect(snap.docs.map((d) => d.data().name)).not.toContain('Motorcycle Batteries');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/catalog/catalogActions.test.js" --project motolite-ims-test`
Expected: FAIL — `./catalogActions` doesn't exist yet.

- [ ] **Step 3: Create `src/catalog/catalogActions.js`**

```js
import { doc, setDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { newId } from '../lib/format';

function makeCrud(collectionName, itemFieldName) {
  return {
    async add(db, name) {
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error(`Name is required`);
      const existing = await getDocs(collection(db, collectionName));
      if (existing.docs.some((d) => d.data().name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`"${trimmed}" already exists`);
      }
      const id = newId(collectionName[0]);
      await setDoc(doc(db, collectionName, id), { id, name: trimmed });
      return id;
    },
    async remove(db, name) {
      const inUse = await getDocs(query(collection(db, 'items'), where(itemFieldName, '==', name)));
      if (!inUse.empty) {
        throw new Error(`"${name}" is still used by ${inUse.size} item${inUse.size === 1 ? '' : 's'}`);
      }
      const existing = await getDocs(query(collection(db, collectionName), where('name', '==', name)));
      await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)));
    },
  };
}

const categories = makeCrud('categories', 'category');
const locations = makeCrud('locations', 'location');

export const addCategory = categories.add;
export const deleteCategory = categories.remove;
export const addLocation = locations.add;
export const deleteLocation = locations.remove;

export async function addSupplier(db, { name, contact }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Supplier name is required');
  const id = newId('sup');
  await setDoc(doc(db, 'suppliers', id), { id, name: trimmed, contact: contact || '' });
  return id;
}

export async function deleteSupplier(db, supplierId) {
  await deleteDoc(doc(db, 'suppliers', supplierId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/catalog/catalogActions.test.js" --project motolite-ims-test`
Expected: PASS (4 tests)

- [ ] **Step 5: Create `src/catalog/useCatalog.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

function useCollection(name) {
  const [rows, setRows] = useState([]);
  useEffect(() => onSnapshot(
    query(collection(db, name), orderBy('name')),
    (snap) => setRows(snap.docs.map((d) => d.data()))
  ), [name]);
  return rows;
}

export function useCategories() { return useCollection('categories'); }
export function useLocations() { return useCollection('locations'); }
export function useSuppliers() { return useCollection('suppliers'); }
```

- [ ] **Step 6: Create `src/inventory/useItems.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export function useItems({ role, shopId }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const itemsQuery = role === 'owner'
      ? collection(db, 'items')
      : query(collection(db, 'items'), where('shopId', '==', shopId));
    return onSnapshot(itemsQuery, (snap) => setItems(snap.docs.map((d) => d.data())));
  }, [role, shopId]);
  return items;
}
```

- [ ] **Step 7: Create `src/catalog/CatalogManager.jsx`**

```jsx
import { useState } from 'react';
import { Tag, MapPin, Truck } from 'lucide-react';
import { useCategories, useLocations, useSuppliers } from './useCatalog';
import { addCategory, deleteCategory, addLocation, deleteLocation, addSupplier, deleteSupplier } from './catalogActions';
import { db } from '../firebase';

function ListEditor({ icon, title, rows, onAdd, onRemove, renderLabel }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await onAdd(value);
      setValue('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="catalog-section">
      <h3>{icon} {title}</h3>
      <form onSubmit={handleAdd}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Add ${title.toLowerCase()}`} />
        <button type="submit">Add</button>
      </form>
      {error && <p className="catalog-error">{error}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span>{renderLabel ? renderLabel(row) : row.name}</span>
            <button onClick={async () => {
              try { await onRemove(row.name); } catch (err) { setError(err.message); }
            }}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CatalogManager() {
  const categories = useCategories();
  const locations = useLocations();
  const suppliers = useSuppliers();

  return (
    <div className="catalog-manager">
      <ListEditor icon={<Tag size={16} />} title="Categories" rows={categories}
        onAdd={(name) => addCategory(db, name)} onRemove={(name) => deleteCategory(db, name)} />
      <ListEditor icon={<MapPin size={16} />} title="Locations" rows={locations}
        onAdd={(name) => addLocation(db, name)} onRemove={(name) => deleteLocation(db, name)} />
      <ListEditor icon={<Truck size={16} />} title="Suppliers" rows={suppliers}
        onAdd={(name) => addSupplier(db, { name })} onRemove={(name) => {
          const match = suppliers.find((s) => s.name === name);
          if (match) return deleteSupplier(db, match.id);
        }} renderLabel={(row) => row.name} />
    </div>
  );
}
```

- [ ] **Step 8: Create `src/inventory/ItemForm.jsx`**

```jsx
import { useState } from 'react';
import { useCategories, useLocations, useSuppliers } from '../catalog/useCatalog';
import { computeSellingPrice } from '../lib/pricing';
import { saveItem } from './inventoryActions';
import { db } from '../firebase';

const VEHICLE_TYPE_SUGGESTIONS = ['Motorcycle', 'Car', 'SUV', 'Truck', 'Van'];

export default function ItemForm({ item, shopId, onDone }) {
  const categories = useCategories();
  const locations = useLocations();
  const suppliers = useSuppliers();
  const [draft, setDraft] = useState(item || {
    sku: '', name: '', category: '', location: '', supplierIds: [],
    baseUnitName: 'Piece', baseUnitStock: 0, units: [],
    unitCost: 0, markupType: 'percent', markupValue: 0,
    batteryModel: '', voltage: 12, capacity: '', warrantyMonths: 12, vehicleType: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const previewPrice = computeSellingPrice(draft.unitCost, draft.markupType, draft.markupValue);

  function set(field) {
    return (e) => setDraft({ ...draft, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await saveItem(db, draft, { shopId });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="item-form">
      <input placeholder="SKU" value={draft.sku} onChange={set('sku')} required />
      <input placeholder="Name" value={draft.name} onChange={set('name')} required />

      <select value={draft.category} onChange={set('category')}>
        <option value="">Category…</option>
        {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      </select>
      <select value={draft.location} onChange={set('location')}>
        <option value="">Location…</option>
        {locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
      </select>

      <fieldset>
        <legend>Battery details</legend>
        <input placeholder="Battery model (e.g. N50)" value={draft.batteryModel} onChange={set('batteryModel')} />
        <input type="number" placeholder="Voltage" value={draft.voltage} onChange={set('voltage')} />
        <input placeholder="Capacity (e.g. 35Ah/320CCA)" value={draft.capacity} onChange={set('capacity')} />
        <input type="number" placeholder="Warranty (months)" value={draft.warrantyMonths} onChange={set('warrantyMonths')} />
        <input placeholder="Vehicle type" value={draft.vehicleType} onChange={set('vehicleType')} list="vehicle-type-suggestions" />
        <datalist id="vehicle-type-suggestions">
          {VEHICLE_TYPE_SUGGESTIONS.map((v) => <option key={v} value={v} />)}
        </datalist>
      </fieldset>

      <fieldset>
        <legend>Stock &amp; pricing</legend>
        <input type="number" placeholder="Starting stock (Pieces)" value={draft.baseUnitStock} onChange={set('baseUnitStock')} />
        <input type="number" placeholder="Base cost" value={draft.unitCost} onChange={set('unitCost')} />
        <select value={draft.markupType} onChange={set('markupType')}>
          <option value="percent">Markup %</option>
          <option value="fixed">Markup ₱</option>
        </select>
        <input type="number" placeholder="Markup value" value={draft.markupValue} onChange={set('markupValue')} />
        <p>Selling price preview: ₱{previewPrice.toFixed(2)}</p>
      </fieldset>

      {error && <p className="item-form-error">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
    </form>
  );
}
```

- [ ] **Step 9: Create `src/inventory/MoveStockModal.jsx`**

```jsx
import { useState } from 'react';
import { recordMovement } from './inventoryActions';
import { db } from '../firebase';

export default function MoveStockModal({ item, onClose }) {
  const [type, setType] = useState('in');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await recordMovement(db, item.id, type, Number(qty), reason);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal">
      <form onSubmit={handleSubmit}>
        <h3>{item.sku} — Receive / Issue stock</h3>
        <label>
          <input type="radio" checked={type === 'in'} onChange={() => setType('in')} /> Receive
        </label>
        <label>
          <input type="radio" checked={type === 'out'} onChange={() => setType('out')} /> Issue
        </label>
        <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p className="modal-error">{error}</p>}
        <button type="submit">Confirm</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 10: Create `src/inventory/RestockModal.jsx`**

```jsx
import { useState } from 'react';
import { useSuppliers } from '../catalog/useCatalog';
import { getItemUnits } from '../lib/units';
import { createRestock } from './inventoryActions';
import { db } from '../firebase';

export default function RestockModal({ item, onClose }) {
  const suppliers = useSuppliers();
  const units = getItemUnits(item);
  const [unitName, setUnitName] = useState(units[0]?.name);
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(item.unitCost || 0);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await createRestock(db, {
        itemId: item.id, quantity: Number(quantity), unitName, unitCost: Number(unitCost), supplierId, notes,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal">
      <form onSubmit={handleSubmit}>
        <h3>{item.sku} — Restock</h3>
        <select value={unitName} onChange={(e) => setUnitName(e.target.value)}>
          {units.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
        </select>
        <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Supplier (optional)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="modal-error">{error}</p>}
        <button type="submit">Confirm restock</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 11: Create `src/inventory/InventoryList.jsx`**

```jsx
import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUpCircle, PackagePlus } from 'lucide-react';
import { useItems } from './useItems';
import { deleteItem } from './inventoryActions';
import { reorderThresholdInBase } from '../lib/units';
import { can } from '../lib/permissions';
import { db } from '../firebase';
import ItemForm from './ItemForm';
import MoveStockModal from './MoveStockModal';
import RestockModal from './RestockModal';

export default function InventoryList({ role, shopId }) {
  const items = useItems({ role, shopId });
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [movingItem, setMovingItem] = useState(null);
  const [restockingItem, setRestockingItem] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const filtered = items.filter((it) => {
    const q = search.toLowerCase();
    return !q || it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q)
      || it.batteryModel?.toLowerCase().includes(q) || it.vehicleType?.toLowerCase().includes(q);
  });

  return (
    <div className="inventory-list">
      <div className="inventory-toolbar">
        <input placeholder="Search SKU, name, model, vehicle type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {can(role, 'editInventory') && (
          <button onClick={() => setShowNewForm(true)}><Plus size={16} /> Add item</button>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>SKU</th><th>Name</th><th>Model</th><th>Vehicle</th><th>Qty</th><th>Price</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((it) => {
            const low = it.quantity <= reorderThresholdInBase(it);
            return (
              <tr key={it.id} className={low ? 'low-stock' : ''}>
                <td>{it.sku}</td>
                <td>{it.name}</td>
                <td>{it.batteryModel}</td>
                <td>{it.vehicleType}</td>
                <td>{it.quantity}</td>
                <td>₱{Number(it.sellingPrice || 0).toFixed(2)}</td>
                <td>
                  {can(role, 'stockReceive') && (
                    <button onClick={() => setMovingItem(it)}><ArrowUpCircle size={14} /></button>
                  )}
                  {can(role, 'stockReceive') && (
                    <button onClick={() => setRestockingItem(it)}><PackagePlus size={14} /></button>
                  )}
                  {can(role, 'editInventory') && (
                    <button onClick={() => setEditingItem(it)}><Pencil size={14} /></button>
                  )}
                  {can(role, 'deleteInventory') && (
                    <button onClick={() => deleteItem(db, it.id)}><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showNewForm && <ItemForm shopId={shopId} onDone={() => setShowNewForm(false)} />}
      {editingItem && <ItemForm item={editingItem} shopId={shopId} onDone={() => setEditingItem(null)} />}
      {movingItem && <MoveStockModal item={movingItem} onClose={() => setMovingItem(null)} />}
      {restockingItem && <RestockModal item={restockingItem} onClose={() => setRestockingItem(null)} />}
    </div>
  );
}
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Add inventory UI (list, item form, move/restock modals) and catalog manager

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 11: POS sales actions (checkout + cancellation, concurrency-safe)

**Files:**
- Create: `src/pos/salesActions.js`
- Test: `src/pos/salesActions.test.js`

**Interfaces:**
- Produces: `completeSale(db, cartLines, amountReceived, { shopId, cashierId, cashierEmail }): Promise<sale>`, `cancelSale(db, sale): Promise<void>` — consumed by `POSView.jsx`/`Receipt.jsx` (Task 12).
- Consumes: `cascadeDeductUnit`, `getItemUnits`, `getUnitCounts`, `totalBaseUnits` from `src/lib/units.js` (Task 3), `newId` from `src/lib/format.js` (Task 1).

This ports `depot-app`'s already-fixed `completeSale`/`cancelSale` (Firestore
`runTransaction`-based, re-reads items fresh, restores `unitStock` — not
just `quantity` — on cancel, converts to base units via `factor`) with
`shopId`/`cashierId` added throughout for the multi-shop model. Note that
`cancelSale` itself has no role check inside `salesActions.js` — the
Owner/Admin-only restriction (per the spec's permission table, where
Shop Manager and Cashier both get "—" for Cancel sales) is enforced by
`firestore.rules`' `sales` collection (`allow update: if isOwner();`) and
mirrored in the UI via `can(role, 'cancelSales')` (Task 12), not
re-implemented here.

- [ ] **Step 1: Write the failing tests**

```js
// src/pos/salesActions.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { completeSale, cancelSale } from './salesActions';

let testEnv, cashDb, ownerDb;

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
    await setDoc(doc(ctx.firestore(), 'users', 'owner1'), { role: 'owner', shopId: null });
    await setDoc(doc(ctx.firestore(), 'items', 'item1'), {
      id: 'item1', sku: 'N50', shopId: 'shopA', baseUnitName: 'Piece',
      quantity: 10, unitStock: { Piece: 10 }, units: [],
      unitCost: 800, sellingPrice: 1000,
    });
  });
  cashDb = testEnv.authenticatedContext('cashA').firestore();
  // Cancelling a sale is Owner/Admin-only per the spec's permission table
  // (Shop Manager and Cashier both get "—" for Cancel sales) — so the
  // cancelSale tests below run against ownerDb, not cashDb.
  ownerDb = testEnv.authenticatedContext('owner1').firestore();
});

describe('completeSale', () => {
  it('deducts stock and records a sale', async () => {
    const sale = await completeSale(
      cashDb,
      [{ itemId: 'item1', qty: 3, unitName: 'Piece', unitPrice: 1000 }],
      5000,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    );
    expect(sale.total).toBe(3000);
    const item = (await getDoc(doc(cashDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(7);
  });

  it('rejects a sale that would oversell, without deducting anything', async () => {
    await expect(completeSale(
      cashDb,
      [{ itemId: 'item1', qty: 999, unitName: 'Piece', unitPrice: 1000 }],
      null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    )).rejects.toThrow(/not enough stock/i);
    const item = (await getDoc(doc(cashDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
  });

  it('re-reads stock fresh so two sequential sales on the same item both see the latest total (no lost update)', async () => {
    await completeSale(cashDb, [{ itemId: 'item1', qty: 4, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' });
    await completeSale(cashDb, [{ itemId: 'item1', qty: 4, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' });
    const item = (await getDoc(doc(cashDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(2); // 10 - 4 - 4, never double-counted or lost
  });
});

describe('cancelSale', () => {
  it('restores both quantity and unitStock for the exact unit sold', async () => {
    const sale = await completeSale(
      cashDb, [{ itemId: 'item1', qty: 3, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    );
    await cancelSale(ownerDb, sale);
    const item = (await getDoc(doc(ownerDb, 'items', 'item1'))).data();
    expect(item.quantity).toBe(10);
    expect(item.unitStock.Piece).toBe(10);
  });

  it('refuses to cancel an already-cancelled sale', async () => {
    const sale = await completeSale(
      cashDb, [{ itemId: 'item1', qty: 1, unitName: 'Piece', unitPrice: 1000 }], null,
      { shopId: 'shopA', cashierId: 'cashA', cashierEmail: 'cash@test.com' }
    );
    await cancelSale(ownerDb, sale);
    await expect(cancelSale(ownerDb, { ...sale, cancelled: true })).rejects.toThrow(/already cancelled/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/pos/salesActions.test.js" --project motolite-ims-test`
Expected: FAIL — `./salesActions` doesn't exist yet.

- [ ] **Step 3: Create `src/pos/salesActions.js`**

```js
import { doc, runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';

export async function completeSale(db, cartLines, amountReceived, { shopId, cashierId, cashierEmail }) {
  if (!cartLines || cartLines.length === 0) throw new Error('Cart is empty');

  const receiptNo = 'R' + Date.now().toString(36).toUpperCase();
  const now = Date.now();
  const itemIds = [...new Set(cartLines.map((l) => l.itemId))];

  return runTransaction(db, async (transaction) => {
    const freshItems = {};
    for (const itemId of itemIds) {
      const snap = await transaction.get(doc(db, 'items', itemId));
      if (!snap.exists()) throw new Error('An item in this sale no longer exists');
      freshItems[itemId] = snap.data();
    }

    const finalStockByItem = {};
    for (const line of cartLines) {
      const item = freshItems[line.itemId];
      const units = getItemUnits(item);
      const current = finalStockByItem[item.id]?.newStock || getUnitCounts(item);
      const sellUnitName = line.unitName || item.baseUnitName || 'Piece';
      const { newStock, shortfall } = cascadeDeductUnit(current, units, sellUnitName, line.qty);
      if (shortfall > 0) {
        throw new Error(`Not enough stock for ${item.sku} (short ${shortfall} ${sellUnitName})`);
      }
      finalStockByItem[item.id] = { newStock, newQuantity: totalBaseUnits(newStock, units) };
    }

    const saleLines = cartLines.map((line) => {
      const item = freshItems[line.itemId];
      const price = line.unitPrice ?? item.sellingPrice ?? item.unitCost;
      const lineCost = item.unitCost ?? 0;
      return {
        itemId: item.id, sku: item.sku, name: item.name,
        qty: line.qty, unitName: line.unitName || item.baseUnitName || 'Piece', factor: line.factor ?? 1,
        unitPrice: price, unitCost: lineCost,
        lineTotal: price * line.qty, lineProfit: (price - lineCost) * line.qty,
      };
    });
    const total = saleLines.reduce((s, l) => s + l.lineTotal, 0);
    const totalCost = saleLines.reduce((s, l) => s + l.unitCost * l.qty, 0);
    const totalProfit = saleLines.reduce((s, l) => s + l.lineProfit, 0);
    const received = amountReceived != null && amountReceived !== '' ? Number(amountReceived) : null;
    const change = received != null ? Math.max(0, received - total) : null;

    const sale = {
      id: newId('s'), receiptNo, timestamp: now, items: saleLines,
      subtotal: total, total, totalCost, totalProfit, amountReceived: received, change,
      cashierId, cashierEmail: cashierEmail || '', shopId, cancelled: false,
    };

    Object.entries(finalStockByItem).forEach(([itemId, { newStock, newQuantity }]) => {
      transaction.set(doc(db, 'items', itemId), { ...freshItems[itemId], quantity: newQuantity, unitStock: newStock });
    });
    cartLines.forEach((line) => {
      const mvId = newId('m');
      const baseQty = line.qty * (line.factor ?? 1);
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: line.itemId, type: 'out', qty: baseQty, shopId,
        reason: `Sale ${receiptNo}`, timestamp: now,
      });
    });
    transaction.set(doc(db, 'sales', sale.id), sale);

    return sale;
  });
}

export async function cancelSale(db, sale) {
  if (sale.cancelled) throw new Error('This sale is already cancelled');
  const now = Date.now();
  const itemIds = [...new Set(sale.items.map((l) => l.itemId))];

  await runTransaction(db, async (transaction) => {
    const freshItems = {};
    for (const itemId of itemIds) {
      const snap = await transaction.get(doc(db, 'items', itemId));
      if (snap.exists()) freshItems[itemId] = snap.data();
    }

    const restoredByItem = {};
    sale.items.forEach((line) => {
      const item = freshItems[line.itemId];
      if (!item) return;
      const units = getItemUnits(item);
      const current = restoredByItem[item.id]?.newStock || getUnitCounts(item);
      const unitName = line.unitName || item.baseUnitName || 'Piece';
      const newStock = { ...current, [unitName]: (current[unitName] || 0) + line.qty };
      restoredByItem[item.id] = { newStock, newQuantity: totalBaseUnits(newStock, units) };
    });

    Object.entries(restoredByItem).forEach(([itemId, { newStock, newQuantity }]) => {
      transaction.set(doc(db, 'items', itemId), { ...freshItems[itemId], quantity: newQuantity, unitStock: newStock });
    });
    sale.items.forEach((line) => {
      const mvId = newId('m');
      const baseQty = line.qty * (line.factor ?? 1);
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: line.itemId, type: 'in', qty: baseQty, shopId: sale.shopId,
        reason: `Sale ${sale.receiptNo} cancelled`, timestamp: now,
      });
    });
    transaction.set(doc(db, 'sales', sale.id), { cancelled: true, cancelledAt: now }, { merge: true });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/pos/salesActions.test.js" --project motolite-ims-test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add POS checkout and sale cancellation (transactional, shop-scoped)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 12: POS UI (cart, checkout, receipt)

**Files:**
- Create: `src/pos/POSView.jsx`
- Create: `src/pos/Receipt.jsx`

**Interfaces:**
- Consumes: `useItems` (Task 10), `completeSale` (Task 11), `currency` from `src/lib/format.js` (Task 1), `getItemUnits` from `src/lib/units.js` (Task 3).
- No new exports consumed by later tasks — this is a leaf UI screen.

This is a UI-assembly task with no new pure logic to unit test; verification is manual (Step 4).

- [ ] **Step 1: Create `src/pos/Receipt.jsx`**

```jsx
import { currency } from '../lib/format';

export default function Receipt({ sale, onClose }) {
  return (
    <div className="receipt-modal">
      <div className="receipt">
        <img src="/branding/motolite-logo.png" alt="Motolite" className="receipt-logo" />
        <h3>Receipt {sale.receiptNo}</h3>
        <p>{new Date(sale.timestamp).toLocaleString()}</p>
        <table>
          <tbody>
            {sale.items.map((line, i) => (
              <tr key={i}>
                <td>{line.sku} × {line.qty} {line.unitName}</td>
                <td>{currency(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="receipt-total">Total: {currency(sale.total)}</p>
        {sale.amountReceived != null && (
          <>
            <p>Received: {currency(sale.amountReceived)}</p>
            <p>Change: {currency(sale.change)}</p>
          </>
        )}
      </div>
      <button onClick={() => window.print()}>Print</button>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pos/POSView.jsx`**

```jsx
import { useState } from 'react';
import { ShoppingCart, Search } from 'lucide-react';
import { useItems } from '../inventory/useItems';
import { getItemUnits } from '../lib/units';
import { currency } from '../lib/format';
import { completeSale } from './salesActions';
import { db } from '../firebase';
import Receipt from './Receipt';

export default function POSView({ role, shopId, cashierId, cashierEmail }) {
  const items = useItems({ role, shopId });
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ itemId, sku, name, qty, unitName, unitPrice, factor }]
  const [amountReceived, setAmountReceived] = useState('');
  const [error, setError] = useState('');
  const [completedSale, setCompletedSale] = useState(null);

  const results = items.filter((it) => {
    const q = search.toLowerCase();
    return q.length > 0 && (
      it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q)
      || it.batteryModel?.toLowerCase().includes(q) || it.vehicleType?.toLowerCase().includes(q)
    );
  });

  function addToCart(item) {
    const unit = getItemUnits(item)[0];
    setCart((prev) => {
      const existing = prev.find((l) => l.itemId === item.id && l.unitName === unit.name);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, {
        itemId: item.id, sku: item.sku, name: item.name, qty: 1,
        unitName: unit.name, unitPrice: unit.price, factor: unit.factor,
      }];
    });
    setSearch('');
  }

  const total = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  async function handleCheckout() {
    setError('');
    try {
      const sale = await completeSale(db, cart, amountReceived || null, { shopId, cashierId, cashierEmail });
      setCompletedSale(sale);
      setCart([]);
      setAmountReceived('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="pos-view">
      <div className="pos-search">
        <Search size={16} />
        <input placeholder="Search SKU, name, model, vehicle type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {results.length > 0 && (
          <ul className="pos-search-results">
            {results.map((it) => (
              <li key={it.id} onClick={() => addToCart(it)}>
                {it.sku} — {it.name} ({currency(it.sellingPrice)}) — {it.quantity} in stock
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pos-cart">
        <h3><ShoppingCart size={16} /> Cart</h3>
        <ul>
          {cart.map((line, i) => (
            <li key={i}>
              {line.sku} × {line.qty} {line.unitName} — {currency(line.unitPrice * line.qty)}
            </li>
          ))}
        </ul>
        <p className="pos-total">Total: {currency(total)}</p>
        <input placeholder="Amount received" type="number" value={amountReceived}
          onChange={(e) => setAmountReceived(e.target.value)} />
        {error && <p className="pos-error">{error}</p>}
        <button disabled={cart.length === 0} onClick={handleCheckout}>Checkout</button>
      </div>

      {completedSale && <Receipt sale={completedSale} onClose={() => setCompletedSale(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add POS UI (product search, cart, checkout, receipt)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

- [ ] **Step 4: Manual verification (after Task 20 wires this into the app shell)**

Log in as a Cashier, search for an item by SKU/name/battery model/vehicle
type, add it to the cart, enter an amount received, check out, and confirm
the receipt shows the right total/change and the item's stock count drops
in the Inventory screen.

---

## Task 13: Damage/returned/defective stock — report and approval actions

**Files:**
- Create: `src/damage/damageActions.js`
- Test: `src/damage/damageActions.test.js`

**Interfaces:**
- Produces: `reportDamage(db, { itemId, shopId, quantity, reason, reportedBy }): Promise<string reportId>`, `approveDamage(db, reportId, resolvedBy): Promise<void>`, `rejectDamage(db, reportId, resolvedBy): Promise<void>` — consumed by `DamageReportsView.jsx` (Task 14).
- Consumes: `cascadeDeductUnit`, `getItemUnits`, `getUnitCounts`, `totalBaseUnits` from `src/lib/units.js` (Task 3), `newId` from `src/lib/format.js` (Task 1).

Damage reports always operate in the item's base unit (Piece-equivalent) —
the spec doesn't require reporting damage in Pack/Box terms, so this
avoids adding unit-selection complexity to a workflow that's fundamentally
"this many units are broken," not a sale. `reservedForReview` on the item
tracks quantity that's reported-but-not-yet-resolved: it's subtracted from
sellable availability by every other stock-mutating action's shortfall
check (`quantity - reservedForReview` is the true sellable count), without
touching `quantity`/`unitStock` until an approval actually deducts it.

- [ ] **Step 1: Write the failing tests**

```js
// src/damage/damageActions.test.js
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
    await expect(approveDamage(mgrDb, reportId, 'mgrA')).rejects.toThrow(/already resolved/i);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/damage/damageActions.test.js" --project motolite-ims-test`
Expected: FAIL — `./damageActions` doesn't exist yet.

- [ ] **Step 3: Create `src/damage/damageActions.js`**

```js
import { doc, runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';

export async function reportDamage(db, { itemId, shopId, quantity, reason, reportedBy }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  const reportId = newId('dr');
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const sellable = item.quantity - (item.reservedForReview || 0);
    if (qty > sellable) throw new Error(`Not enough sellable stock to reserve (only ${sellable} available)`);

    transaction.set(itemRef, { ...item, reservedForReview: (item.reservedForReview || 0) + qty });
    transaction.set(doc(db, 'damageReports', reportId), {
      id: reportId, itemId, shopId, quantity: qty, reason,
      reportedBy, reportedAt: now, status: 'pending', resolvedBy: null, resolvedAt: null,
    });
  });
  return reportId;
}

async function resolveDamage(db, reportId, resolvedBy, { approve }) {
  const now = Date.now();
  await runTransaction(db, async (transaction) => {
    const reportRef = doc(db, 'damageReports', reportId);
    const reportSnap = await transaction.get(reportRef);
    if (!reportSnap.exists()) throw new Error('Damage report no longer exists');
    const report = reportSnap.data();
    if (report.status !== 'pending') throw new Error('This report has already been resolved');

    const itemRef = doc(db, 'items', report.itemId);
    const itemSnap = await transaction.get(itemRef);
    if (!itemSnap.exists()) throw new Error('Item no longer exists');
    const item = itemSnap.data();

    const releasedReserved = Math.max(0, (item.reservedForReview || 0) - report.quantity);

    if (approve) {
      const baseUnitName = item.baseUnitName || 'Piece';
      const units = getItemUnits(item);
      const { newStock, shortfall } = cascadeDeductUnit(getUnitCounts(item), units, baseUnitName, report.quantity);
      if (shortfall > 0) throw new Error('Stock has changed since this report and can no longer cover it');
      const newQuantity = totalBaseUnits(newStock, units);
      transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock, reservedForReview: releasedReserved });
      const mvId = newId('m');
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: report.itemId, type: 'out', qty: report.quantity, shopId: report.shopId,
        reason: `${report.reason} (damage report approved)`, timestamp: now,
      });
    } else {
      transaction.set(itemRef, { ...item, reservedForReview: releasedReserved });
    }

    transaction.set(reportRef, {
      ...report, status: approve ? 'approved' : 'rejected', resolvedBy, resolvedAt: now,
    });
  });
}

export function approveDamage(db, reportId, resolvedBy) {
  return resolveDamage(db, reportId, resolvedBy, { approve: true });
}

export function rejectDamage(db, reportId, resolvedBy) {
  return resolveDamage(db, reportId, resolvedBy, { approve: false });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/damage/damageActions.test.js" --project motolite-ims-test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add damage/returned/defective stock report + approval workflow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 14: Damage reports UI

**Files:**
- Create: `src/damage/useDamageReports.js`
- Create: `src/damage/DamageReportsView.jsx`

**Interfaces:**
- Consumes: `reportDamage`, `approveDamage`, `rejectDamage` (Task 13), `useItems` (Task 10), `can` from `src/lib/permissions.js` (Task 4).
- No new exports consumed by later tasks — leaf UI screen. Manual verification only (Step 3).

- [ ] **Step 1: Create `src/damage/useDamageReports.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useDamageReports({ role, shopId }) {
  const [reports, setReports] = useState([]);
  useEffect(() => {
    const reportsQuery = role === 'owner'
      ? query(collection(db, 'damageReports'), orderBy('reportedAt', 'desc'))
      : query(collection(db, 'damageReports'), where('shopId', '==', shopId), orderBy('reportedAt', 'desc'));
    return onSnapshot(reportsQuery, (snap) => setReports(snap.docs.map((d) => d.data())));
  }, [role, shopId]);
  return reports;
}
```

- [ ] **Step 2: Create `src/damage/DamageReportsView.jsx`**

```jsx
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDamageReports } from './useDamageReports';
import { useItems } from '../inventory/useItems';
import { reportDamage, approveDamage, rejectDamage } from './damageActions';
import { can } from '../lib/permissions';
import { db } from '../firebase';

const REASONS = ['damaged', 'returned', 'defective'];

export default function DamageReportsView({ role, shopId, userId }) {
  const reports = useDamageReports({ role, shopId });
  const items = useItems({ role, shopId });
  const [form, setForm] = useState({ itemId: '', quantity: 1, reason: 'damaged' });
  const [error, setError] = useState('');

  async function handleReport(e) {
    e.preventDefault();
    setError('');
    try {
      await reportDamage(db, {
        itemId: form.itemId, shopId, quantity: Number(form.quantity), reason: form.reason, reportedBy: userId,
      });
      setForm({ itemId: '', quantity: 1, reason: 'damaged' });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="damage-reports-view">
      <h2><AlertTriangle size={18} /> Damaged / Returned / Defective</h2>

      {can(role, 'reportDamage') && (
        <form onSubmit={handleReport} className="damage-report-form">
          <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required>
            <option value="">Select item…</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
          </select>
          <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit">Report</button>
        </form>
      )}
      {error && <p className="damage-error">{error}</p>}

      <table>
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const item = items.find((it) => it.id === r.itemId);
            return (
              <tr key={r.id}>
                <td>{item?.sku || r.itemId}</td>
                <td>{r.quantity}</td>
                <td>{r.reason}</td>
                <td>{r.status}</td>
                <td>
                  {r.status === 'pending' && can(role, 'approveDamage') && (
                    <>
                      <button onClick={() => approveDamage(db, r.id, userId)}>Approve</button>
                      <button onClick={() => rejectDamage(db, r.id, userId)}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (after Task 20 wires this into the app shell)**

As a Cashier, report a damaged item and confirm it disappears from
sellable stock in the POS search without yet reducing the Inventory
count. As a Shop Manager, approve it and confirm the Inventory count now
drops; report a second item and reject it, confirming stock is
unaffected either way.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add damage reports UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 15: Branch-to-branch stock transfers — initiate and confirm

**Files:**
- Create: `src/transfers/transferActions.js`
- Test: `src/transfers/transferActions.test.js`

**Interfaces:**
- Produces: `initiateTransfer(db, { itemId, fromShopId, toShopId, quantity, initiatedBy }): Promise<string transferId>`, `confirmReceipt(db, transferId, confirmedQuantity, confirmedBy): Promise<void>` — consumed by `TransfersView.jsx` (Task 16).
- Consumes: `cascadeDeductUnit`, `getItemUnits`, `getUnitCounts`, `totalBaseUnits` from `src/lib/units.js` (Task 3), `newId` from `src/lib/format.js` (Task 1).

The Firestore Web SDK's `transaction.get()` only accepts document
references, not queries — so "does the destination shop already have this
item, or do we need to create it" can't be resolved with a query *inside*
the transaction the way `depot-app`'s original "assign to staff" flow did.
This avoids that entirely with a **deterministic destination item ID**:
`destItemId = 'xfer_' + toShopId + '_' + itemId` (sanitized). The first
transfer of a given source item into a given shop creates that doc; every
later transfer of the same item into the same shop reads and updates the
exact same doc — so `transaction.get()` on that fixed ref is always
correct, with no pre-query, no race window, and full transactional safety
even if two transfers to the same shop are confirmed at nearly the same
moment. Both transfer legs operate in the item's base unit, same
simplification as damage reports (Task 13).

- [ ] **Step 1: Write the failing tests**

```js
// src/transfers/transferActions.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec "vitest run src/transfers/transferActions.test.js" --project motolite-ims-test`
Expected: FAIL — `./transferActions` doesn't exist yet.

- [ ] **Step 3: Create `src/transfers/transferActions.js`**

```js
import { doc, runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';

function destItemId(toShopId, sourceItemId) {
  return `xfer_${toShopId}_${sourceItemId}`;
}

export async function initiateTransfer(db, { itemId, fromShopId, toShopId, quantity, initiatedBy }) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than zero');
  const transferId = newId('xf');
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'items', itemId);
    const snap = await transaction.get(itemRef);
    if (!snap.exists()) throw new Error('Item no longer exists');
    const item = snap.data();

    const baseUnitName = item.baseUnitName || 'Piece';
    const units = getItemUnits(item);
    const { newStock, shortfall } = cascadeDeductUnit(getUnitCounts(item), units, baseUnitName, qty);
    if (shortfall > 0) throw new Error(`Not enough stock to transfer (short ${shortfall})`);
    const newQuantity = totalBaseUnits(newStock, units);

    transaction.set(itemRef, { ...item, quantity: newQuantity, unitStock: newStock });
    transaction.set(doc(db, 'transfers', transferId), {
      id: transferId, itemId, itemSku: item.sku, itemName: item.name,
      fromShopId, toShopId, quantity: qty, status: 'in_transit',
      initiatedBy, initiatedAt: now, confirmedBy: null, confirmedAt: null, confirmedQuantity: null,
    });
    const outMvId = newId('m');
    transaction.set(doc(db, 'movements', outMvId), {
      id: outMvId, itemId, type: 'out', qty, shopId: fromShopId,
      reason: `Transfer to shop ${toShopId}`, timestamp: now,
    });
  });
  return transferId;
}

export async function confirmReceipt(db, transferId, confirmedQuantity, confirmedBy) {
  const qty = Math.max(0, Number(confirmedQuantity) || 0);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const transferRef = doc(db, 'transfers', transferId);
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists()) throw new Error('Transfer no longer exists');
    const transfer = transferSnap.data();
    if (transfer.status !== 'in_transit') throw new Error('This transfer has already been resolved');

    if (qty !== transfer.quantity) {
      transaction.set(transferRef, {
        ...transfer, status: 'disputed', confirmedBy, confirmedAt: now, confirmedQuantity: qty,
      });
      return;
    }

    const destRef = doc(db, 'items', destItemId(transfer.toShopId, transfer.itemId));
    const destSnap = await transaction.get(destRef);

    if (destSnap.exists()) {
      const dest = destSnap.data();
      const units = getItemUnits(dest);
      const baseUnitName = dest.baseUnitName || 'Piece';
      const counts = getUnitCounts(dest);
      const newStock = { ...counts, [baseUnitName]: (counts[baseUnitName] || 0) + qty };
      const newQuantity = totalBaseUnits(newStock, units);
      transaction.set(destRef, { ...dest, quantity: newQuantity, unitStock: newStock });
    } else {
      transaction.set(destRef, {
        id: destItemId(transfer.toShopId, transfer.itemId), sku: transfer.itemSku, name: transfer.itemName,
        shopId: transfer.toShopId, sourceItemId: transfer.itemId, baseUnitName: 'Piece',
        quantity: qty, unitStock: { Piece: qty }, units: [], reservedForReview: 0,
      });
    }

    const inMvId = newId('m');
    transaction.set(doc(db, 'movements', inMvId), {
      id: inMvId, itemId: destItemId(transfer.toShopId, transfer.itemId), type: 'in', qty, shopId: transfer.toShopId,
      reason: `Transfer received from shop ${transfer.fromShopId}`, timestamp: now,
    });
    transaction.set(transferRef, {
      ...transfer, status: 'received', confirmedBy, confirmedAt: now, confirmedQuantity: qty,
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec "vitest run src/transfers/transferActions.test.js" --project motolite-ims-test`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add two-step branch-to-branch stock transfers (initiate + confirm)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 16: Transfers UI

**Files:**
- Create: `src/transfers/useTransfers.js`
- Create: `src/transfers/TransfersView.jsx`

**Interfaces:**
- Consumes: `initiateTransfer`, `confirmReceipt` (Task 15), `useItems` (Task 10), `useShops` (Task 6), `can` from `src/lib/permissions.js` (Task 4).
- No new exports consumed by later tasks — leaf UI screen. Manual verification only (Step 3).

- [ ] **Step 1: Create `src/transfers/useTransfers.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// A transfer is relevant to a shop as either sender or receiver, and
// Firestore doesn't support an OR across two different fields in one
// query — so a Manager subscribes to both queries and merges the results
// client-side. An Owner/Admin just gets everything.
export function useTransfers({ role, shopId }) {
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);

  useEffect(() => {
    if (role === 'owner') {
      return onSnapshot(query(collection(db, 'transfers'), orderBy('initiatedAt', 'desc')), (snap) => {
        setOutgoing(snap.docs.map((d) => d.data()));
        setIncoming([]);
      });
    }
    const unsubOut = onSnapshot(
      query(collection(db, 'transfers'), where('fromShopId', '==', shopId), orderBy('initiatedAt', 'desc')),
      (snap) => setOutgoing(snap.docs.map((d) => d.data()))
    );
    const unsubIn = onSnapshot(
      query(collection(db, 'transfers'), where('toShopId', '==', shopId), orderBy('initiatedAt', 'desc')),
      (snap) => setIncoming(snap.docs.map((d) => d.data()))
    );
    return () => { unsubOut(); unsubIn(); };
  }, [role, shopId]);

  if (role === 'owner') return outgoing;
  const byId = new Map();
  [...outgoing, ...incoming].forEach((t) => byId.set(t.id, t));
  return [...byId.values()].sort((a, b) => b.initiatedAt - a.initiatedAt);
}
```

- [ ] **Step 2: Create `src/transfers/TransfersView.jsx`**

```jsx
import { useState } from 'react';
import { Truck } from 'lucide-react';
import { useTransfers } from './useTransfers';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { initiateTransfer, confirmReceipt } from './transferActions';
import { can } from '../lib/permissions';
import { db } from '../firebase';

export default function TransfersView({ role, shopId, userId }) {
  const transfers = useTransfers({ role, shopId });
  const items = useItems({ role, shopId });
  const shops = useShops();
  const [form, setForm] = useState({ itemId: '', toShopId: '', quantity: 1 });
  const [confirmQty, setConfirmQty] = useState({});
  const [error, setError] = useState('');

  async function handleInitiate(e) {
    e.preventDefault();
    setError('');
    try {
      await initiateTransfer(db, {
        itemId: form.itemId, fromShopId: shopId, toShopId: form.toShopId,
        quantity: Number(form.quantity), initiatedBy: userId,
      });
      setForm({ itemId: '', toShopId: '', quantity: 1 });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConfirm(transferId) {
    setError('');
    try {
      await confirmReceipt(db, transferId, Number(confirmQty[transferId] ?? 0), userId);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="transfers-view">
      <h2><Truck size={18} /> Branch Transfers</h2>

      {can(role, 'initiateTransfer') && (
        <form onSubmit={handleInitiate} className="transfer-initiate-form">
          <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required>
            <option value="">Item…</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
          </select>
          <select value={form.toShopId} onChange={(e) => setForm({ ...form, toShopId: e.target.value })} required>
            <option value="">To shop…</option>
            {shops.filter((s) => s.id !== shopId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <button type="submit">Ship transfer</button>
        </form>
      )}
      {error && <p className="transfer-error">{error}</p>}

      <table>
        <thead>
          <tr><th>Item</th><th>From</th><th>To</th><th>Qty</th><th>Status</th><th>Confirm</th></tr>
        </thead>
        <tbody>
          {transfers.map((t) => {
            const fromShop = shops.find((s) => s.id === t.fromShopId);
            const toShop = shops.find((s) => s.id === t.toShopId);
            const canConfirmHere = t.status === 'in_transit' && can(role, 'confirmTransfer')
              && (role === 'owner' || t.toShopId === shopId);
            return (
              <tr key={t.id}>
                <td>{t.itemSku}</td>
                <td>{fromShop?.name || t.fromShopId}</td>
                <td>{toShop?.name || t.toShopId}</td>
                <td>{t.quantity}</td>
                <td>{t.status}</td>
                <td>
                  {canConfirmHere && (
                    <>
                      <input type="number" placeholder="Qty received" style={{ width: 80 }}
                        value={confirmQty[t.id] ?? t.quantity}
                        onChange={(e) => setConfirmQty({ ...confirmQty, [t.id]: e.target.value })} />
                      <button onClick={() => handleConfirm(t.id)}>Confirm</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (after Task 20 wires this into the app shell)**

As Shop A's Manager, initiate a transfer of a battery to Shop B and
confirm it deducts Shop A's stock immediately. As Shop B's Manager,
confirm receipt with the correct quantity and see Shop B's inventory gain
that item; then run a second transfer and confirm with a wrong quantity,
verifying it shows as "disputed" rather than silently accepting it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add branch transfers UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 17: Cross-shop dashboard stats and PDF export

**Files:**
- Create: `src/reports/dashboardStats.js`
- Test: `src/reports/dashboardStats.test.js`
- Create: `src/reports/pdfExport.js`

**Interfaces:**
- Produces: `computeShopComparisonStats(items, sales, shops)` returning `{ perShop: [{ shopId, shopName, inventoryValue, lowStockCount, outOfStockCount, revenue, unitsSold, profit }], totals: {...same keys, no shopId/shopName} }` — consumed by `OwnerDashboard.jsx` (Task 18). Pure function — the caller filters `sales` to whatever date range is selected before passing them in.
- Produces: `exportSalesReportPdf(sales, { title }): void` (triggers a PDF download), `exportInventoryReportPdf(items, { title }): void` — consumed by `OwnerDashboard.jsx` and `ShopReports.jsx` (Task 18).
- Consumes: `itemInventoryValue`, `reorderThresholdInBase` from `src/lib/units.js` (Task 3), `currency` from `src/lib/format.js` (Task 1).

- [ ] **Step 1: Write the failing tests for `dashboardStats`**

```js
// src/reports/dashboardStats.test.js
import { describe, it, expect } from 'vitest';
import { computeShopComparisonStats } from './dashboardStats';

const shops = [{ id: 'shopA', name: 'Branch A' }, { id: 'shopB', name: 'Branch B' }];
const items = [
  { id: 'i1', shopId: 'shopA', quantity: 2, reorderPoint: 5, reorderUnit: 'Piece', baseUnitName: 'Piece', unitCost: 800, unitStock: { Piece: 2 } },
  { id: 'i2', shopId: 'shopA', quantity: 0, reorderPoint: 3, reorderUnit: 'Piece', baseUnitName: 'Piece', unitCost: 500, unitStock: { Piece: 0 } },
  { id: 'i3', shopId: 'shopB', quantity: 20, reorderPoint: 3, reorderUnit: 'Piece', baseUnitName: 'Piece', unitCost: 900, unitStock: { Piece: 20 } },
];
const sales = [
  { shopId: 'shopA', total: 1000, totalProfit: 200, cancelled: false, items: [{ qty: 3 }] },
  { shopId: 'shopA', total: 500, totalProfit: 100, cancelled: true, items: [{ qty: 1 }] }, // cancelled, excluded
  { shopId: 'shopB', total: 3000, totalProfit: 900, cancelled: false, items: [{ qty: 2 }, { qty: 1 }] },
];

describe('computeShopComparisonStats', () => {
  it('buckets inventory value, low/out-of-stock counts per shop', () => {
    const { perShop } = computeShopComparisonStats(items, sales, shops);
    const shopA = perShop.find((s) => s.shopId === 'shopA');
    expect(shopA.inventoryValue).toBe(1600); // 2*800 + 0*500
    expect(shopA.lowStockCount).toBe(1); // i1: 2 <= reorderPoint 5
    expect(shopA.outOfStockCount).toBe(1); // i2: quantity 0
  });

  it('excludes cancelled sales from revenue/profit/units sold', () => {
    const { perShop } = computeShopComparisonStats(items, sales, shops);
    const shopA = perShop.find((s) => s.shopId === 'shopA');
    expect(shopA.revenue).toBe(1000);
    expect(shopA.profit).toBe(200);
    expect(shopA.unitsSold).toBe(3);
  });

  it('sums per-shop stats into overall totals', () => {
    const { totals } = computeShopComparisonStats(items, sales, shops);
    expect(totals.revenue).toBe(4000); // 1000 (shopA, non-cancelled) + 3000 (shopB)
    expect(totals.unitsSold).toBe(6); // 3 + 2 + 1
    expect(totals.outOfStockCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/reports/dashboardStats.test.js`
Expected: FAIL — `./dashboardStats` doesn't exist yet.

- [ ] **Step 3: Create `src/reports/dashboardStats.js`**

```js
import { itemInventoryValue, reorderThresholdInBase } from '../lib/units';

const EMPTY_BUCKET = { inventoryValue: 0, lowStockCount: 0, outOfStockCount: 0, revenue: 0, unitsSold: 0, profit: 0 };

export function computeShopComparisonStats(items, sales, shops) {
  const byShop = {};
  shops.forEach((s) => { byShop[s.id] = { shopId: s.id, shopName: s.name, ...EMPTY_BUCKET }; });

  items.forEach((item) => {
    const bucket = byShop[item.shopId];
    if (!bucket) return;
    bucket.inventoryValue += itemInventoryValue(item);
    const threshold = reorderThresholdInBase(item);
    if (item.quantity <= 0) bucket.outOfStockCount += 1;
    else if (item.quantity <= threshold) bucket.lowStockCount += 1;
  });

  sales.filter((sale) => !sale.cancelled).forEach((sale) => {
    const bucket = byShop[sale.shopId];
    if (!bucket) return;
    bucket.revenue += sale.total;
    bucket.profit += sale.totalProfit || 0;
    bucket.unitsSold += sale.items.reduce((sum, line) => sum + line.qty, 0);
  });

  const perShop = Object.values(byShop);
  const totals = perShop.reduce((acc, b) => ({
    inventoryValue: acc.inventoryValue + b.inventoryValue,
    lowStockCount: acc.lowStockCount + b.lowStockCount,
    outOfStockCount: acc.outOfStockCount + b.outOfStockCount,
    revenue: acc.revenue + b.revenue,
    unitsSold: acc.unitsSold + b.unitsSold,
    profit: acc.profit + b.profit,
  }), { ...EMPTY_BUCKET });

  return { perShop, totals };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/reports/dashboardStats.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Create `src/reports/pdfExport.js`**

```js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { currency } from '../lib/format';

export function exportSalesReportPdf(sales, { title = 'Sales Report' } = {}) {
  const docPdf = new jsPDF();
  docPdf.text(title, 14, 16);
  autoTable(docPdf, {
    startY: 22,
    head: [['Receipt', 'Date', 'Shop', 'Total', 'Profit', 'Status']],
    body: sales.map((s) => [
      s.receiptNo, new Date(s.timestamp).toLocaleDateString(), s.shopId,
      currency(s.total), currency(s.totalProfit || 0), s.cancelled ? 'Cancelled' : 'Completed',
    ]),
  });
  docPdf.save(`${title.replace(/\s+/g, '_')}.pdf`);
}

export function exportInventoryReportPdf(items, { title = 'Inventory Report' } = {}) {
  const docPdf = new jsPDF();
  docPdf.text(title, 14, 16);
  autoTable(docPdf, {
    startY: 22,
    head: [['SKU', 'Name', 'Model', 'Vehicle', 'Shop', 'Qty', 'Price']],
    body: items.map((it) => [
      it.sku, it.name, it.batteryModel || '', it.vehicleType || '', it.shopId,
      String(it.quantity), currency(it.sellingPrice || 0),
    ]),
  });
  docPdf.save(`${title.replace(/\s+/g, '_')}.pdf`);
}
```

- [ ] **Step 6: Manual verification**

After Task 18 wires this in, click "Export PDF" on both the sales report
and inventory report from the Owner dashboard and confirm a readable PDF
downloads with the expected columns and rows.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add cross-shop dashboard stats aggregation and PDF export

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 18: Owner dashboard, per-shop reports, and sales history UI

**Files:**
- Create: `src/reports/useSales.js`
- Create: `src/reports/useMovementsLog.js`
- Create: `src/reports/OwnerDashboard.jsx`
- Create: `src/reports/ShopReports.jsx`
- Create: `src/reports/SalesHistory.jsx`

**Interfaces:**
- Produces: `useSales({ role, shopId }): sales[]` (live, same owner-sees-all/others-scoped pattern as `useItems`), `useMovementsLog({ role, shopId }): movements[]` — consumed by both dashboard screens.
- Consumes: `computeShopComparisonStats`, `exportSalesReportPdf`, `exportInventoryReportPdf` (Task 17), `useItems` (Task 10), `useShops` (Task 6), `useUsers` (Task 7), `currency` (Task 1), `cancelSale` (Task 11), `can` from `src/lib/permissions.js` (Task 4).

No new pure logic here beyond what Task 17 already tests — this is UI
assembly over already-tested aggregation. Verification is manual (Step 4).

`SalesHistory.jsx` is what actually exercises `cancelSale` from Task 11 —
without it, the tested-but-unused gap where a Cashier's own sales and an
Owner/Admin's full transaction history (with the ability to cancel a
sale) were never wired into any screen. `can(role, 'cancelSales')` gates
the Cancel button so only Owner/Admin sees it, matching the permission
table (Shop Manager and Cashier both get "—" there) and the
`firestore.rules` `sales` update rule from Task 2, which independently
enforces the same restriction.

- [ ] **Step 1: Create `src/reports/useSales.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useSales({ role, shopId }) {
  const [sales, setSales] = useState([]);
  useEffect(() => {
    const salesQuery = role === 'owner'
      ? query(collection(db, 'sales'), orderBy('timestamp', 'desc'))
      : query(collection(db, 'sales'), where('shopId', '==', shopId), orderBy('timestamp', 'desc'));
    return onSnapshot(salesQuery, (snap) => setSales(snap.docs.map((d) => d.data())));
  }, [role, shopId]);
  return sales;
}
```

- [ ] **Step 2: Create `src/reports/useMovementsLog.js`**

```js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

export function useMovementsLog({ role, shopId }, rowLimit = 100) {
  const [movements, setMovements] = useState([]);
  useEffect(() => {
    const movementsQuery = role === 'owner'
      ? query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(rowLimit))
      : query(collection(db, 'movements'), where('shopId', '==', shopId), orderBy('timestamp', 'desc'), limit(rowLimit));
    return onSnapshot(movementsQuery, (snap) => setMovements(snap.docs.map((d) => d.data())));
  }, [role, shopId, rowLimit]);
  return movements;
}
```

- [ ] **Step 3: Create `src/reports/OwnerDashboard.jsx`**

```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useItems } from '../inventory/useItems';
import { useSales } from './useSales';
import { useMovementsLog } from './useMovementsLog';
import { useShops } from '../shops/useShops';
import { useUsers } from '../users/useUsers';
import { computeShopComparisonStats } from './dashboardStats';
import { exportSalesReportPdf, exportInventoryReportPdf } from './pdfExport';
import { currency } from '../lib/format';

export default function OwnerDashboard() {
  const items = useItems({ role: 'owner' });
  const sales = useSales({ role: 'owner' });
  const movements = useMovementsLog({ role: 'owner' });
  const shops = useShops();
  const users = useUsers();

  const { perShop, totals } = computeShopComparisonStats(items, sales, shops);

  return (
    <div className="owner-dashboard">
      <h2>All Shops Overview</h2>

      <div className="dashboard-stat-row">
        <div className="stat-tile"><span>Inventory value</span><strong>{currency(totals.inventoryValue)}</strong></div>
        <div className="stat-tile"><span>Low stock</span><strong>{totals.lowStockCount}</strong></div>
        <div className="stat-tile"><span>Out of stock</span><strong>{totals.outOfStockCount}</strong></div>
        <div className="stat-tile"><span>Revenue</span><strong>{currency(totals.revenue)}</strong></div>
        <div className="stat-tile"><span>Profit</span><strong>{currency(totals.profit)}</strong></div>
      </div>

      <h3>Shop comparison</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={perShop}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="shopName" />
          <YAxis />
          <Tooltip formatter={(value) => currency(value)} />
          <Bar dataKey="revenue" fill="#c1272d" />
        </BarChart>
      </ResponsiveContainer>

      <table className="dashboard-shop-table">
        <thead>
          <tr><th>Shop</th><th>Inventory value</th><th>Low stock</th><th>Out of stock</th><th>Revenue</th><th>Units sold</th><th>Profit</th></tr>
        </thead>
        <tbody>
          {perShop.map((s) => (
            <tr key={s.shopId}>
              <td>{s.shopName}</td><td>{currency(s.inventoryValue)}</td><td>{s.lowStockCount}</td>
              <td>{s.outOfStockCount}</td><td>{currency(s.revenue)}</td><td>{s.unitsSold}</td><td>{currency(s.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dashboard-export-buttons">
        <button onClick={() => exportSalesReportPdf(sales, { title: 'All Shops — Sales Report' })}>Export sales PDF</button>
        <button onClick={() => exportInventoryReportPdf(items, { title: 'All Shops — Inventory Report' })}>Export inventory PDF</button>
      </div>

      <h3>Users</h3>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Shop</th></tr></thead>
        <tbody>
          {users.map((u) => {
            const shop = shops.find((s) => s.id === u.shopId);
            return <tr key={u.uid}><td>{u.fullName}</td><td>{u.role}</td><td>{shop?.name || '—'}</td></tr>;
          })}
        </tbody>
      </table>

      <h3>Activity log</h3>
      <ul className="dashboard-activity-log">
        {movements.map((m) => (
          <li key={m.id}>{new Date(m.timestamp).toLocaleString()} — {m.type === 'in' ? 'Received' : 'Issued'} {m.qty} × {m.itemId} ({m.reason})</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/reports/ShopReports.jsx`**

```jsx
import { useItems } from '../inventory/useItems';
import { useSales } from './useSales';
import { exportSalesReportPdf, exportInventoryReportPdf } from './pdfExport';
import { currency } from '../lib/format';
import { itemInventoryValue } from '../lib/units';

export default function ShopReports({ shopId, shopName }) {
  const items = useItems({ role: 'manager', shopId });
  const sales = useSales({ role: 'manager', shopId });
  const activeSales = sales.filter((s) => !s.cancelled);

  const revenue = activeSales.reduce((s, sale) => s + sale.total, 0);
  const profit = activeSales.reduce((s, sale) => s + (sale.totalProfit || 0), 0);
  const inventoryValue = items.reduce((s, it) => s + itemInventoryValue(it), 0);

  return (
    <div className="shop-reports">
      <h2>{shopName} — Reports</h2>
      <div className="dashboard-stat-row">
        <div className="stat-tile"><span>Inventory value</span><strong>{currency(inventoryValue)}</strong></div>
        <div className="stat-tile"><span>Revenue</span><strong>{currency(revenue)}</strong></div>
        <div className="stat-tile"><span>Profit</span><strong>{currency(profit)}</strong></div>
      </div>
      <div className="dashboard-export-buttons">
        <button onClick={() => exportSalesReportPdf(sales, { title: `${shopName} — Sales Report` })}>Export sales PDF</button>
        <button onClick={() => exportInventoryReportPdf(items, { title: `${shopName} — Inventory Report` })}>Export inventory PDF</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/reports/SalesHistory.jsx`**

```jsx
import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useSales } from './useSales';
import { cancelSale } from '../pos/salesActions';
import { can } from '../lib/permissions';
import { currency } from '../lib/format';
import { db } from '../firebase';

// Owner/Admin sees every shop's sales (role === 'owner' already makes
// useSales fetch everything); a Cashier sees only their own — filtered
// here rather than in useSales, since "my sales" isn't a shop-scoping
// concern, it's a per-cashier one on top of the shop scope already
// applied by useSales for non-owner roles.
export default function SalesHistory({ role, shopId, userId }) {
  const allSales = useSales({ role, shopId });
  const sales = role === 'cashier' ? allSales.filter((s) => s.cashierId === userId) : allSales;
  const [error, setError] = useState('');

  async function handleCancel(sale) {
    setError('');
    try {
      await cancelSale(db, sale);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="sales-history">
      <h2><Receipt size={18} /> {role === 'cashier' ? 'My Sales' : 'Sales History'}</h2>
      {error && <p className="sales-history-error">{error}</p>}
      <table>
        <thead>
          <tr><th>Receipt</th><th>Date</th><th>Total</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{s.receiptNo}</td>
              <td>{new Date(s.timestamp).toLocaleString()}</td>
              <td>{currency(s.total)}</td>
              <td>{s.cancelled ? 'Cancelled' : 'Completed'}</td>
              <td>
                {!s.cancelled && can(role, 'cancelSales') && (
                  <button onClick={() => handleCancel(s)}>Cancel</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add owner cross-shop dashboard, per-shop reports, and sales history UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

- [ ] **Step 7: Manual verification**

Log in as Owner/Admin and confirm the dashboard's totals match summing
each shop's numbers by hand for a small seeded dataset, the bar chart
renders one bar per shop, and both PDF exports download successfully. Log
in as a Shop Manager and confirm `ShopReports` only shows their own
shop's numbers. Then, as Owner/Admin, open Sales History and cancel a
completed sale, confirming the item's stock is restored (Task 11's
`cancelSale`) and the row now shows "Cancelled"; as a Cashier, confirm
"My Sales" shows only that cashier's own transactions with no Cancel
button.

---

## Task 19: Barcode generation and scanning

**Files:**
- Create: `src/barcode/BarcodeImage.jsx`
- Create: `src/barcode/useBarcodeScanner.js`
- Test: `src/barcode/useBarcodeScanner.test.js`

**Interfaces:**
- Produces: `<BarcodeImage value={string} />` (renders a JsBarcode SVG for the given barcode value) — usable from `ItemForm.jsx`/receipt printing wherever a barcode needs to be shown or printed.
- Produces: `useBarcodeScanner(onScan: (value: string) => void)` — attaches a global keydown listener that recognizes a hardware barcode scanner's rapid keystroke-then-Enter pattern and calls `onScan` with the accumulated value, ignoring normal human typing speed. Consumed by `POSView.jsx` if barcode-scan-to-add-to-cart is wired in later (optional enhancement, not required for Task 12 to already work via manual search).
- Consumes: nothing from earlier tasks (JsBarcode is an external library).

The keystroke-timing classifier is extracted as its own pure function
specifically so it's unit-testable without simulating real DOM keyboard
events — this was flagged in the original `depot-app` review as prone to
misreading fast human typing as a scan; testing the threshold logic in
isolation is how this plan avoids repeating that.

- [ ] **Step 1: Write the failing tests for the keystroke classifier**

```js
// src/barcode/useBarcodeScanner.test.js
import { describe, it, expect } from 'vitest';
import { isLikelyScannerBurst } from './useBarcodeScanner';

describe('isLikelyScannerBurst', () => {
  it('treats a sub-40ms gap between keystrokes as scanner input', () => {
    expect(isLikelyScannerBurst(30)).toBe(true);
  });

  it('treats a human typing-speed gap (150ms+) as NOT a scan', () => {
    expect(isLikelyScannerBurst(150)).toBe(false);
  });

  it('treats exactly the 40ms boundary as still human (not a scan)', () => {
    expect(isLikelyScannerBurst(40)).toBe(false);
  });

  it('treats the very first keystroke (no prior gap, null) as NOT a scan on its own', () => {
    expect(isLikelyScannerBurst(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/barcode/useBarcodeScanner.test.js`
Expected: FAIL — `./useBarcodeScanner` doesn't exist yet.

- [ ] **Step 3: Create `src/barcode/useBarcodeScanner.js`**

```js
import { useEffect, useRef } from 'react';

const SCAN_GAP_MS = 40;
const SCAN_MIN_LENGTH = 4;

export function isLikelyScannerBurst(gapMs) {
  return gapMs != null && gapMs < SCAN_GAP_MS;
}

export function useBarcodeScanner(onScan) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // never intercept while typing in a field

      const now = performance.now();
      const gap = lastKeyTimeRef.current != null ? now - lastKeyTimeRef.current : null;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= SCAN_MIN_LENGTH) onScan(bufferRef.current);
        bufferRef.current = '';
        return;
      }
      if (e.key.length !== 1) return; // ignore Shift, Ctrl, arrow keys, etc.

      if (!isLikelyScannerBurst(gap) && bufferRef.current.length > 0) {
        bufferRef.current = ''; // gap too long mid-sequence — this wasn't a scan, reset
      }
      bufferRef.current += e.key;
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/barcode/useBarcodeScanner.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Create `src/barcode/BarcodeImage.jsx`**

```jsx
import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeImage({ value, height = 50 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!value || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, { format: 'CODE128', height, displayValue: true });
    } catch {
      // Invalid barcode value (e.g. empty/malformed) — leave the SVG blank rather than crashing the screen.
    }
  }, [value, height]);

  return <svg ref={svgRef} />;
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add barcode generation and hardware-scanner keystroke detection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

---

## Task 20: App shell — sidebar, routing, auth gate, branding

**Files:**
- Create: `src/shared/Sidebar.jsx`
- Modify: `src/App.jsx` (replace the Task 1 stub)
- Create: `src/index.css`
- Modify: `src/main.jsx` (import the stylesheet)

**Interfaces:**
- Consumes every screen component and hook from Tasks 5–19 (`useAuth`, `LoginScreen`, `Sidebar`, `InventoryList`, `POSView`, `DamageReportsView`, `TransfersView`, `ShopsView`, `UsersView`, `CatalogManager`, `OwnerDashboard`, `ShopReports`, `SalesHistory`, `can`).
- Produces nothing further — this is the top of the component tree.

This task has no new pure logic to unit test; it's wiring already-tested
pieces together behind the auth/role gate. Verification is manual
(Step 4), covering the full login → role-appropriate nav → screen access
flow end to end.

- [ ] **Step 1: Create `src/shared/Sidebar.jsx`**

```jsx
import { LayoutGrid, Boxes, ShoppingCart, AlertTriangle, Truck, Store, ShieldCheck, Tag, Receipt, LogOut } from 'lucide-react';
import { can } from '../lib/permissions';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, permission: null },
  { key: 'pos', label: 'POS', icon: ShoppingCart, permission: 'pos' },
  { key: 'inventory', label: 'Inventory', icon: Boxes, permission: 'viewInventory' },
  { key: 'catalog', label: 'Categories/Locations/Suppliers', icon: Tag, permission: 'manageCategories' },
  { key: 'damage', label: 'Damaged/Returned', icon: AlertTriangle, permission: 'reportDamage' },
  { key: 'transfers', label: 'Branch Transfers', icon: Truck, permission: 'initiateTransfer' },
  // Gated on 'viewOwnSales' specifically (not 'viewSalesReports'): that
  // permission is true for Owner and Cashier and false for Manager in
  // src/lib/permissions.js, which happens to be exactly the set of roles
  // that should see this nav item — Owner sees every sale, Cashier sees
  // only their own (SalesHistory.jsx itself branches on role for which).
  { key: 'sales', label: 'Sales History', icon: Receipt, permission: 'viewOwnSales' },
  { key: 'shops', label: 'Shops', icon: Store, permission: 'manageShops' },
  { key: 'users', label: 'Users', icon: ShieldCheck, permission: 'manageUsers' },
];

export default function Sidebar({ view, setView, role, fullName, onLogout }) {
  return (
    <nav className="sidebar">
      <img src="/branding/motolite-logo.png" alt="Motolite" className="sidebar-logo" />
      <p className="sidebar-user">{fullName} ({role})</p>
      <ul>
        {NAV_ITEMS.filter((item) => item.permission === null || can(role, item.permission)).map((item) => (
          <li key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>
            <item.icon size={16} /> {item.label}
          </li>
        ))}
      </ul>
      <button className="sidebar-logout" onClick={onLogout}><LogOut size={16} /> Sign out</button>
    </nav>
  );
}
```

- [ ] **Step 2: Replace `src/App.jsx`**

```jsx
import { useState } from 'react';
import { useAuth } from './auth/useAuth';
import LoginScreen from './auth/LoginScreen';
import Sidebar from './shared/Sidebar';
import InventoryList from './inventory/InventoryList';
import POSView from './pos/POSView';
import DamageReportsView from './damage/DamageReportsView';
import TransfersView from './transfers/TransfersView';
import ShopsView from './shops/ShopsView';
import UsersView from './users/UsersView';
import CatalogManager from './catalog/CatalogManager';
import OwnerDashboard from './reports/OwnerDashboard';
import ShopReports from './reports/ShopReports';
import SalesHistory from './reports/SalesHistory';
import { useShops } from './shops/useShops';

export default function App() {
  const { user, profile, role, loading, login, logout, resetPassword } = useAuth();
  const [view, setView] = useState('overview');
  const shops = useShops();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <LoginScreen onLogin={login} onResetPassword={resetPassword} />;
  if (!profile) {
    return (
      <div className="app-no-profile">
        No account profile found. Ask your Owner/Admin to set up your account, then sign in again.
        <button onClick={logout}>Sign out</button>
      </div>
    );
  }
  if (profile.active === false) {
    return (
      <div className="app-deactivated">
        Your account has been deactivated. Contact your Owner/Admin.
        <button onClick={logout}>Sign out</button>
      </div>
    );
  }

  const shopId = profile.shopId;
  const shopName = shops.find((s) => s.id === shopId)?.name || '';

  function renderView() {
    switch (view) {
      case 'pos': return <POSView role={role} shopId={shopId} cashierId={user.uid} cashierEmail={user.email} />;
      case 'inventory': return <InventoryList role={role} shopId={shopId} />;
      case 'catalog': return <CatalogManager />;
      case 'damage': return <DamageReportsView role={role} shopId={shopId} userId={user.uid} />;
      case 'transfers': return <TransfersView role={role} shopId={shopId} userId={user.uid} />;
      case 'sales': return <SalesHistory role={role} shopId={shopId} userId={user.uid} />;
      case 'shops': return <ShopsView />;
      case 'users': return <UsersView />;
      case 'overview':
      default:
        return role === 'owner' ? <OwnerDashboard /> : <ShopReports shopId={shopId} shopName={shopName} />;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} role={role} fullName={profile.fullName} onLogout={logout} />
      <main className="app-main">{renderView()}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create a minimal `src/index.css`**

```css
:root {
  --motolite-red: #c1272d;
  font-family: 'Segoe UI', Arial, sans-serif;
}
body { margin: 0; background: #f5f5f5; }
.app-shell { display: flex; min-height: 100vh; }
.sidebar { width: 220px; background: #1c1c1c; color: #fff; padding: 16px; display: flex; flex-direction: column; }
.sidebar-logo { width: 64px; height: 64px; border-radius: 50%; align-self: center; margin-bottom: 8px; }
.sidebar ul { list-style: none; padding: 0; flex: 1; }
.sidebar li { padding: 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.sidebar li.active, .sidebar li:hover { background: var(--motolite-red); }
.app-main { flex: 1; padding: 24px; overflow-x: auto; }
.login-screen { max-width: 360px; margin: 80px auto; text-align: center; }
.login-logo { width: 96px; height: 96px; border-radius: 50%; }
.low-stock { background: #fff3cd; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
.dashboard-stat-row { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.stat-tile { background: #fff; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.stat-tile span { display: block; font-size: 12px; color: #666; }
.stat-tile strong { font-size: 20px; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.modal form { background: #fff; padding: 20px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; min-width: 280px; }
```

- [ ] **Step 4: Update `src/main.jsx` to import the stylesheet**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Assemble app shell: sidebar nav, role-gated routing, auth states

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

- [ ] **Step 6: Manual end-to-end verification**

Run `npm run dev` against a real (or emulated) Firebase project seeded via
`scripts/create-owner.js`. Sign in as the Owner/Admin, create a shop, create
a Manager and a Cashier assigned to it, sign out, sign back in as each and
confirm the sidebar only shows what their role allows and every screen's
data is scoped to their shop (attempting to view another shop's data
should be impossible, not just hidden).

---

## Task 21: Full verification, build, and delivery

**Files:**
- Create: `README.md` (setup instructions for the buyer)
- No source files modified — this task runs the full suite and ships the result.

**Interfaces:** none — terminal task.

- [ ] **Step 1: Run every unit test (no emulator needed)**

Run: `npx vitest run --exclude "**/*.test.js" --include "src/lib/**/*.test.js" "src/barcode/**/*.test.js" "src/reports/dashboardStats.test.js"`

Simpler equivalent: run the whole suite via the emulator wrapper (Step 2)
since it covers both emulator-dependent and pure tests together; this
step exists only as a fast pre-check. Expected: all pure-logic tests PASS.

- [ ] **Step 2: Run the full test suite against the emulator**

Run: `npx firebase emulators:exec "vitest run" --project motolite-ims-test`
Expected: every test file from Tasks 1–19 PASSES (unit tests + Security
Rules tests + Firestore-transaction integration tests together).

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: builds successfully with no errors (Firebase env vars can still
be empty at build time — they're read at runtime).

- [ ] **Step 4: Write `README.md`**

```markdown
# Motolite Inventory & POS Management System

## First-time setup

1. Create a Firebase project at https://console.firebase.google.com (this
   is YOUR project — you own and control it, there is no third-party
   subscription involved).
2. Enable **Authentication** (Email/Password provider) and **Firestore
   Database** in that project.
3. In Firebase Console → Project Settings → General, register a Web App
   and copy its config values into a new `.env` file in this project
   (copy `.env.example` to `.env` and fill in each `VITE_FIREBASE_*` value).
4. Deploy the security rules: `npx firebase deploy --only firestore:rules`
   (run `npx firebase login` and `npx firebase use --add` first to link
   this folder to your Firebase project).
5. In Firebase Console → Project Settings → Service Accounts, generate a
   private key and save it as `service-account.json` in this project's
   root (already gitignored — never commit it).
6. Create your Owner/Admin account:
   `node scripts/create-owner.js you@yourbusiness.com "Your Name"`
   — it prints a temporary password. Sign in with it and change it via
   "Forgot password" on the login screen.
7. Install dependencies and start the app: `npm install && npm run dev`

## Day-to-day use

- Sign in as Owner/Admin to create shops (Shops screen) and create Shop
  Manager / Cashier accounts assigned to those shops (Users screen).
- Each Shop Manager/Cashier only ever sees their own shop's data — this
  is enforced by both the app and Firestore's security rules.
- Run `npm run build` then deploy the `dist/` folder to any static hosting
  (Firebase Hosting is a natural fit: `npx firebase deploy --only hosting`
  after `npx firebase init hosting`, or any other static host).
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add setup README; final verification pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011RdwsjMgxMcLYVSS1huNvP"
```

- [ ] **Step 6: Deliver to the user's computer**

Write every file from this project (all of `src/`, `public/branding/`,
`firebase.json`, `firestore.rules`, `firestore.indexes.json`,
`package.json`, `vite.config.js`, `index.html`, `.gitignore`,
`.env.example`, `scripts/create-owner.js`, `README.md`, this plan and
spec under `docs/`) to `C:\Users\Admin\Projects\motolite-ims` on the
user's computer via the device file bridge (`device_commit_files`), since
the assistant cannot execute `npm install`/`git init` there directly. Tell
the user to run `npm install` and follow the README's first-time setup
before `npm run dev`.

---
