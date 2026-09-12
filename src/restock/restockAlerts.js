// Low-stock alerts — computed live from each item's own existing
// `reorderPoint`/`reorderUnit` (already editable in ItemForm's "Reorder
// point" section) rather than a separately-configured threshold, since
// that already *is* "a minimum stock level per item/location" — an item
// document is already location-specific (one doc per shop/warehouse), so
// its reorder point already means "for THIS item at THIS location." No new
// per-item-per-location config was needed to satisfy that requirement.
//
// Alerts are computed on read, not stored — there is no `alerts`
// collection and nothing writes one. That's a deliberate simplification:
// an alert is just "is this item's current quantity at/under its own
// threshold right now", which is cheap to recompute from data the app
// already streams (`useItems`), and storing a duplicate, driftable copy
// of that same fact would be an extra write path someone else would need
// to keep in sync. The trade-off: the Owner Activity Log's "Restock alert
// generated" line item is not recorded as a discrete historical event —
// see the comment on ACTIVITY_TYPES in src/reports/activityFeed.js.
import { reorderThresholdInBase } from '../lib/units';

// Suggested restock quantity: enough to bring stock back up to double the
// reorder point (a simple, explainable "restock to a healthy buffer, not
// just back to the edge" rule), never less than 1 whenever the item is at
// or under threshold at all.
export function suggestedRestockQty(item) {
  const threshold = reorderThresholdInBase(item);
  const target = threshold * 2;
  return Math.max(1, Math.round(target - (item.quantity || 0)));
}

export function computeRestockAlerts(items, shops) {
  const shopById = new Map((shops || []).map((s) => [s.id, s]));
  return (items || [])
    .filter((item) => (item.quantity || 0) <= reorderThresholdInBase(item))
    .map((item) => {
      const shop = shopById.get(item.shopId);
      return {
        itemId: item.id,
        sku: item.sku || '',
        name: item.name || '',
        shopId: item.shopId || null,
        shopName: shop?.name || item.shopId || '—',
        shopType: shop?.type || 'store',
        currentStock: item.quantity || 0,
        minStock: reorderThresholdInBase(item),
        suggestedQty: suggestedRestockQty(item),
      };
    })
    .sort((a, b) => a.currentStock - b.currentStock);
}
