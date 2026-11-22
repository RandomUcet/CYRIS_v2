'use client';

import { useEffect, useRef } from 'react';

/**
 * Consistent keyboard handling for legacy dialogs across CYRIS workspaces.
 * Only mount when a modal is actually open; stable close ref avoids moving
 * focus back to the first field on every keystroke.
 */
export function useDialogAccessibility(open: boolean, onRequestClose: () => void): void {
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    if (!open) return;
    const candidates = document.querySelectorAll<HTMLElement>(
      '.modal-backdrop [role="dialog"], .dialog-overlay [role="dialog"]',
    );
    const dialog = candidates.item(candidates.length - 1);
    if (!dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.tabIndex = -1;

    const focusable = (): HTMLElement[] => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter(node => node.getClientRects().length > 0 && !node.hasAttribute('inert'));

    const frame = requestAnimationFrame(() => {
      const fields = focusable();
      const firstField = fields.find(node =>
        node.matches('input:not([type="hidden"]), select, textarea, [autofocus]'));
      (firstField ?? fields[0] ?? dialog).focus();
    });

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const fields = focusable();
      if (!fields.length) { event.preventDefault(); dialog.focus(); return; }
      const first = fields[0]!;
      const last = fields[fields.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !dialog.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
}
