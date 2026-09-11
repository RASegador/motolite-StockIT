import { doc, runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';

export async function completeSale(db, cartLines, amountReceived, { shopId, cashierId, cashierEmail }) {
  if (!cartLines || cartLines.length === 0) throw new Error('Cart is empty');

  const receiptNo = 'R' + Date.now().toString(36).toUpperCase();
  const now = Date.now();
  const itemIds = [...new Set(cartLines.map((l) => l.itemId))];

  return runTransaction(db, async (transaction) => {
    const freshItems = {};
    for (const itemId of itemIds) {
      const snap = await transaction.get(doc(db, 'items', itemId));
      if (!snap.exists()) throw new Error('An item in this sale no longer exists');
      freshItems[itemId] = snap.data();
    }

    const finalStockByItem = {};
    for (const line of cartLines) {
      const item = freshItems[line.itemId];
      const units = getItemUnits(item);
      const current = finalStockByItem[item.id]?.newStock || getUnitCounts(item);
      const sellUnitName = line.unitName || item.baseUnitName || 'Piece';
      const { newStock, shortfall } = cascadeDeductUnit(current, units, sellUnitName, line.qty);
      if (shortfall > 0) {
        throw new Error(`Not enough stock for ${item.sku} (short ${shortfall} ${sellUnitName})`);
      }
      finalStockByItem[item.id] = { newStock, newQuantity: totalBaseUnits(newStock, units) };
    }

    const saleLines = cartLines.map((line) => {
      const item = freshItems[line.itemId];
      const price = line.unitPrice ?? item.sellingPrice ?? item.unitCost;
      const lineCost = item.unitCost ?? 0;
      return {
        itemId: item.id, sku: item.sku, name: item.name,
        qty: line.qty, unitName: line.unitName || item.baseUnitName || 'Piece', factor: line.factor ?? 1,
        unitPrice: price, unitCost: lineCost,
        lineTotal: price * line.qty, lineProfit: (price - lineCost) * line.qty,
      };
    });
    const total = saleLines.reduce((s, l) => s + l.lineTotal, 0);
    const totalCost = saleLines.reduce((s, l) => s + l.unitCost * l.qty, 0);
    const totalProfit = saleLines.reduce((s, l) => s + l.lineProfit, 0);
    const received = amountReceived != null && amountReceived !== '' ? Number(amountReceived) : null;
    const change = received != null ? Math.max(0, received - total) : null;

    const sale = {
      id: newId('s'), receiptNo, timestamp: now, items: saleLines,
      subtotal: total, total, totalCost, totalProfit, amountReceived: received, change,
      cashierId, cashierEmail: cashierEmail || '', shopId, cancelled: false,
    };

    Object.entries(finalStockByItem).forEach(([itemId, { newStock, newQuantity }]) => {
      transaction.set(doc(db, 'items', itemId), { ...freshItems[itemId], quantity: newQuantity, unitStock: newStock });
    });
    cartLines.forEach((line) => {
      const mvId = newId('m');
      const baseQty = line.qty * (line.factor ?? 1);
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: line.itemId, type: 'out', qty: baseQty, shopId,
        reason: `Sale ${receiptNo}`, timestamp: now,
      });
    });
    transaction.set(doc(db, 'sales', sale.id), sale);

    return sale;
  });
}

export async function cancelSale(db, sale) {
  if (sale.cancelled) throw new Error('This sale is already cancelled');
  const now = Date.now();
  const itemIds = [...new Set(sale.items.map((l) => l.itemId))];

  await runTransaction(db, async (transaction) => {
    const freshItems = {};
    for (const itemId of itemIds) {
      const snap = await transaction.get(doc(db, 'items', itemId));
      if (snap.exists()) freshItems[itemId] = snap.data();
    }

    const restoredByItem = {};
    sale.items.forEach((line) => {
      const item = freshItems[line.itemId];
      if (!item) return;
      const units = getItemUnits(item);
      const current = restoredByItem[item.id]?.newStock || getUnitCounts(item);
      const unitName = line.unitName || item.baseUnitName || 'Piece';
      const newStock = { ...current, [unitName]: (current[unitName] || 0) + line.qty };
      restoredByItem[item.id] = { newStock, newQuantity: totalBaseUnits(newStock, units) };
    });

    Object.entries(restoredByItem).forEach(([itemId, { newStock, newQuantity }]) => {
      transaction.set(doc(db, 'items', itemId), { ...freshItems[itemId], quantity: newQuantity, unitStock: newStock });
    });
    sale.items.forEach((line) => {
      const mvId = newId('m');
      const baseQty = line.qty * (line.factor ?? 1);
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: line.itemId, type: 'in', qty: baseQty, shopId: sale.shopId,
        reason: `Sale ${sale.receiptNo} cancelled`, timestamp: now,
      });
    });
    transaction.set(doc(db, 'sales', sale.id), { cancelled: true, cancelledAt: now }, { merge: true });
  });
}
