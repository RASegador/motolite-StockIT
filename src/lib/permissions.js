// Client-side convenience layer only. The Firestore Security Rules in
// firestore.rules are the actual enforcement boundary — this table exists
// so the UI can show/hide actions a user isn't allowed to take, but a bug
// here can never turn into a data leak on its own.
// "Manager Portal & Account Structure" spec: the system now has two
// primary roles, Admin and Manager (plus the pre-existing Warehouse login,
// which the spec doesn't mention removing). The role key itself is now
// `admin` (renamed from `owner`) — resolveRole() below transparently maps
// any EXISTING Firestore user doc still carrying the old `role: 'owner'`
// value onto `'admin'`, so the one pre-existing Owner/Admin account (there
// is exactly one, created out-of-band by scripts/create-owner.js) keeps
// working with no manual data migration required; firestore.rules'
// isAdmin() does the equivalent on the backend. The Cashier role is fully
// removed below — see resolveRole()'s comment and App.jsx's explicit block
// for what happens to an existing Cashier account.
export const PERMISSIONS = {
  admin: {
    viewInventory: true, editInventory: true, deleteInventory: true,
    manageCategories: true, manageSuppliers: true, manageLocations: true,
    stockReceive: true, stockIssue: true,
    // Admin is the central administrator/monitoring account for the whole
    // system — never a POS user. This is intentionally `false` (not a
    // config toggle): App.jsx's `case 'pos':` guard and Topbar's nav-item
    // filter both key off this single value, so flipping it here is
    // enough to remove POS from Admin's navigation AND block direct
    // navigation to it, with no other code changes required.
    pos: false,
    viewReports: true, viewSalesReports: true, print: true, cancelSales: true,
    initiateTransfer: true, confirmTransfer: true,
    reportDamage: true, approveDamage: true,
    manageUsers: true, manageShops: true, viewOwnSales: true,
    viewConsolidatedReports: true, viewActivityLog: true,
    createRestockRequest: true, reviewRestockRequest: true,
  },
  // Manager: no Categories, no Suppliers, no direct inventory edit — those
  // are Admin-only now (manageCategories/manageSuppliers/manageLocations
  // all false, which also hides the "Categories/Locations/Suppliers" nav
  // item entirely — see Topbar.jsx's NAV_ITEMS). `pos` is now true: with
  // Cashier removed, a Manager rings up sales at their own store directly
  // (see App.jsx's `case 'pos':` and the "Manager gets POS access"
  // decision behind this change). Manager still works exclusively through
  // the request workflow for STOCK itself — create a Restock/Transfer
  // Request, then receive/confirm what actually arrives — never a direct
  // stock edit, so editInventory/deleteInventory/stockReceive/stockIssue
  // stay false.
  manager: {
    viewInventory: true, editInventory: false, deleteInventory: false,
    manageCategories: false, manageSuppliers: false, manageLocations: false,
    stockReceive: false, stockIssue: false,
    pos: true, viewReports: true, viewSalesReports: true, print: true, cancelSales: false,
    initiateTransfer: true, confirmTransfer: true,
    reportDamage: true, approveDamage: true,
    manageUsers: false, manageShops: false, viewOwnSales: false,
    viewConsolidatedReports: false, viewActivityLog: false,
    // A store Manager can submit a Restock Request to the warehouse, but
    // reviewing/approving one is a Warehouse/Admin-only action per spec.
    createRestockRequest: true, reviewRestockRequest: false,
  },
  // Warehouse staff: their own login, scoped to one assigned warehouse
  // (a `shops` doc with `type: 'warehouse'` — see src/shops/shopActions.js).
  // They ship/receive stock and fulfill Restock Requests, but never touch
  // POS, never see the Admin's global dashboard, and never manage users or
  // system-wide settings — per the "Warehouse users should NOT" list. Per
  // the same "only Admin has direct authority to modify inventory" rule
  // applied to Manager above, `stockReceive`/`stockIssue` (the manual
  // Move-stock/Restock buttons) are false here too — shipping and
  // receiving stock happens exclusively through approving a Restock
  // Request (which starts a Transfer) and confirming that Transfer's
  // receipt, never a raw manual edit.
  warehouse: {
    viewInventory: true, editInventory: false, deleteInventory: false,
    manageCategories: false, manageSuppliers: false, manageLocations: false,
    stockReceive: false, stockIssue: false,
    pos: false, viewReports: true, viewSalesReports: false, print: true, cancelSales: false,
    initiateTransfer: true, confirmTransfer: true,
    reportDamage: true, approveDamage: true,
    manageUsers: false, manageShops: false, viewOwnSales: false,
    viewConsolidatedReports: false, viewActivityLog: false,
    createRestockRequest: true, reviewRestockRequest: true,
  },
};

export function can(role, permission) {
  return !!PERMISSIONS[role]?.[permission];
}

// A profile with no role, an unrecognized role, or the removed 'cashier'
// role all fall through to this default. `cashier` is deliberately no
// longer a key in PERMISSIONS above, and neither is this 'blocked'
// sentinel — `can('blocked', ...)` (like `can('cashier', ...)`) is false
// for every permission via the `?.` in can(), which is the point: an
// invalid/garbage profile should get the LEAST privilege available, never
// silently upgraded to `manager`'s access. App.jsx additionally checks
// `profile.role === 'cashier'` explicitly (before this ever runs) to show
// a distinct "this role has been removed" screen for an old Cashier
// account, rather than the generic "no profile" handling this sentinel
// would otherwise fall into.
export function resolveRole(profile) {
  // Backward-compat for the one pre-existing account whose Firestore doc
  // still says `role: 'owner'` (written before this rename) — treated as
  // `'admin'` everywhere from here on, with no data migration required.
  if (profile?.role === 'owner') return 'admin';
  if (profile?.role && PERMISSIONS[profile.role]) return profile.role;
  return 'blocked';
}
