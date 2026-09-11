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
4. Deploy the security rules and composite indexes: `npx firebase deploy
   --only firestore` (run `npx firebase login` and `npx firebase use --add`
   first to link this folder to your Firebase project). This deploys both
   `firestore.rules` and `firestore.indexes.json` — several report/history
   screens (Sales, Damage Reports, Movements Log, Transfers) combine a
   shop-scoped `where` with an `orderBy` and will fail to load for any
   non-Owner role without those composite indexes.
5. **Run the full test suite once before going live** (important — see
   below for why): `npx firebase emulators:exec "vitest run" --project
   motolite-ims-test`

   This requires Java (the Firebase Emulator Suite runs on it) and
   outbound network access to Google's emulator download hosts, both of
   which are normally available on a developer machine. During this
   project's development, the sandboxed environment used to build it
   blocked network access to those emulator download hosts, so this
   command could not be executed there — but the tests it runs are real
   and important. They cover:
   - **Firestore Security Rules enforcement** — that a Shop Manager or
     Cashier genuinely cannot read or write another shop's data, and that
     each role can only do what it's meant to.
   - **Transactional stock-safety logic** — the Firestore transactions
     behind sales, sale cancellations, stock transfers, and damage-report
     approvals, which must never allow stock counts to go negative or
     become inconsistent under concurrent use.

   These behaviors were implemented and verified by careful code review
   throughout development, but they have never actually been executed
   against a live Firestore emulator. Running this command once, on a
   machine with normal internet access, is a genuine pre-production
   verification step — not routine boilerplate — and you should not
   consider this system production-ready until it passes cleanly on your
   machine.
6. In Firebase Console → Project Settings → Service Accounts, generate a
   private key and save it as `service-account.json` in this project's
   root (already gitignored — never commit it).
7. Create your Owner/Admin account:
   `node scripts/create-owner.js you@yourbusiness.com "Your Name"`
   — it prints a temporary password. Sign in with it and change it via
   "Forgot password" on the login screen.
8. Install dependencies and start the app: `npm install && npm run dev`

## Day-to-day use

- Sign in as Owner/Admin to create shops (Shops screen) and create Shop
  Manager / Cashier accounts assigned to those shops (Users screen).
- Each Shop Manager/Cashier only ever sees their own shop's data — this
  is enforced by both the app and Firestore's security rules.
- Run `npm run build` then deploy the `dist/` folder to any static hosting
  (Firebase Hosting is a natural fit: `npx firebase deploy --only hosting`
  after `npx firebase init hosting`, or any other static host).

## Known limitations / scope notes

- **Payment-method tracking and per-sale discounts are not built.** They
  came up as part of the original feature request, but were not included
  in the approved design spec that this implementation followed, so no
  sale in this system records a payment method (cash/card/etc.) or a
  discount amount. This is not a bug — it's simply not yet built. If you
  need either of these, they're a natural, self-contained follow-up
  feature to request.
- **A transfer to a shop that already stocks the same SKU under a
  different item id creates a second entry rather than merging.** Received
  stock is matched to a destination item by a deterministic id derived
  from the source item's id, not by SKU — so if that shop already has its
  own separately-created item for the same battery, the transfer creates a
  second item doc instead of adding to the existing one. If this happens,
  reconcile manually (merge the stock into one item and remove the
  duplicate) after confirming receipt.
- The production build currently emits one advisory warning from Vite
  about a JavaScript chunk larger than 500kB. The build still succeeds
  and the app works correctly; this is a performance optimization
  opportunity (code-splitting), not a defect, and was left as-is for this
  delivery.
