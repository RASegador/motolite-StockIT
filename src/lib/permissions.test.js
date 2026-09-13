import { describe, it, expect } from 'vitest';
import { can, resolveRole } from './permissions';

describe('can', () => {
  it('gives admin full access, including cross-shop reports and user management, but never POS', () => {
    expect(can('admin', 'editInventory')).toBe(true);
    // Admin is the central administrator/monitoring account for the whole
    // system, never a POS user — with Cashier removed, POS is exclusively
    // for Manager now. See src/lib/permissions.js's comment on `admin.pos`.
    expect(can('admin', 'pos')).toBe(false);
    expect(can('admin', 'cancelSales')).toBe(true);
    expect(can('admin', 'manageUsers')).toBe(true);
    expect(can('admin', 'viewConsolidatedReports')).toBe(true);
    expect(can('admin', 'viewActivityLog')).toBe(true);
    expect(can('admin', 'manageCategories')).toBe(true);
    expect(can('admin', 'manageSuppliers')).toBe(true);
  });

  it('gives manager POS + transfer/report control, but no direct inventory edit and no Categories/Suppliers', () => {
    // Per the "Manager Portal & Account Structure" spec: Categories and
    // Suppliers are Admin-only, and a Manager now handles POS directly
    // (Cashier is removed) while still never touching stock directly —
    // only through Restock/Transfer Requests + Receive.
    expect(can('manager', 'editInventory')).toBe(false);
    expect(can('manager', 'deleteInventory')).toBe(false);
    expect(can('manager', 'stockReceive')).toBe(false);
    expect(can('manager', 'stockIssue')).toBe(false);
    expect(can('manager', 'manageCategories')).toBe(false);
    expect(can('manager', 'manageSuppliers')).toBe(false);
    expect(can('manager', 'manageLocations')).toBe(false);
    expect(can('manager', 'initiateTransfer')).toBe(true);
    expect(can('manager', 'confirmTransfer')).toBe(true);
    expect(can('manager', 'approveDamage')).toBe(true);
    expect(can('manager', 'viewReports')).toBe(true);
    expect(can('manager', 'pos')).toBe(true);
    expect(can('manager', 'manageUsers')).toBe(false);
    expect(can('manager', 'viewActivityLog')).toBe(false);
  });

  it('has removed the cashier role entirely — every permission is now false for it', () => {
    // 'cashier' is deliberately no longer a key in PERMISSIONS — this
    // confirms an old Cashier account's role string can never grant
    // anything, even without App.jsx's explicit login block.
    expect(can('cashier', 'pos')).toBe(false);
    expect(can('cashier', 'viewInventory')).toBe(false);
    expect(can('cashier', 'confirmTransfer')).toBe(false);
    expect(can('cashier', 'viewOwnSales')).toBe(false);
  });

  it('has no lingering "owner" key — the role was renamed to "admin"', () => {
    // The raw (unaliased) key no longer exists in PERMISSIONS at all;
    // resolveRole() is what maps a legacy 'owner' doc onto 'admin' before
    // can() ever sees it — see the 'resolveRole' describe block below.
    expect(can('owner', 'editInventory')).toBe(false);
    expect(can('owner', 'pos')).toBe(false);
  });

  it('returns false for an unknown role or permission', () => {
    expect(can('bogus', 'pos')).toBe(false);
    expect(can('admin', 'bogusPermission')).toBe(false);
  });
});

describe('resolveRole', () => {
  it('reads the role straight off a valid profile', () => {
    expect(resolveRole({ role: 'manager' })).toBe('manager');
    expect(resolveRole({ role: 'admin' })).toBe('admin');
  });

  it('maps a legacy "owner" role onto "admin" with no data migration required', () => {
    // The one pre-existing Owner/Admin account (created out-of-band by
    // scripts/create-owner.js before this rename) still has role: 'owner'
    // in Firestore — this backward-compat mapping is what keeps it working
    // as a full Admin with no manual data migration. See firestore.rules'
    // isAdmin() for the equivalent server-side check.
    expect(resolveRole({ role: 'owner' })).toBe('admin');
    expect(can(resolveRole({ role: 'owner' }), 'manageUsers')).toBe(true);
  });

  it('defaults to a zero-permission sentinel for a missing, invalid, or removed (cashier) role', () => {
    // Never silently upgrades a garbage/legacy role to `manager`'s
    // permissions — see permissions.js's comment on this sentinel, and
    // App.jsx's explicit, more specific handling of profile.role === 'cashier'.
    expect(resolveRole({ role: 'nonsense' })).toBe('blocked');
    expect(resolveRole(null)).toBe('blocked');
    expect(resolveRole({})).toBe('blocked');
    expect(resolveRole({ role: 'cashier' })).toBe('blocked');
    expect(can('blocked', 'pos')).toBe(false);
  });
});
