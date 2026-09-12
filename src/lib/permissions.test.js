import { describe, it, expect } from 'vitest';
import { can, resolveRole } from './permissions';

describe('can', () => {
  it('gives owner full access, including cross-shop reports and user management, but never POS', () => {
    expect(can('owner', 'editInventory')).toBe(true);
    // The Owner is the central administrator/monitoring account for the
    // whole system, never a POS user — POS is exclusively for Manager and
    // Cashier. See src/lib/permissions.js's comment on `owner.pos`.
    expect(can('owner', 'pos')).toBe(false);
    expect(can('owner', 'cancelSales')).toBe(true);
    expect(can('owner', 'manageUsers')).toBe(true);
    expect(can('owner', 'viewConsolidatedReports')).toBe(true);
    expect(can('owner', 'viewActivityLog')).toBe(true);
  });

  it('gives manager full inventory/transfer/report control but no POS', () => {
    expect(can('manager', 'editInventory')).toBe(true);
    expect(can('manager', 'initiateTransfer')).toBe(true);
    expect(can('manager', 'approveDamage')).toBe(true);
    expect(can('manager', 'viewReports')).toBe(true);
    expect(can('manager', 'pos')).toBe(false);
    expect(can('manager', 'manageUsers')).toBe(false);
    expect(can('manager', 'viewActivityLog')).toBe(false);
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
