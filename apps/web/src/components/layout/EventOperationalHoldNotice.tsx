'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { serviceModuleLabels, type CurrentOperationalHolds } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';

export function EventOperationalHoldNotice({ eventId }: { eventId: string }) {
  const { locale } = usePreferences();
  const { isPlatformAdmin } = useAuth();
  const [status, setStatus] = useState<CurrentOperationalHolds | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const response = await apiClient.getOperationalHoldsCurrent(eventId);
      if (mounted) {
        setUnavailable(!response.ok);
        setStatus(response.ok && response.data ? response.data : null);
      }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    window.addEventListener('focus', load);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener('focus', load); };
  }, [eventId]);
  if (!status?.holds.length && !unavailable) return null;
  const cs = locale === 'cs';
  return <aside role="status" aria-live="polite" style={{
    display: 'flex', gap: '.8rem', padding: '.8rem 1rem', margin: '1rem auto',
    maxWidth: '75rem', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--status-warning)', color: 'var(--text-primary)', background: 'var(--bg-panel)',
  }}><AlertTriangle size={22} aria-hidden/><div>
      <strong>{cs ? 'Provozní pauza cvičení' : 'Exercise operational pause'}</strong>
      <p>{unavailable
        ? (cs ? 'Stav provozních omezení nelze ověřit. Před další prací obnovte spojení nebo kontaktujte podporu.' : 'Operational pause status is temporarily unavailable. Reconnect or contact support.')
        : isPlatformAdmin
          ? (cs ? 'Provozní pauza je aktivní pro dotčené účastníky. Správa a obnovení provozu zůstávají dostupné.' : 'A pause is active for affected participants. Administrator recovery remains available.')
          : (cs ? 'Změny a uploady jsou dočasně omezené. Záznamy lze dál číst.' : 'Writes and uploads are temporarily restricted. Reading remains available.')}</p>
      {status?.holds.map(hold => <p key={hold.id}><strong>{hold.module === 'ALL' ? (cs ? 'Všechny funkce' : 'All features') : serviceModuleLabels[hold.module][cs ? 'cs' : 'en']}:</strong> {hold.reason}</p>)}
      <Link href={'/events/' + eventId + '/support'}>{cs ? 'Kontaktovat podporu' : 'Contact support'}</Link>
    </div></aside>;
}
