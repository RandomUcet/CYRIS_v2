'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './scenario.module.css';

export function ScenarioDialog({ title, closeLabel, onClose, children }: {
  title: string; closeLabel: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={heading} className={styles.dialog}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <header className={styles.dialogHeader}>
        <h2 id={heading}>{title}</h2>
        <button type="button" className="btn btn-secondary" aria-label={closeLabel} onClick={onClose}><X size={16} /></button>
      </header>
      {children}
    </dialog>
  );
}
