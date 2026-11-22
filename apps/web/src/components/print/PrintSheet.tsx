'use client';
import { useEffect, useState, type ReactNode } from 'react';
import styles from './PrintSheet.module.css';

/** Authenticated records only; text stays React-escaped. No printable server URL bypass. */
export function PrintSheet({ title, identifier, subtitle, children }: {
  title: string; identifier: string; subtitle?: string; children: ReactNode;
}) {
  const [generated,setGenerated] = useState('');
  useEffect(()=>setGenerated(new Date().toLocaleString('cs-CZ')),[]);
  return <main className={'cyris-print-root ' + styles.sheet}>
    <div className={styles.toolbar}>
      <button type="button" onClick={()=>window.print()}>🖨 Tisknout / uložit jako PDF</button>
      <button type="button" onClick={()=>window.close()}>Zavřít náhled</button>
    </div>
    <header className={styles.header}>
      <p className={styles.simulation}>CYRIS · CzechCybertron · SIMULACE / EXERCISE ONLY</p>
      <h1>{title}</h1>
      <p><strong>{identifier}</strong>{subtitle ? ' · ' + subtitle : ''}</p>
      <p className={styles.generated}>Vytištěno / Generated: {generated || '—'}</p>
    </header>
    {children}
    <footer className={styles.footer}>CYRIS · pouze údaje simulovaného cvičení · přístup podle oprávnění</footer>
  </main>;
}
export function PrintSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2><div>{children}</div></section>;
}
export function PrintField({ label, value }: { label: string; value: ReactNode }) {
  return <dl className={styles.field}><dt>{label}</dt><dd>{value ?? '—'}</dd></dl>;
}
