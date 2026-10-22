'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Printer, X } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';

export interface EvidenceLabelProps {
  evidenceNumber: string;
  evidenceId?: string;
  title: string;
  eventName: string;
  evidenceType?: string;
  securedAt?: string | null;
  caseNumber?: string | null;
  onClose?: () => void;
}

export function EvidenceLabel({
  evidenceNumber,
  evidenceId,
  title,
  eventName,
  evidenceType = 'SECURED EVIDENCE',
  securedAt,
  caseNumber,
  onClose,
}: EvidenceLabelProps) {
  const { formatTime } = usePreferences();
  const barcodeRef = useRef<SVGSVGElement | null>(null);
  const [qrSvg, setQrSvg] = useState<string>('');

  // Stable non-sensitive CYRIS reference
  const stableIdentifierRef = `CYRIS:EVID:${evidenceNumber}`;

  useEffect(() => {
    // Generate clean client-side SVG QR code without external network calls
    void QRCode.toString(stableIdentifierRef, {
      type: 'svg',
      margin: 1,
      width: 76,
      color: { dark: '#000000', light: '#ffffff' },
    }).then((svg) => {
      setQrSvg(svg);
    });

    // Generate Code 128 barcode directly onto SVG element
    if (barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, evidenceNumber, {
          format: 'CODE128',
          width: 1.4,
          height: 32,
          displayValue: false,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        console.error('Failed to generate Code128 barcode:', err);
      }
    }
  }, [evidenceNumber, stableIdentifierRef]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="no-print" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>Print Physical Evidence Tag</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={handlePrint} className="btn-primary" style={{ padding: '4px 10px', fontSize: '12px' }}>
            <Printer size={14} /> Print Label
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* The Printable Tag Box */}
      <div className="evidence-label-box printable-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.08em' }}>CYRIS · EVIDENCE</div>
            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>{eventName}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>{evidenceNumber}</div>
            {caseNumber && <div style={{ fontSize: '10px', fontWeight: 600 }}>CASE: {caseNumber}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
              {title}
            </div>
            <div style={{ fontSize: '9px', color: '#374151' }}>TYPE: {evidenceType}</div>
            {securedAt && (
              <div style={{ fontSize: '9px', color: '#374151' }}>
                SECURED: {formatTime(securedAt)}
              </div>
            )}
            <div style={{ fontSize: '8px', color: '#6b7280', marginTop: '4px', wordBreak: 'break-all' }}>
              ID: {evidenceId}
            </div>
          </div>

          <div
            style={{ width: '76px', height: '76px', flexShrink: 0 }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed #000' }}>
          <svg ref={barcodeRef} style={{ maxWidth: '100%' }} />
          <div style={{ fontSize: '9px', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600 }}>
            *{evidenceNumber}*
          </div>
        </div>
      </div>
    </div>
  );
}
