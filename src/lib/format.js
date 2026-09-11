export function newId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function currency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(amount) || 0);
}
