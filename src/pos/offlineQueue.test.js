import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueSale, listQueuedSales, removeQueuedSale, looksOffline } from './offlineQueue';

beforeEach(() => {
  window.localStorage.clear();
});

describe('enqueueSale / listQueuedSales / removeQueuedSale', () => {
  it('queues a sale and lists it back out', () => {
    const id = enqueueSale({ cartLines: [{ itemId: 'i1', qty: 1 }], amountReceived: 100, meta: { shopId: 's1' } });
    const queue = listQueuedSales();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(id);
    expect(queue[0].saleInput.meta.shopId).toBe('s1');
  });

  it('preserves queue order across multiple enqueues', () => {
    enqueueSale({ cartLines: [], amountReceived: null, meta: {} });
    enqueueSale({ cartLines: [], amountReceived: null, meta: {} });
    expect(listQueuedSales()).toHaveLength(2);
  });

  it('removes a queued sale by id', () => {
    const id = enqueueSale({ cartLines: [], amountReceived: null, meta: {} });
    removeQueuedSale(id);
    expect(listQueuedSales()).toHaveLength(0);
  });

  it('survives a corrupted localStorage value by treating it as empty', () => {
    window.localStorage.setItem('motolite-pos-offline-queue', 'not json');
    expect(listQueuedSales()).toEqual([]);
  });
});

describe('looksOffline', () => {
  it('treats navigator.onLine === false as offline', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(looksOffline(new Error('anything'))).toBe(true);
    spy.mockRestore();
  });

  it('treats a network-flavored error message as offline even if onLine reads true', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(looksOffline(new Error('Failed to fetch'))).toBe(true);
    expect(looksOffline(new Error('client is offline'))).toBe(true);
    spy.mockRestore();
  });

  it('treats a Firestore "unavailable" error code as offline', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const err = new Error('internal');
    err.code = 'unavailable';
    expect(looksOffline(err)).toBe(true);
    spy.mockRestore();
  });

  it('does not treat an ordinary business-logic error as offline', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(looksOffline(new Error('Not enough stock for N50'))).toBe(false);
    spy.mockRestore();
  });
});
