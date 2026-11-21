'use client';

import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import { ModuleAvailabilityPanel } from '@/components/admin/ModuleAvailabilityPanel';
import { OperationalHoldsPanel } from '@/components/admin/OperationalHoldsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import styles from '@/components/admin/ModuleAvailability.module.css';

export default function ModuleAvailabilityPage() {
  const { isPlatformAdmin, loading } = useAuth();
  const { events, currentEvent, selectEvent, loadingEvents } = useEvent();
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  if (loading) return <AppShell><LoadingState /></AppShell>;
  if (!isPlatformAdmin) return <AppShell><EmptyState title={cs ? 'Stránka není dostupná' : 'Page unavailable'}
    description={cs ? 'Pokračujte ve svém pracovním prostoru.' : 'Continue in your workspace.'}
    action={<Link className="btn btn-secondary" href={currentEvent ? `/events/${currentEvent.id}/my-work` : '/events'}>{cs ? 'Otevřít pracovní prostor' : 'Open workspace'}</Link>} /></AppShell>;

  return <AppShell title={cs ? 'Dostupnost modulů' : 'Module availability'} breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: 'Module availability' }]}>
    <div className={styles.page}>
      <label className={styles.eventLabel}>{cs ? 'Událost' : 'Event'}
        <select value={currentEvent?.id ?? ''} onChange={e => selectEvent(e.target.value)} disabled={loadingEvents || !events.length}>
          <option value="" disabled>{cs ? 'Vyberte událost' : 'Select an event'}</option>
          {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
      </label>
      {loadingEvents ? <LoadingState /> : currentEvent ? <><OperationalHoldsPanel key={'holds-' + currentEvent.id} eventId={currentEvent.id} /><ModuleAvailabilityPanel key={'modules-' + currentEvent.id} eventId={currentEvent.id} /></> :
        <EmptyState title={events.length ? (cs ? 'Vyberte událost' : 'Select an event') : (cs ? 'Žádné události' : 'No events')}
          description={events.length ? (cs ? 'Zobrazí se nastavení dostupnosti a historie změn pro vybranou událost.' : 'Choose an event to see its service availability settings and history.') : (cs ? 'Pro nastavení modulů nejprve vytvořte událost.' : 'Create an event to configure module availability.')}
          action={events.length ? undefined : <Link href="/admin/events" className="btn btn-secondary">{cs ? 'Správa událostí' : 'Manage events'}</Link>} />}
    </div>
  </AppShell>;
}
