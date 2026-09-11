import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeImage({ value, height = 50 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!value || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, { format: 'CODE128', height, displayValue: true });
    } catch {
      // Invalid barcode value (e.g. empty/malformed) — leave the SVG blank rather than crashing the screen.
    }
  }, [value, height]);

  return <svg ref={svgRef} />;
}
