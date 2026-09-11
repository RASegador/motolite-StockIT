export function computeSellingPrice(baseCost, markupType, markupValue) {
  const cost = Math.max(0, Number(baseCost) || 0);
  const markup = Math.max(0, Number(markupValue) || 0);
  const price = markupType === 'fixed' ? cost + markup : cost * (1 + markup / 100);
  return Math.round(price * 100) / 100;
}

export function computeMarkupFromPrices(baseCost, sellingPrice) {
  const cost = Math.max(0, Number(baseCost) || 0);
  const price = Math.max(0, Number(sellingPrice) || 0);
  const amount = Math.round((price - cost) * 100) / 100;
  const percent = cost > 0 ? Math.round((amount / cost) * 10000) / 100 : 0;
  return { amount, percent };
}
