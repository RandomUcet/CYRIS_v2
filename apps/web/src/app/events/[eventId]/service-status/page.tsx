'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Activity, CircleCheck, RefreshCw } from 'lucide-react';
import { serviceModuleLabels } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, ErrorState } from '@/components/common/StateViews';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useServiceStatus } from '@/hooks/useServiceStatus';
import styles from './ServiceStatus.module.css';

export default function ServiceStatusPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { locale, t, formatTime } = usePreferences();
  const { data, error, refresh } = useServiceStatus();
  const cs = locale === 'cs';
  return <AppShell title={t('serviceStatus.title')} breadcrumbs={[{ label: 'Support' }, { label: 'Service status' }]}
    actions={<button type="button" className="btn btn-secondary" onClick={refresh}><RefreshCw size={15} />{t('action.refresh')}</button>}>
    <div className={styles.page}>
      {error && <ErrorState message={cs ? 'Aktuální stav služeb se nepodařilo načíst.' : 'The current service status could not be loaded.'} onRetry={refresh} />}
      {!data && !error && <LoadingState />}
      {data && <section className={styles.panel} aria-live="polite">
        <header className={styles.heading}>
          {data.items.length ? <Activity size={21} aria-hidden /> : <CircleCheck size={21} aria-hidden />}
          <div><h2>{error ? (cs ? 'Poslední známý stav' : 'Last known status') : data.items.length ? (cs ? 'Služby s omezením' : 'Services with limited availability') : (cs ? 'Všechny vaše služby jsou dostupné' : 'All your services are available')}</h2>
            <small>{cs ? 'Aktualizováno' : 'Updated'} <time dateTime={data.generatedAt}>{formatTime(data.generatedAt)}</time></small></div>
        </header>
        {data.items.map(item => <article key={item.service} className={styles.row}>
          <div><strong>{serviceModuleLabels[item.service][cs ? 'cs' : 'en']}</strong><p>{item.impact === 'READ_ONLY'
            ? (cs ? 'Záznamy můžete prohlížet. Ukládání změn je dočasně nedostupné.' : 'You can view records. Saving changes is temporarily unavailable.')
            : (cs ? 'Službu zkuste otevřít později.' : 'Try opening the service again later.')}</p></div>
          <span className="service-pill restricted">{t('serviceStatus.impact.' + item.impact.toLowerCase())}</span>
        </article>)}
      </section>}
      <div className={styles.links}>
        <Link href={`/events/${eventId}/my-work`}>{cs ? 'Moje práce' : 'My Work'}</Link>
        <Link href={`/events/${eventId}/support`}>{cs ? 'Kontaktovat podporu' : 'Contact support'}</Link>
      </div>
    </div>
  </AppShell>;
}
