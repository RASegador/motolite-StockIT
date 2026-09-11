// Units of measure. `item.quantity` always represents stock in the item's
// BASE unit (e.g. "Piece") - every other unit (Pack, Box/Case, custom) is
// just a conversion factor + its own price on top of that same underlying
// stock number.

export function getItemUnits(item) {
  const base = {
    name: item.baseUnitName || 'Piece', factor: 1,
    cost: item.unitCost ?? 0, price: item.sellingPrice ?? item.unitCost ?? 0,
    barcode: item.barcode || null, isBase: true,
  };
  const extra = (item.units || []).map((u) => ({
    ...u, isBase: false,
    cost: u.cost ?? (item.unitCost ?? 0) * (u.factor || 1),
    barcode: u.barcode || null,
  }));
  return [base, ...extra];
}

export function getUnitCounts(item) {
  const units = getItemUnits(item);
  const counts = {};
  units.forEach((u) => { counts[u.name] = 0; });
  if (item.unitStock && typeof item.unitStock === 'object') {
    units.forEach((u) => { counts[u.name] = Number(item.unitStock[u.name]) || 0; });
  } else {
    counts[units[0].name] = item.quantity || 0;
  }
  return counts;
}

export function itemInventoryValue(item) {
  const units = getItemUnits(item);
  const counts = getUnitCounts(item);
  return units.reduce((sum, u) => sum + (counts[u.name] || 0) * (u.cost || 0), 0);
}

export function totalBaseUnits(stock, units) {
  return units.reduce((sum, u) => sum + (stock[u.name] || 0) * u.factor, 0);
}

export function reorderThresholdInBase(item) {
  const units = getItemUnits(item);
  const unit = units.find((u) => u.name === item.reorderUnit) || units[0];
  return (Number(item.reorderPoint) || 0) * (unit?.factor || 1);
}

export function breakOpenOneLevelUp(stock, units, levelIdx) {
  if (levelIdx + 1 >= units.length) return false;
  if ((stock[units[levelIdx + 1].name] || 0) <= 0) {
    const gotHigher = breakOpenOneLevelUp(stock, units, levelIdx + 1);
    if (!gotHigher) return false;
  }
  stock[units[levelIdx + 1].name] -= 1;
  const conversion = units[levelIdx + 1].factor / units[levelIdx].factor;
  stock[units[levelIdx].name] = (stock[units[levelIdx].name] || 0) + conversion;
  return true;
}

export function cascadeDeductUnit(stock, units, sellUnitName, qtyNeeded) {
  const newStock = { ...stock };
  const sellLevelIdx = units.findIndex((u) => u.name === sellUnitName);
  if (sellLevelIdx === -1) return { newStock, shortfall: qtyNeeded };

  while ((newStock[sellUnitName] || 0) < qtyNeeded) {
    const opened = breakOpenOneLevelUp(newStock, units, sellLevelIdx);
    if (!opened) break;
  }

  const available = newStock[sellUnitName] || 0;
  const take = Math.min(available, qtyNeeded);
  newStock[sellUnitName] = available - take;
  const shortfall = qtyNeeded - take;
  return { newStock, shortfall };
}
