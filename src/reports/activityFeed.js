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
// Note on "Restock alert generated": alerts are computed live, not stored
// (see src/restock/restockAlerts.js), so there is no discrete write to
// source an activity entry from — it's genuinely not a historical event,
// just a current-state condition. Every OTHER action in the spec's list
// maps onto one of these.
export const ACTIVITY_TYPES = [
  'item_added', 'item_removed', 'inventory_adjusted',
  'item_sold', 'sale_cancelled', 'item_returned',
  'item_damaged', 'transfer_out', 'transfer_in',
  'restock_request_created', 'restock_request_reviewed', 'restock_request_fulfilled',
];

const ACTIVITY_LABELS = {
  item_added: 'Item Added',
  item_removed: 'Item Removed',
  inventory_adjusted: 'Inventory Adjusted',
  item_sold: 'Item Sold',
  sale_cancelled: 'Sale Cancelled',
  item_returned: 'Item Returned',
  item_damaged: 'Item Damaged',
  transfer_out: 'Transfer Out',
  transfer_in: 'Transfer In',
  restock_request_created: 'Restock Request Created',
  restock_request_reviewed: 'Restock Request Approved/Rejected',
  restock_request_fulfilled: 'Restock Request Fulfilled',
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

// One transfer produces up to two distinct log entries — "Transfer Out" at
// initiation (always) and "Transfer In" at confirmation (once the
// destination has actually confirmed/disputed it) — matching the spec's
// Activity Log list, which tracks the two as separate actions rather than
// one "transfer" event with a status.
function fromTransfers(transfers) {
  const entries = [];
  (transfers || []).forEach((t) => {
    entries.push({
      id: `${t.id}-out`,
      timestamp: t.initiatedAt,
      type: 'transfer_out',
      userId: t.initiatedBy || null,
      shopIds: [t.fromShopId, t.toShopId].filter(Boolean),
      itemId: t.itemId || null,
      quantity: t.quantity ?? null,
      previousQuantity: null,
      newQuantity: null,
      fromShopId: t.fromShopId || null,
      toShopId: t.toShopId || null,
      reason: 'Transfer initiated',
      notes: t.status === 'in_transit' ? 'In transit — awaiting confirmation' : '',
      status: t.status || 'in_transit',
    });
    if (t.confirmedAt) {
      entries.push({
        id: `${t.id}-in`,
        timestamp: t.confirmedAt,
        type: 'transfer_in',
        userId: t.confirmedBy || null,
        shopIds: [t.fromShopId, t.toShopId].filter(Boolean),
        itemId: t.itemId || null,
        quantity: t.confirmedQuantity ?? null,
        previousQuantity: null,
        newQuantity: null,
        fromShopId: t.fromShopId || null,
        toShopId: t.toShopId || null,
        reason: 'Transfer confirmed',
        notes: t.status === 'disputed'
          ? `Disputed — shipped ${t.quantity}, confirmed ${t.confirmedQuantity}`
          : `Received ${t.confirmedQuantity} of ${t.quantity} shipped`,
        status: t.status || 'received',
      });
    }
  });
  return entries;
}

function restockRequestNotes(r) {
  if (r.status === 'pending') return `Requested ${r.requestedQty} — pending review`;
  if (r.status === 'approved') return `Approved by ${r.reviewedBy || '—'}${r.transferId ? ` (transfer ${r.transferId})` : ''}`;
  if (r.status === 'rejected') return `Rejected by ${r.reviewedBy || '—'}${r.notes ? `: ${r.notes}` : ''}`;
  if (r.status === 'fulfilled') return 'Fulfilled — matching transfer confirmed';
  if (r.status === 'cancelled') return 'Cancelled by requester';
  return '';
}

// A single restock request can surface up to three log entries across its
// lifecycle: created (always), reviewed (once approved/rejected), and
// fulfilled (once the linked transfer is confirmed) — see
// src/restock/restockRequestActions.js for what writes each timestamp.
function fromRestockRequests(requests) {
  const entries = [];
  (requests || []).forEach((r) => {
    entries.push({
      id: `${r.id}-created`,
      timestamp: r.createdAt,
      type: 'restock_request_created',
      userId: r.requestedBy || null,
      shopIds: r.requestingShopId ? [r.requestingShopId] : [],
      itemId: r.itemId || null,
      quantity: r.requestedQty ?? null,
      previousQuantity: null, newQuantity: null,
      fromShopId: null, toShopId: null,
      reason: 'Restock request submitted',
      notes: restockRequestNotes({ ...r, status: 'pending' }),
      status: r.status || 'pending',
    });
    // `status` may have already moved on to 'fulfilled' by the time this
    // is read — that still means it WAS reviewed (approved) at some point,
    // so the reviewed entry is keyed off `reviewedAt` existing at all, not
    // off the current status still being 'approved'/'rejected'.
    if (r.reviewedAt) {
      const reviewedStatus = r.status === 'fulfilled' ? 'approved' : r.status;
      entries.push({
        id: `${r.id}-reviewed`,
        timestamp: r.reviewedAt,
        type: 'restock_request_reviewed',
        userId: r.reviewedBy || null,
        shopIds: r.requestingShopId ? [r.requestingShopId] : [],
        itemId: r.itemId || null,
        quantity: r.requestedQty ?? null,
        previousQuantity: null, newQuantity: null,
        fromShopId: null, toShopId: null,
        reason: `Restock request ${reviewedStatus}`,
        notes: restockRequestNotes({ ...r, status: reviewedStatus }),
        status: reviewedStatus,
      });
    }
    if (r.fulfilledAt) {
      entries.push({
        id: `${r.id}-fulfilled`,
        timestamp: r.fulfilledAt,
        type: 'restock_request_fulfilled',
        userId: null,
        shopIds: r.requestingShopId ? [r.requestingShopId] : [],
        itemId: r.itemId || null,
        quantity: r.requestedQty ?? null,
        previousQuantity: null, newQuantity: null,
        fromShopId: null, toShopId: null,
        reason: 'Restock request fulfilled',
        notes: restockRequestNotes(r),
        status: 'fulfilled',
      });
    }
  });
  return entries;
}

// Combines every source into one feed, newest first. Every hook this is
// fed from (`useMovementsLog`, `useDamageReports`, `useTransfers`,
// `useRestockRequests`, and — for item/shop/user name lookups only, not as
// an entry source — `useItems`/`useShops`/`useUsers`) is called with
// `{ role: 'owner' }` (or `'warehouse'`, which also sees every request) by
// the caller, so no location is silently excluded here.
export function buildActivityFeed({ movements, damageReports, transfers, restockRequests }) {
  const entries = [
    ...fromMovements(movements),
    ...fromDamageReports(damageReports),
    ...fromTransfers(transfers),
    ...fromRestockRequests(restockRequests),
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
