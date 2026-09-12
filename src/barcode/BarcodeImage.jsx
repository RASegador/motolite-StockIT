import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Renders to a <canvas> (not <svg>) specifically so ProductCodes can call
// canvas.toDataURL('image/png') to download it — SVG would need an extra
// serialize-and-rasterize step for the same result.
const BarcodeImage = forwardRef(function BarcodeImage({ value, height = 50 }, ref) {
  const canvasRef = useRef(null);
  useImperativeHandle(ref, () => canvasRef.current, []);

  useEffect(() => {
    if (!value || !canvasRef.current) return;
    try {
      JsBarcode(canvasRef.current, value, { format: 'CODE128', height, displayValue: true });
    } catch {
      // Invalid barcode value (e.g. empty/malformed) — leave the canvas blank rather than crashing the screen.
    }
  }, [value, height]);

  return <canvas ref={canvasRef} />;
});

export default BarcodeImage;
