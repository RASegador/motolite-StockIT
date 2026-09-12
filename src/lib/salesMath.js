// A sale's own `total`/`totalProfit` are set once at checkout and never
// mutated afterward — cancelSale() and refundSaleItems() both record what
// happened (cancelled flag, refunds[]/refundedAmount/refundedProfit)
// rather than rewriting the original numbers, so a sale document stays an
// honest record of what was actually rung up. Anything that reports
// revenue or profit (dashboards, shop reports, charts) needs the NET
// figure — the original amount minus whatever's since been refunded —
// which is what these two helpers compute. A cancelled sale should be
// filtered out by the caller before summing (its net would be 0 anyway
// once refunded, but callers already exclude `cancelled` sales entirely).
export function netRevenue(sale) {
  return (sale?.total || 0) - (sale?.refundedAmount || 0);
}

export function netProfit(sale) {
  return (sale?.totalProfit || 0) - (sale?.refundedProfit || 0);
}
