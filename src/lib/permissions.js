// Client-side convenience layer only. The Firestore Security Rules in
// firestore.rules are the actual enforcement boundary — this table exists
// so the UI can show/hide actions a user isn't allowed to take, but a bug
// here can never turn into a data leak on its own.
export const PERMISSIONS = {
  owner: {
    viewInventory: true, editInventory: true, deleteInventory: true,
    manageCategories: true, manageSuppliers: true, manageLocations: true,
    stockReceive: true, stockIssue: true, editMarkup: true,
    // The Owner is the central administrator/monitoring account for the
    // whole system — never a POS user. This is intentionally `false`
    // (not a config toggle): App.jsx's `case 'pos':` guard and Topbar's
    // nav-item filter both key off this single value, so flipping it here
    // is enough to remove POS from the Owner's navigation AND block direct
    // navigation to it, with no other code changes required.
    pos: false,
    viewReports: true, viewSalesReports: true, print: true, cancelSales: true,
    initiateTransfer: true, confirmTransfer: true,
    reportDamage: true, approveDamage: true,
    manageUsers: true, manageShops: true, viewOwnSales: true,
    viewConsolidatedReports: true, viewActivityLog: true,
    createRestockRequest: true, reviewRestockRequest: true,
  },
  manager: {
    viewInventory: true, editInventory: true, deleteInventory: true,
    manageCategories: true, manageSuppliers: true, manageLocations: true,
    stockReceive: true, stockIssue: true, editMarkup: true,
    pos: false, viewReports: true, viewSalesReports: true, print: true, cancelSales: false,
    initiateTransfer: true, confirmTransfer: true,
    reportDamage: true, approveDamage: true,
    manageUsers: false, manageShops: false, viewOwnSales: false,
    viewConsolidatedReports: false, viewActivityLog: false,
    // A store Manager can submit a Restock Request to the warehouse, but
    // reviewing/approving one is a Warehouse/Owner-only action per spec.
    createRestockRequest: true, reviewRestockRequest: false,
  },
  cashier: {
    viewInventory: true, editInventory: false, deleteInventory: false,
    manageCategories: false, manageSuppliers: false, manageLocations: false,
    stockReceive: true, stockIssue: true, editMarkup: false,
    pos: true, viewReports: false, viewSalesReports: false, print: false, cancelSales: false,
    initiateTransfer: false, confirmTransfer: false,
    reportDamage: true, approveDamage: false,
    manageUsers: false, manageShops: false, viewOwnSales: true,
    viewConsolidatedReports: false, viewActivityLog: false,
    createRestockRequest: false, reviewRestockRequest: false,
  },
  // Warehouse staff: their own login, scoped to one assigned warehouse
  // (a `shops` doc with `type: 'warehouse'` — see src/shops/shopActions.js).
  // They receive/ship stock and fulfill Restock Requests, but never touch
  // POS, never see the Owner's global dashboard, and never manage users or
  // system-wide settings — per the "Warehouse users should NOT" list.
  warehouse: {
    viewInventory: true, editInventory: false, deleteInventory: false,
    manageCategories: false, manageSuppliers: false, manageLocations: false,
    stockReceive: true, stockIssue: true, editMarkup: false,
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

export function resolveRole(profile) {
  if (profile?.role && PERMISSIONS[profile.role]) return profile.role;
  return 'cashier';
}
