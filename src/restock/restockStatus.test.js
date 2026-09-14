import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, statusBadgeClass } from './restockStatus';

describe('STATUS_LABELS', () => {
  it('has a human label for every status the restock workflow can reach', () => {
    expect(STATUS_LABELS).toMatchObject({
      pending: 'Pending', approved: 'Approved', rejected: 'Rejected', fulfilled: 'Fulfilled', cancelled: 'Cancelled',
    });
  });
});

describe('statusBadgeClass', () => {
  it('reads fulfilled as "good" (reuses the in-stock badge color)', () => {
    expect(statusBadgeClass('fulfilled')).toBe('status-in');
  });

  it('reads rejected and cancelled as "bad" (reuses the out-of-stock badge color)', () => {
    expect(statusBadgeClass('rejected')).toBe('status-out');
    expect(statusBadgeClass('cancelled')).toBe('status-out');
  });

  it('reads pending and approved as "in progress" (reuses the low-stock badge color)', () => {
    expect(statusBadgeClass('pending')).toBe('status-low');
    expect(statusBadgeClass('approved')).toBe('status-low');
  });

  it('falls back to "in progress" for any unrecognized status rather than throwing', () => {
    expect(statusBadgeClass('something-new')).toBe('status-low');
  });
});
