import { describe, it, expect } from 'vitest';
import { buildActivityFeed, filterActivityFeed, activityLabel } from './activityFeed';

describe('buildActivityFeed', () => {
  it('surfaces only the whitelisted activity types from movements, dropping untagged/legacy ones', () => {
    const movements = [
      { id: 'm1', activityType: 'item_sold', timestamp: 100, actorId: 'cashA', shopId: 'shopA', itemId: 'item1', qty: 2, previousQuantity: 10, newQuantity: 8, reason: 'Sale R1' },
      { id: 'm2', activityType: undefined, timestamp: 90, itemId: 'item1', shopId: 'shopA', qty: 1, reason: 'Transfer to shop shopB' },
      { id: 'm3', timestamp: 80, itemId: 'item1', shopId: 'shopA', qty: 1, reason: 'legacy move, no activityType at all' },
    ];
    const feed = buildActivityFeed({ movements, damageReports: [], transfers: [] });
    expect(feed).toHaveLength(1);
    expect(feed[0].type).toBe('item_sold');
    expect(feed[0].previousQuantity).toBe(10);
    expect(feed[0].newQuantity).toBe(8);
  });

  it('maps a damage report reason to item_damaged or item_returned', () => {
    const damageReports = [
      { id: 'd1', reason: 'damaged', reportedAt: 100, reportedBy: 'cashA', shopId: 'shopA', itemId: 'item1', quantity: 2, status: 'pending' },
      { id: 'd2', reason: 'returned', reportedAt: 90, reportedBy: 'cashA', shopId: 'shopA', itemId: 'item1', quantity: 1, status: 'approved', resolvedBy: 'mgrA' },
      { id: 'd3', reason: 'defective', reportedAt: 80, reportedBy: 'cashA', shopId: 'shopA', itemId: 'item1', quantity: 1, status: 'pending' },
    ];
    const feed = buildActivityFeed({ movements: [], damageReports, transfers: [] });
    expect(feed.map((e) => e.type)).toEqual(['item_damaged', 'item_returned', 'item_damaged']);
    expect(feed[1].notes).toMatch(/Approved by mgrA/);
  });

  it('carries both the source and destination shop for a transfer, and sorts newest-first across all sources', () => {
    const movements = [
      { id: 'm1', activityType: 'item_sold', timestamp: 50, actorId: 'cashA', shopId: 'shopA', itemId: 'item1', qty: 1, reason: 'Sale R1' },
    ];
    const transfers = [
      { id: 't1', timestamp: 200, initiatedAt: 200, initiatedBy: 'mgrA', fromShopId: 'shopA', toShopId: 'shopB', itemId: 'item1', quantity: 5, status: 'in_transit' },
    ];
    const feed = buildActivityFeed({ movements, damageReports: [], transfers });
    expect(feed[0].type).toBe('item_transferred');
    expect(feed[0].shopIds).toEqual(['shopA', 'shopB']);
    expect(feed[0].fromShopId).toBe('shopA');
    expect(feed[0].toShopId).toBe('shopB');
    expect(feed[1].type).toBe('item_sold'); // the older sale sorts after the transfer
  });
});

describe('filterActivityFeed', () => {
  const entries = buildActivityFeed({
    movements: [
      { id: 'm1', activityType: 'item_sold', timestamp: Date.parse('2026-01-05T10:00:00'), actorId: 'cashA', shopId: 'shopA', itemId: 'item1', qty: 1, reason: 'Sale R1' },
      { id: 'm2', activityType: 'item_added', timestamp: Date.parse('2026-01-10T10:00:00'), actorId: 'ownerA', shopId: 'shopB', itemId: 'item2', qty: 5, reason: 'Item added' },
    ],
    damageReports: [],
    transfers: [
      { id: 't1', initiatedAt: Date.parse('2026-01-15T10:00:00'), initiatedBy: 'mgrB', fromShopId: 'shopB', toShopId: 'shopA', itemId: 'item2', quantity: 2, status: 'in_transit' },
    ],
  });
  const roleOf = (userId) => ({ cashA: 'cashier', ownerA: 'owner', mgrB: 'manager' })[userId] || null;

  it('filters by shop membership, including a transfer matching either side', () => {
    const shopAOnly = filterActivityFeed(entries, { shopId: 'shopA' }, roleOf);
    expect(shopAOnly.map((e) => e.id).sort()).toEqual(['m1', 't1'].sort());
  });

  it('filters by user, role, item, type, and date range', () => {
    expect(filterActivityFeed(entries, { userId: 'ownerA' }, roleOf).map((e) => e.id)).toEqual(['m2']);
    expect(filterActivityFeed(entries, { role: 'manager' }, roleOf).map((e) => e.id)).toEqual(['t1']);
    expect(filterActivityFeed(entries, { itemId: 'item1' }, roleOf).map((e) => e.id)).toEqual(['m1']);
    expect(filterActivityFeed(entries, { type: 'item_transferred' }, roleOf).map((e) => e.id)).toEqual(['t1']);
    expect(filterActivityFeed(entries, { startDate: '2026-01-09', endDate: '2026-01-12' }, roleOf).map((e) => e.id)).toEqual(['m2']);
  });

  it('"all" and unset filters are a no-op', () => {
    expect(filterActivityFeed(entries, { shopId: 'all', userId: null, role: 'all' }, roleOf)).toHaveLength(3);
  });
});

describe('activityLabel', () => {
  it('has a human label for every tracked type', () => {
    expect(activityLabel('item_sold')).toBe('Item Sold');
    expect(activityLabel('item_transferred')).toBe('Item Transferred');
    expect(activityLabel('something_unmapped')).toBe('something_unmapped');
  });
});
