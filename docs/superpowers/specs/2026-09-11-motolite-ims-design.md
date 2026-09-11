# Motolite Inventory & POS Management System — Design

## Context

The existing `depot-app` is a React + Firebase (Auth + Firestore) inventory/
POS system built as a resellable SaaS product: a `superadmin` role manages
many different `client` businesses on subscription, each `client` (Client
Admin) runs their own shops and staff.

This project (`motolite-ims`) is a **new, separate project** adapted from
`depot-app`'s codebase, built for one specific business — a Motolite battery
retailer — to be sold and handed over as a complete, owned product (a single
license, run under the buyer's own Firebase project). It is not a
multi-business SaaS platform: there is exactly one business, with multiple
shops/branches under it.

## Scope decisions (confirmed with user)

- **New, separate project**, not a modification of `depot-app` in place —
  `depot-app`'s code is a reference/base to adapt, not to edit directly.
- **"Not SaaS"** means: no third-party subscription vendor. The buyer owns
  their own Firebase project and runs the app themselves. A shared backend
  across shops is required and expected — that's not what "not SaaS" ruled
  out.
- **Backend:** keep Firebase (Auth + Firestore), same approach as
  `depot-app` today, including the concurrency-safe transaction pattern
  from the recent stock-corruption/oversell fixes. The buyer sets up and
  owns the Firebase project; this project is not hosted or billed by the
  developer.
- **Three roles**, replacing today's `superadmin`/`client`/`staff`:
  - **Owner/Admin** — full access to everything, across every shop.
  - **Shop Manager** — full inventory control, stock transfers, and
    reports, scoped to their one assigned shop. No POS access.
  - **Cashier/Staff** — POS access, read-only inventory view, stock
    receive/issue, and their own sales history, scoped to their one
    assigned shop.
- **Shop assignment is a hard boundary** for Shop Manager and Cashier
  roles — enforced in Firestore queries/rules, not just hidden in the UI.
  (Today's `activeShopId` is a freely-switchable UI preference for anyone;
  that changes for these two roles.)
- **Battery-specific product fields:** battery model/part number (e.g.
  N50, NS40), voltage & capacity (Ah/CCA), warranty period (months), and
  vehicle type/application (motorcycle/car/truck/etc.).
- **Damaged/returned/defective stock** goes through a log + approval
  workflow, not an instant write-off.
- **Branch-to-branch stock transfers** are two-step: sender ships
  (deducts immediately), receiver confirms (adds to their stock), with a
  `disputed` state for quantity mismatches.
- **Removed entirely:** the `superadmin` role, Client Accounts/
  subscription-billing screens, and any multi-business platform
  management — none of it applies to a single-business deployment.

## Architecture

Same stack as `depot-app`: React + Vite + Firebase (Auth + Firestore),
client-side business logic (unit-of-measure cascade math, pricing,
barcode, PDF export, POS cart) carried over largely as-is. The structural
changes are: (1) a simplified two-tier role model instead of three, (2)
hard shop-scoping enforced at the data layer instead of a soft UI filter,
and (3) two new collections (`damageReports`, `transfers`) with their own
approval-driven state machines, built using the same transactional,
re-read-fresh-data-before-writing pattern already used for POS checkout
and sale cancellation.

## Role model & permissions

| Permission | Owner/Admin | Shop Manager | Cashier/Staff |
|---|---|---|---|
| View/edit/delete inventory | all shops | own shop only | view-only, own shop |
| Manage categories/suppliers/locations | all shops | own shop | — |
| Stock receive/issue | all shops | own shop | own shop |
| Edit pricing/markup | all shops | own shop | — |
| POS | all shops | — | own shop |
| Cancel sales | all shops | — | — |
| Initiate/confirm branch transfers | all shops | own shop | — |
| Approve/reject damage reports | all shops | own shop | report only (not approve) |
| Own-shop reports | all shops | own shop | — |
| Own sales history | all shops | — | own shop |
| Cross-shop consolidated reports/dashboard | yes | — | — |
| Manage users, assign shops, manage roles | yes | — | — |
| Create/edit/delete shops | yes | — | — |

Every user document carries a `shopId` (Owner/Admin's is ignored — they
see all shops regardless). Every Firestore query for a Shop Manager or
Cashier is scoped with a `where('shopId', '==', myShopId)` clause (or
equivalent Firestore Security Rule), not merely filtered client-side after
an unscoped fetch, so a restricted user's client literally cannot retrieve
another shop's documents even by inspecting network traffic or modifying
client code.

## Product model

Items keep the existing generic shape (sku, name, unit-of-measure
breakdown, pricing, quantity, category, location, supplier, barcode) and
gain:

- `batteryModel` (string, e.g. "N50", "NS40")
- `voltage` (number, e.g. 12)
- `capacity` (string, e.g. "35Ah / 320CCA")
- `warrantyMonths` (number)
- `vehicleType` (freeform string, e.g. "Motorcycle", "Car", "Truck" — a
  plain text field with a suggestions dropdown of previously-used values,
  same pattern the existing app already uses for categories/locations,
  rather than a hardcoded fixed list)

`vehicleType` is filterable in both the Inventory list and the POS product
search, alongside the existing SKU/name search.

## Damaged/returned/defective stock

New `damageReports` collection: `id, itemId, shopId, quantity, reason`
(`damaged` | `returned` | `defective`), `reportedBy, reportedAt, status`
(`pending` | `approved` | `rejected`), `resolvedBy, resolvedAt`.

Reporting one runs inside a transaction that re-reads the item fresh,
reserves the quantity out of sellable stock (added to a `reservedForReview`
count so `cascadeDeductUnit`/low-stock calculations treat it as
unavailable, without yet touching `quantity`/`unitStock`), and writes the
report as `pending`. An Owner/Admin (any shop) or that shop's Manager can
then approve (permanently deducts from `quantity`/`unitStock`, releases
the reservation, writes a movement record) or reject (releases the
reservation back to sellable stock, no deduction) — both paths re-read the
item fresh inside a transaction, same pattern as the POS fixes.

## Branch-to-branch transfers

New `transfers` collection: `id, itemId, fromShopId, toShopId, quantity,
status` (`in_transit` | `received` | `disputed`), `initiatedBy,
initiatedAt, confirmedBy, confirmedAt, confirmedQuantity`.

Initiating a transfer (Shop Manager or Owner/Admin) runs a transaction
that re-reads the source item fresh, deducts the quantity via the existing
cascade logic (shortfall aborts the transfer, same as an oversell check),
and writes the transfer as `in_transit` plus an `out` movement on the
source shop. The destination shop's Manager (or an Owner/Admin) confirms
receipt: entering a quantity that matches adds it to the destination
shop's stock (creating the item there if it doesn't already exist, mirrory
of today's "assign to staff" top-up-or-create logic) and marks `received`;
a mismatched quantity marks the transfer `disputed` instead of silently
trusting either side, leaving it for an Owner/Admin to resolve manually
(adjust and mark received, or write off the difference). Both legs write
movement records for full traceability.

## Owner/Admin dashboard

A dedicated overview screen, built on the existing recharts setup used for
the current app's reporting:

- Rolled-up stats across all shops: total inventory value, low-stock and
  out-of-stock counts, today's/this-period's sales — each with a per-shop
  breakdown table underneath the headline number.
- A shop performance comparison chart: one bar per shop, selectable
  metric (revenue, units sold, profit) and date range.
- Consolidated sales and inventory reports, filterable to one shop or
  "all shops" (reusing the existing PDF export).
- A user management table: every user, their role, their assigned shop,
  editable inline (change role, reassign shop, deactivate).
- An activity/movement log spanning every shop, including transfers and
  damage-report resolutions alongside the existing stock in/out and sale
  history.

## What's reused vs. removed from `depot-app`

**Reused as-is (data access adjusted for the new schema, logic
unchanged):** unit-of-measure model and cascading break-open deduction,
pricing/markup math, POS cart and checkout (including the Firestore
`runTransaction`-based concurrency-safe stock deduction), sale
cancellation (including the unitStock-restore fix), barcode generation
and scanning, PDF report export, Firebase Auth account flow for
individual users (signup/login/password reset — just without the
Client Admin subscription-approval step).

**Removed entirely:** `superadmin` role and permissions, Client Accounts /
subscription-billing screens and data model, platform-wide Activity Log
spanning multiple businesses (replaced by the single-business Owner/Admin
dashboard above), the free-switch `activeShopId` pattern for
Shop Manager/Cashier roles (replaced by hard per-user shop assignment).

## Data model summary (Firestore collections)

| Collection | Key fields |
|---|---|
| `users` | uid, email, role (`owner`/`manager`/`cashier`), shopId (ignored for owner), fullName |
| `shops` | id, name, createdAt |
| `items` | existing fields + batteryModel, voltage, capacity, warrantyMonths, vehicleType, shopId, reservedForReview |
| `movements` | itemId, shopId, type, qty, reason, timestamp |
| `sales` | existing shape, shopId, cashierId |
| `restocks` | existing shape, shopId |
| `damageReports` | itemId, shopId, quantity, reason, reportedBy, status, resolvedBy |
| `transfers` | itemId, fromShopId, toShopId, quantity, status, initiatedBy, confirmedBy, confirmedQuantity |
| `categories`, `locations`, `suppliers` | existing shape, single-business scoped (no per-Client-Admin partitioning needed) |

## Testing approach

- Unit tests for the pure logic (`cascadeDeductUnit`, `computeSellingPrice`,
  etc.) carried over from `depot-app`, including the existing regression
  cases (unitStock restore on cancel, oversell prevention).
- New tests specifically for the two new state machines:
  - Damage report: approve after a concurrent stock change re-reads
    fresh data and doesn't double-deduct; reject correctly releases the
    reservation; a shortfall (reserved quantity exceeds current stock,
    e.g. from a since-corrected item edit) is handled explicitly rather
    than going negative.
  - Transfer: matching-quantity receipt adds stock correctly (including
    creating the item at the destination if it doesn't exist yet);
    mismatched quantity marks `disputed` instead of silently trusting the
    input; a transfer can't be confirmed twice.
- Shop-scoping tests: a Shop Manager/Cashier query for another shop's
  items/sales/movements returns nothing (or is rejected), not merely
  filtered after the fact — verified against the actual Firestore query
  construction, not just a UI-level check.

## Delivery mechanism

Same approach as prior work in this codebase: development and testing
happen in the assistant's own cloud workspace (full Node/npm/git
toolchain available there), then finished files are written directly onto
the user's computer at `C:\Users\Admin\Projects\motolite-ims` via the
device file bridge. The assistant cannot execute commands on the user's
computer, so the user runs `npm install` and `npm run dev` (and sets up
their own Firebase project/config) themselves once the files are in
place.
