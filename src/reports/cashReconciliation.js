import { netRevenue } from '../lib/salesMath';

// `date` is a 'YYYY-MM-DD' string in the browser's local timezone — same
// granularity a shift-close happens at. Sales store `timestamp` as a raw
// epoch ms number (see salesActions.js), so this derives the local day from
// that rather than requiring a separate date field on the sale.
export function localDateKey(timestampMs) {
  const d = new Date(timestampMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function salesForShopAndDate(sales, shopId, date) {
  return (sales || []).filter((s) =>
    !s.cancelled && s.shopId === shopId && localDateKey(s.timestamp) === date
  );
}

// Sums each day's sales by payment method, net of refunds (a refund is
// assumed to have gone back out via the same method the sale came in on —
// this app doesn't record a separate refund payment method). Returns a
// breakdown map plus the total, in a stable, always-present shape so the
// UI never has to guard against a missing key for a method nobody used
// that day.
export function computeExpectedCashByMethod(sales, shopId, date, methods = ['Cash', 'GCash', 'Card', 'Other']) {
  const breakdown = Object.fromEntries(methods.map((m) => [m, 0]));
  const daySales = salesForShopAndDate(sales, shopId, date);
  daySales.forEach((sale) => {
    const method = methods.includes(sale.paymentMethod) ? sale.paymentMethod : 'Other';
    breakdown[method] = (breakdown[method] || 0) + netRevenue(sale);
  });
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
  return { breakdown, total, saleCount: daySales.length };
}

// `actualCounts` is the same shape as `breakdown` above (method -> amount
// someone physically counted). Returns a per-method variance (counted -
// expected) plus the total variance — positive means over, negative short.
export function computeVariance(expectedBreakdown, actualCounts) {
  const perMethod = {};
  Object.keys(expectedBreakdown).forEach((method) => {
    const expected = expectedBreakdown[method] || 0;
    const actual = Number(actualCounts?.[method]) || 0;
    perMethod[method] = { expected, actual, variance: actual - expected };
  });
  const totalVariance = Object.values(perMethod).reduce((s, m) => s + m.variance, 0);
  return { perMethod, totalVariance };
}
