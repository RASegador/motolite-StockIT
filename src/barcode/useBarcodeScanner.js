import { useEffect, useRef } from 'react';

const SCAN_GAP_MS = 40;
const SCAN_MIN_LENGTH = 4;

export function isLikelyScannerBurst(gapMs) {
  return gapMs != null && gapMs < SCAN_GAP_MS;
}

export function useBarcodeScanner(onScan) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // never intercept while typing in a field

      const now = performance.now();
      const gap = lastKeyTimeRef.current != null ? now - lastKeyTimeRef.current : null;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= SCAN_MIN_LENGTH) onScan(bufferRef.current);
        bufferRef.current = '';
        return;
      }
      if (e.key.length !== 1) return; // ignore Shift, Ctrl, arrow keys, etc.

      if (!isLikelyScannerBurst(gap) && bufferRef.current.length > 0) {
        bufferRef.current = ''; // gap too long mid-sequence — this wasn't a scan, reset
      }
      bufferRef.current += e.key;
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
}
