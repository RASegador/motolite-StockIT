import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import QRCode from 'qrcode';

// Same canvas-for-downloadability rationale as BarcodeImage.
const QRCodeImage = forwardRef(function QRCodeImage({ value, size = 120 }, ref) {
  const canvasRef = useRef(null);
  useImperativeHandle(ref, () => canvasRef.current, []);

  useEffect(() => {
    if (!value || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1 }, () => {
      // Ignore errors (e.g. empty value) — leave the canvas blank rather than crashing the screen.
    });
  }, [value, size]);

  return <canvas ref={canvasRef} />;
});

export default QRCodeImage;
