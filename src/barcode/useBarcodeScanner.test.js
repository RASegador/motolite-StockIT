import { describe, it, expect } from 'vitest';
import { isLikelyScannerBurst } from './useBarcodeScanner';

describe('isLikelyScannerBurst', () => {
  it('treats a sub-40ms gap between keystrokes as scanner input', () => {
    expect(isLikelyScannerBurst(30)).toBe(true);
  });

  it('treats a human typing-speed gap (150ms+) as NOT a scan', () => {
    expect(isLikelyScannerBurst(150)).toBe(false);
  });

  it('treats exactly the 40ms boundary as still human (not a scan)', () => {
    expect(isLikelyScannerBurst(40)).toBe(false);
  });

  it('treats the very first keystroke (no prior gap, null) as NOT a scan on its own', () => {
    expect(isLikelyScannerBurst(null)).toBe(false);
  });
});
