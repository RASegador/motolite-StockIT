import { doc, runTransaction } from 'firebase/firestore';
import { cascadeDeductUnit, getItemUnits, getUnitCounts, totalBaseUnits } from '../lib/units';
import { newId } from '../lib/format';
import { generateSecureToken } from '../lib/secureToken';
import { buildPublicReceipt } from '../lib/receipts';

// Rounds to the nearest cent — a percent discount on an odd subtotal
// (e.g. 20% of 33.33) would otherwise leave a floating-point tail
// (33.330000000000005) on the sale document and receipt.
function round2(n) {
  return Math.round(n * 100) / 100;
}

// `discount` is entirely optional — `null`/`undefined`, or an object with
// no usable `value`, both mean "no discount" and behave exactly as before
// this feature existed. When present: { type: 'percent' | 'fixed', value }.
// A percent is clamped to 0-100; a fixed amount is clamped to the
// pre-discount subtotal, so a discount can never make total go negative.
function computeDiscount(subtotal, discount) {
  const type = discount && (discount.type === 'percent' || discount.type === 'fixed') ? discount.type : null;
  if (!type) return { type: null, value: 0, amount: 0 };
  const rawValue = Number(discount.value);
  if (!(rawValue > 0)) return { type: null, value: 0, amount: 0 };
  if (type === 'percent') {
    const pct = Math.min(100, Math.max(0, rawValue));
    return { type, value: pct, amount: round2(subtotal * (pct / 100)) };
  }
  const fixed = Math.min(subtotal, Math.max(0, rawValue));
  return { type, value: fixed, amount: round2(fixed) };
}

export async function completeSale(db, cartLines, amountReceived, { shopId, cashierId, cashierEmail, shopName, paymentMethod, discount }) {
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

    // The token is 128 bits of randomness (collision odds are astronomically
    // low already), but since we're inside a transaction anyway, a
    // belt-and-suspenders existence check costs nothing and gives a real,
    // unconditional guarantee that "QR codes cannot be duplicated between
    // transactions" rather than just a near-certainty.
    let receiptToken = generateSecureToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await transaction.get(doc(db, 'receiptsPublic', receiptToken));
      if (!existing.exists()) break;
      receiptToken = generateSecureToken();
    }

    const finalStockByItem = {};
    for (const line of cartLines) {
      const item = freshItems[line.itemId];
      if (!(line.qty > 0)) {
        throw new Error(`Invalid quantity for ${item.sku || item.name || line.itemId}`);
      }
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
        // Firestore rejects `undefined` field values outright (the whole
        // transaction.set() fails), so sku/name are defaulted rather than
        // passed through raw — a fixture/legacy item missing one of these
        // must not be able to take down the entire sale write.
        // `lineId` gives refundSaleItems() a stable handle on this exact
        // line (distinct from itemId, in case the same item is sold twice
        // in one sale in different units) to track partial refunds against.
        lineId: newId('sl'),
        itemId: item.id, sku: item.sku || '', name: item.name || '',
        qty: line.qty, unitName: line.unitName || item.baseUnitName || 'Piece', factor: line.factor ?? 1,
        unitPrice: price, unitCost: lineCost,
        lineTotal: price * line.qty, lineProfit: (price - lineCost) * line.qty,
      };
    });
    const subtotal = saleLines.reduce((s, l) => s + l.lineTotal, 0);
    const totalCost = saleLines.reduce((s, l) => s + l.unitCost * l.qty, 0);
    const grossProfit = saleLines.reduce((s, l) => s + l.lineProfit, 0);
    const { type: discountType, value: discountValue, amount: discountAmount } = computeDiscount(subtotal, discount);
    const total = subtotal - discountAmount;
    // The discount comes straight out of margin (cost doesn't change), so
    // the sale's profit is reduced by the same amount rather than
    // recomputed per line.
    const totalProfit = grossProfit - discountAmount;
    const received = amountReceived != null && amountReceived !== '' ? Number(amountReceived) : null;
    const change = received != null ? Math.max(0, received - total) : null;

    const sale = {
      id: newId('s'), receiptNo, timestamp: now, items: saleLines,
      subtotal, discountType, discountValue, discountAmount,
      total, totalCost, totalProfit, amountReceived: received, change,
      cashierId, cashierEmail: cashierEmail || '', shopId, cancelled: false,
      // Populated later by refundSaleItems() for a partial return — kept
      // here at creation so every sale doc has the same shape from day one.
      refunds: [], refundedAmount: 0, refundedProfit: 0,
      paymentMethod: paymentMethod || 'Cash', receiptToken,
    };

    // Public, customer-safe mirror the QR code on the receipt points to —
    // see buildPublicReceipt for exactly which fields are excluded.
    transaction.set(doc(db, 'receiptsPublic', receiptToken), buildPublicReceipt(sale, shopName));

    Object.entries(finalStockByItem).forEach(([itemId, { newStock, newQuantity }]) => {
      transaction.set(doc(db, 'items', itemId), { ...freshItems[itemId], quantity: newQuantity, unitStock: newStock });
    });
    cartLines.forEach((line) => {
      const item = freshItems[line.itemId];
      const units = getItemUnits(item);
      const unitName = line.unitName || item.baseUnitName || 'Piece';
      const resolvedUnit = units.find((u) => u.name === unitName);
      const factor = resolvedUnit ? resolvedUnit.factor : 1;
      const mvId = newId('m');
      const baseQty = line.qty * factor;
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
    // Fresh-read the sale document itself inside the transaction, mirroring
    // the fresh-read discipline used for items below. The caller-supplied
    // `sale` object may be stale (e.g. two concurrent/duplicate cancelSale
    // calls for the same sale) — trusting it for the cancelled-guard would
    // let both calls pass and both restore stock (double-credit).
    const saleSnap = await transaction.get(doc(db, 'sales', sale.id));
    if (!saleSnap.exists()) throw new Error('Sale not found');
    if (saleSnap.data().cancelled) throw new Error('This sale is already cancelled');

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
      const item = freshItems[line.itemId];
      const units = item ? getItemUnits(item) : [];
      const unitName = line.unitName || (item && item.baseUnitName) || 'Piece';
      const resolvedUnit = units.find((u) => u.name === unitName);
      const factor = resolvedUnit ? resolvedUnit.factor : (line.factor ?? 1);
      const mvId = newId('m');
      const baseQty = line.qty * factor;
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId: line.itemId, type: 'in', qty: baseQty, shopId: sale.shopId,
        reason: `Sale ${sale.receiptNo} cancelled`, timestamp: now,
      });
    });
    transaction.set(doc(db, 'sales', sale.id), { cancelled: true, cancelledAt: now }, { merge: true });
    // Flip the public mirror too, so a customer (or the owner) scanning this
    // sale's QR code afterward sees it's been voided instead of a stale
    // "valid" receipt. Older sales (pre-dating this feature) have no
    // receiptToken — nothing to update in that case.
    const receiptToken = saleSnap.data().receiptToken;
    if (receiptToken) {
      transaction.set(doc(db, 'receiptsPublic', receiptToken), { cancelled: true }, { merge: true });
    }
  });
}

// A partial return — one or more individual line items (and quantities)
// from an otherwise-completed sale, as opposed to cancelSale() voiding the
// whole transaction. Unlike cancelSale, the sale's own `total`/
// `totalProfit` are never rewritten; instead this appends a record to
// `sale.refunds` and bumps `refundedAmount`/`refundedProfit`, so the
// document stays an honest log of "what was sold, then what came back"
// rather than silently editing history. Reporting code nets these out via
// src/lib/salesMath.js.
//
// `refundLines` is [{ lineId, qty }, ...] — `lineId` matches a
// sale.items[].lineId (sales completed before this feature existed have no
// lineId; refunding those isn't supported, same as this app never
// supported partial refunds before now).
export async function refundSaleItems(db, sale, refundLines, { refundedBy, reason } = {}) {
  if (!refundLines || refundLines.length === 0) {
    throw new Error('Select at least one item to refund.');
  }
  const now = Date.now();

  return runTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(doc(db, 'sales', sale.id));
    if (!saleSnap.exists()) throw new Error('Sale not found');
    const saleData = saleSnap.data();
    if (saleData.cancelled) throw new Error('This sale was cancelled — nothing to refund.');

    // How much of each line has already come back on a PRIOR refund, so a
    // second (or third) partial refund on the same sale can't ever exceed
    // what was actually sold on that line.
    const alreadyRefunded = {};
    (saleData.refunds || []).forEach((r) => {
      (r.items || []).forEach((ri) => {
        alreadyRefunded[ri.lineId] = (alreadyRefunded[ri.lineId] || 0) + ri.qty;
      });
    });

    const saleItems = saleData.items || [];
    const itemIds = [...new Set(refundLines
      .map((rl) => saleItems.find((l) => l.lineId === rl.lineId)?.itemId)
      .filter(Boolean))];

    const freshItems = {};
    for (const itemId of itemIds) {
      const snap = await transaction.get(doc(db, 'items', itemId));
      if (snap.exists()) freshItems[itemId] = snap.data();
    }

    const refundItemRecords = [];
    let refundAmount = 0;
    let refundProfit = 0;
    const stockDelta = {}; // itemId -> { unitName: qty }

    refundLines.forEach((rl) => {
      const line = saleItems.find((l) => l.lineId === rl.lineId);
      if (!line) throw new Error('That line is not part of this sale (or predates refund support).');
      const already = alreadyRefunded[rl.lineId] || 0;
      const remaining = line.qty - already;
      const qty = Number(rl.qty) || 0;
      if (qty <= 0) throw new Error(`Invalid refund quantity for ${line.sku || line.name}`);
      if (qty > remaining) {
        throw new Error(`Cannot refund more than the remaining ${remaining} ${line.unitName} of ${line.sku || line.name}`);
      }

      const amount = line.unitPrice * qty;
      const profit = (line.unitPrice - (line.unitCost || 0)) * qty;
      refundAmount += amount;
      refundProfit += profit;
      refundItemRecords.push({
        lineId: rl.lineId, itemId: line.itemId, sku: line.sku || '', name: line.name || '',
        unitName: line.unitName, qty, unitPrice: line.unitPrice, amount,
      });

      stockDelta[line.itemId] = stockDelta[line.itemId] || {};
      stockDelta[line.itemId][line.unitName] = (stockDelta[line.itemId][line.unitName] || 0) + qty;
    });

    // Restock each affected item — same "cascade back into unitStock"
    // shape cancelSale uses, just for the specific line quantities being
    // returned rather than the whole sale.
    Object.entries(stockDelta).forEach(([itemId, deltas]) => {
      const item = freshItems[itemId];
      if (!item) return; // item was deleted since — refund is still recorded, stock just can't be restored
      const units = getItemUnits(item);
      let newStock = getUnitCounts(item);
      Object.entries(deltas).forEach(([unitName, qty]) => {
        newStock = { ...newStock, [unitName]: (newStock[unitName] || 0) + qty };
      });
      const newQuantity = totalBaseUnits(newStock, units);
      transaction.set(doc(db, 'items', itemId), { ...item, quantity: newQuantity, unitStock: newStock });
    });

    // One movement entry per affected item (not per refunded line) keeps
    // the Movements log readable when a multi-line refund touches several
    // units of the same item.
    Object.entries(stockDelta).forEach(([itemId, deltas]) => {
      const totalQty = Object.values(deltas).reduce((s, q) => s + q, 0);
      const mvId = newId('m');
      transaction.set(doc(db, 'movements', mvId), {
        id: mvId, itemId, type: 'in', qty: totalQty, shopId: saleData.shopId,
        reason: `Refund ${saleData.receiptNo}`, timestamp: now,
      });
    });

    const refundRecord = {
      id: newId('rf'), items: refundItemRecords, amount: refundAmount, profitReduction: refundProfit,
      refundedBy: refundedBy || '', reason: reason || '', refundedAt: now,
    };
    const refunds = [...(saleData.refunds || []), refundRecord];
    const refundedAmount = (saleData.refundedAmount || 0) + refundAmount;
    const refundedProfit = (saleData.refundedProfit || 0) + refundProfit;
    transaction.set(doc(db, 'sales', sale.id), { refunds, refundedAmount, refundedProfit }, { merge: true });

    return refundRecord;
  });
}
