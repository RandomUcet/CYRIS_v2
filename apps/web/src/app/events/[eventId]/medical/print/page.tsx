'use client';

import {useEffect, useState} from 'react';
import {useParams, useSearchParams} from 'next/navigation';
import type {MedicalEncounterItem} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
import {PrintSheet, PrintSection} from '@/components/print/PrintSheet';
import {filterMedicalRunSheet, parseMedicalRunSheetView} from '@/lib/medical-run-sheet';
import styles from './medical-run-sheet.module.css';

const at = (value: string | null | undefined) => value ? new Date(value).toLocaleString('cs-CZ') : '—';

export default function PrintableMedicalRunSheet() {
  const {eventId} = useParams() as {eventId: string};
  const query = useSearchParams();
  const [items,setItems] = useState<MedicalEncounterItem[] | null>(null);
  const [error,setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiClient.listMedicalEncounters(eventId).then(response => {
      if (!active) return;
      if (!response.ok || !response.data) throw new Error(response.error || 'Zdravotnické záznamy nejsou přístupné');
      setItems(response.data);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Načítání selhalo');
    });
    return () => { active = false; };
  }, [eventId]);

  if (error) return <p role="alert">Nelze vytvořit zdravotnický přehled: {error}</p>;
  if (!items) return <p>Načítám zdravotnický přehled…</p>;

  // API already limits the rows to medical resources accessible to this user.
  // Never fetch administrative totals here: they may reveal other teams' patients.
  const view = parseMedicalRunSheetView(query.get('view'));
  const visible = filterMedicalRunSheet(items, {
    view, search: query.get('search') ?? '', triage: query.get('triage') ?? '',
  });
  const viewNames = {active:'Aktivní', triage:'Triage', transfers:'Předané', all:'Všechny'};
  return <PrintSheet title="Zdravotnický přehled zásahů / Medical run sheet"
    identifier={`Cvičení ${eventId.slice(0,8)}`}
    subtitle={`Filtr: ${viewNames[view]} · Zobrazeno: ${visible.length} / ${items.length} dostupných záznamů`}>
    <PrintSection title="Evidence dostupných zdravotnických záznamů">
      {visible.length === 0 ? <p>Pro zvolené filtry nejsou dostupné žádné záznamy.</p> :
        <table className={styles.table}>
          <thead><tr>
            <th>Číslo</th><th>Osoba</th><th>Triage</th><th>Stav</th>
            <th>Hlavní potíže</th><th>Tým</th><th>Založeno</th>
          </tr></thead>
          <tbody>{visible.map(item => <tr key={item.id}>
            <td>{item.medicalNumber}</td>
            <td>{item.personDisplayName || '—'}</td>
            <td>{item.triageCategory}</td>
            <td>{item.status}</td>
            <td>{item.chiefComplaint || '—'}</td>
            <td>{item.assignedUnitName || '—'}</td>
            <td>{at(item.openedAt)}</td>
          </tr>)}</tbody>
        </table>}
    </PrintSection>
    <p className={styles.note}>Důvěrný simulovaný zdravotnický dokument. Obsahuje pouze záznamy dostupné přihlášenému uživateli v okamžiku načtení.</p>
  </PrintSheet>;
}
