
import React, { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface ScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onScanSuccess }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const elementId = "qr-reader-container";

  useEffect(() => {
    // We use the direct Html5Qrcode class instead of the Scanner UI version
    // This allows for a much cleaner look without the library's default buttons
    const html5QrCode = new Html5Qrcode(elementId);
    scannerRef.current = html5QrCode;

    const config = { 
      fps: 10, 
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
    };

    const startScanner = async () => {
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            onScanSuccess(decodedText);
          },
          (errorMessage) => {
            // Failure is expected when no QR is in view
          }
        );
      } catch (err) {
        console.error("Unable to start scanning.", err);
      }
    };

    startScanner();

    return () => {
      const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
          try {
            await scannerRef.current.stop();
            // Optional: clear the container element
          } catch (err) {
            console.error("Failed to stop scanner", err);
          }
        }
      };
      stopScanner();
    };
  }, [onScanSuccess]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {/* Target element for Html5Qrcode */}
      <div id={elementId} className="w-full h-full"></div>
      
      {/* Custom Overlay (UI Layer) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[250px] h-[250px] border-2 border-indigo-500 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
          <div className="absolute inset-0 border-2 border-white/20 rounded-3xl animate-pulse"></div>
          {/* Scanning line animation */}
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-scan-line"></div>
        </div>
      </div>
      
      <style>{`
        @keyframes scan-line {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan-line {
          animation: scan-line 2s linear infinite;
        }
        /* Hide html5-qrcode's built-in messages and UI if they bleed through */
        #${elementId} video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }
        #${elementId} img[alt="Camera based scan"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
};

export default Scanner;
