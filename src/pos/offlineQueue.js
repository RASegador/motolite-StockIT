import { newId } from '../lib/format';
import { completeSale } from './salesActions';

// A same-tab, same-browser holding pen for a sale that couldn't reach
// Firestore — a dropped connection, or the shop's internet being down
// entirely. Nothing here is a substitute for a real backend outbox: it
// only survives on the device it was queued on, and only as long as
// localStorage isn't cleared. That's still strictly better than the
// previous behavior (the sale is simply lost and the cashier has to
// remember to re-ring it once things are back), which is the actual gap
// this closes — see the "offline-resilient POS" item in the pre-launch
// recommendations.
const KEY = 'motolite-pos-offline-queue';

function readQueue() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage disabled/full — the queue just can't persist across a
    // reload; the in-memory copy the caller already has is still usable
    // for this page session.
  }
}

export function listQueuedSales() {
  return readQueue();
}

// `saleInput` is exactly what completeSale(db, cartLines, amountReceived,
// meta) needs, bundled up so a later sync can replay it unchanged.
export function enqueueSale(saleInput) {
  const entry = { id: newId('pq'), queuedAt: Date.now(), saleInput };
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry.id;
}

export function removeQueuedSale(id) {
  writeQueue(readQueue().filter((e) => e.id !== id));
}

// Network-vs-business-logic errors look the same (a thrown Error) from
// here, so this can't perfectly distinguish "still offline, try later"
// from "this sale is now actually invalid" (e.g. stock changed enough
// while queued that it would oversell). It stops at the FIRST failure
// rather than skipping past it — replaying out of order could sell stock
// a later-queued sale already accounted for — and reports which entry
// failed and why, so the cashier/manager can decide whether to keep
// waiting or discard that one sale.
export async function syncQueuedSales(db) {
  const queue = readQueue();
  let synced = 0;
  for (const entry of queue) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await completeSale(db, entry.saleInput.cartLines, entry.saleInput.amountReceived, entry.saleInput.meta);
      removeQueuedSale(entry.id);
      synced++;
    } catch (err) {
      return { synced, remaining: readQueue().length, error: err.message, failedEntryId: entry.id };
    }
  }
  return { synced, remaining: 0, error: null, failedEntryId: null };
}

// A rough, deliberately conservative signal for "should we even try a live
// write, or go straight to the queue" — `navigator.onLine` is known to be
// unreliable (some browsers/OSes report `true` on a network with no real
// internet), so completeSale() is still attempted first in POSView; this
// is only used to decide whether a FAILED completeSale looks network-ish
// enough to queue rather than just show as a hard error.
export function looksOffline(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  // Firestore's JS SDK sets `.code` to 'unavailable' for a dropped
  // connection — checked ahead of the message-text fallback since it's
  // the more reliable signal when it's present.
  if (error?.code === 'unavailable') return true;
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('network') || msg.includes('unavailable') || msg.includes('failed to fetch') || msg.includes('offline');
}
