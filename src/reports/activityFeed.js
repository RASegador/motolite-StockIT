// Builds the unified, filterable feed behind the Owner Activity Log
// (src/reports/OwnerActivityLog.jsx) and the "Activity" summary on
// src/reports/OwnerDashboard.jsx. Pure/no-Firestore-access on purpose —
// every source array here already comes from an owner-scoped hook
// (useMovementsLog/useSales/useDamageReports/useTransfers, all called with
// `{ role: 'owner' }` so they already see every shop with no extra query
// needed), so this module only has to normalize+merge, which keeps it
// trivially unit-testable without the Firestore emulator.
//
// Three collections already carry a richer, request-shaped record of their
// own kind of event than a generic stock movement would (a damage report
// has a status; a transfer has both a from- and a to-shop) — those are
// read directly. `movements` is the source for every OTHER tracked action
// (Item Added/Removed/Sold, Inventory Adjusted, a cancelled sale's stock
// restore, a refund's stock restore) via an `activityType` tag written at
// the point of mutation (see src/inventory/inventoryActions.js and
// src/pos/salesActions.js) — only movements carrying one of the types in
// MOVEMENT_ACTIVITY_TYPES are surfaced here, so a transfer/damage-approval's
// own plain movement entry (no activityType) doesn't create a confusing
// duplicate of the dedicated transfer/damage-report entry below.
export const ACTIVITY_TYPES = [
  'item_added', 'item_removed', 'inventory_adjusted',
  'item_sold', 'sale_cancelled', 'item_returned',
  'item_damaged', 'item_transferred',
];

const ACTIVITY_LABELS = {
  item_added: 'Item Added',
  item_removed: 'Item Removed',
  inventory_adjusted: 'Inventory Adjusted',
  item_sold: 'Item Sold',
  sale_cancelled: 'Sale Cancelled',
  item_returned: 'Item Returned',
  item_damaged: 'Item Damaged',
  item_transferred: 'Item Transferred',
};

export function activityLabel(type) {
  return ACTIVITY_LABELS[type] || type;
}

const MOVEMENT_ACTIVITY_TYPES = new Set([
  'item_added', 'item_removed', 'inventory_adjusted', 'item_sold', 'sale_cancelled', 'item_returned',
]);

function fromMovements(movements) {
  return (movements || [])
    .filter((m) => MOVEMENT_ACTIVITY_TYPES.has(m.activityType))
    .map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      type: m.activityType,
      userId: m.actorId || null,
      shopIds: m.shopId ? [m.shopId] : [],
      itemId: m.itemId || null,
      quantity: m.qty ?? null,
      previousQuantity: m.previousQuantity ?? null,
      newQuantity: m.newQuantity ?? null,
      fromShopId: null,
      toShopId: null,
      reason: m.reason || '',
      notes: '',
      status: null,
    }));
}

// A damage report's `reason` ('damaged' | 'returned' | 'defective') maps to
// the two activity types the spec calls out — 'returned' is its own
// tracked action, everything else (damaged/defective) is "Item Damaged".
function damageActivityType(reason) {
  return reason === 'returned' ? 'item_returned' : 'item_damaged';
}

function fromDamageReports(reports) {
  return (reports || []).map((r) => ({
    id: r.id,
    timestamp: r.reportedAt,
    type: damageActivityType(r.reason),
    userId: r.reportedBy || null,
    shopIds: r.shopId ? [r.shopId] : [],
    itemId: r.itemId || null,
    quantity: r.quantity ?? null,
    previousQuantity: null,
    newQuantity: null,
    fromShopId: null,
    toShopId: null,
    reason: r.reason || '',
    notes: r.status === 'pending' ? 'Pending review' : `${r.status === 'approved' ? 'Approved' : 'Rejected'} by ${r.resolvedBy || 'owner/manager'}`,
    status: r.status || 'pending',
  }));
}

function fromTransfers(transfers) {
  return (transfers || []).map((t) => ({
    id: t.id,
    timestamp: t.initiatedAt,
    type: 'item_transferred',
    userId: t.initiatedBy || null,
    shopIds: [t.fromShopId, t.toShopId].filter(Boolean),
    itemId: t.itemId || null,
    quantity: t.quantity ?? null,
    previousQuantity: null,
    newQuantity: t.confirmedQuantity ?? null,
    fromShopId: t.fromShopId || null,
    toShopId: t.toShopId || null,
    reason: 'Branch transfer',
    notes: t.status === 'in_transit' ? 'In transit'
      : t.status === 'received' ? `Received by ${t.confirmedBy || 'destination shop'}`
      : t.status === 'disputed' ? `Disputed — confirmed qty ${t.confirmedQuantity}` : (t.status || ''),
    status: t.status || 'in_transit',
  }));
}

// Combines every source into one feed, newest first. All four hooks this
// is fed from (`useMovementsLog`, `useDamageReports`, `useTransfers`,
// and — for item/shop/user name lookups only, not as an entry source —
// `useItems`/`useShops`/`useUsers`) are called with `{ role: 'owner' }` by
// the caller, so no shop is silently excluded here.
export function buildActivityFeed({ movements, damageReports, transfers }) {
  const entries = [
    ...fromMovements(movements),
    ...fromDamageReports(damageReports),
    ...fromTransfers(transfers),
  ];
  return entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// `filters.shopId`/`userId`/`role`/`itemId`/`type` are exact-match, `null`/
// 'all' means "no filter"; `startDate`/`endDate` are 'YYYY-MM-DD' strings
// (or falsy for an open bound), same convention as dashboardStats.js.
// `userRoleOf(userId)` looks up a user's role for the Role filter, since an
// activity entry itself only carries the actor's id, not their role.
export function filterActivityFeed(entries, { shopId, userId, role, itemId, type, startDate, endDate } = {}, userRoleOf = () => null) {
  const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
  return (entries || []).filter((e) => {
    if (shopId && shopId !== 'all' && !e.shopIds.includes(shopId)) return false;
    if (userId && userId !== 'all' && e.userId !== userId) return false;
    if (role && role !== 'all' && userRoleOf(e.userId) !== role) return false;
    if (itemId && itemId !== 'all' && e.itemId !== itemId) return false;
    if (type && type !== 'all' && e.type !== type) return false;
    if (start != null && e.timestamp < start) return false;
    if (end != null && e.timestamp > end) return false;
    return true;
  });
}
