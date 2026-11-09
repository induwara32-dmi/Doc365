'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function QrCodeView({ text, size = 180, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && text) {
      QRCode.toCanvas(canvasRef.current, text, {
        width: size,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      }, (error) => {
        if (error) console.error('QR code generation error:', error);
      });
    }
  }, [text, size]);

  return (
    <div className={`inline-flex flex-col items-center p-2 bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  );
}
