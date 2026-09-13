// Shared between src/restock/RestockView.jsx and src/reports/RequestsView.jsx
// (the Owner's global Requests Center) so the two screens can't drift on
// what a status is called or how it's colored.
export const STATUS_LABELS = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', fulfilled: 'Fulfilled', cancelled: 'Cancelled',
};

// Reuses the existing .status-badge/.status-{in,low,out} classes
// (src/inventory/InventoryList.jsx) rather than inventing a parallel color
// system — fulfilled reads as "good" (in), rejected/cancelled as
// "bad" (out), pending/approved as "in progress" (low, i.e. amber).
export function statusBadgeClass(status) {
  if (status === 'fulfilled') return 'status-in';
  if (status === 'rejected' || status === 'cancelled') return 'status-out';
  return 'status-low';
}
