'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CirclePause, RefreshCw } from 'lucide-react';
import { serviceModuleLabels, type ServiceModule } from '@cyris/contracts';
import { AppShell } from './AppShell';
import { LoadingState } from '@/components/common/StateViews';
import { DefconPanel } from '@/components/command/DefconPanel';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ServiceStatusProvider, useServiceStatus } from '@/hooks/useServiceStatus';
import { serviceModuleForPath } from '@/lib/service-module-route';
import styles from './ServiceAvailability.module.css';

export function EventServiceAvailability({ eventId, children }: { eventId: string; children: ReactNode }) {
  const pathname = usePathname();
  const { currentUser,viewAs } = useAuth();
  const service = serviceModuleForPath(pathname);
  return <ServiceStatusProvider key={(currentUser?.user.id??'')+':'+(viewAs?.id??'')+':'+eventId} eventId={currentUser ? eventId : null}>
    {service ? <ModuleContent eventId={eventId} service={service}>{children}</ModuleContent> : children}
  </ServiceStatusProvider>;
}

function ModuleContent({ eventId, service, children }: { eventId: string; service: ServiceModule; children: ReactNode }) {
  const { data, error, refresh } = useServiceStatus();
  const { locale, t } = usePreferences();
  const { hasPermission, currentUser } = useAuth();
  if (!currentUser) return <>{children}</>;
  const cs = locale === 'cs';
  const label = serviceModuleLabels[service][cs ? 'cs' : 'en'];
  if (!data && !error) return <AppShell><LoadingState /></AppShell>;
  const impact = data?.items.find(item => item.service === service)?.impact;
  if (impact !== 'UNAVAILABLE') return <>{children}</>;

  return <AppShell title={label} breadcrumbs={[{ label }]}>
    <div className={styles.fallback}>
      <section className={styles.message} aria-live="polite">
        <CirclePause size={25} aria-hidden />
        <div><h2>{cs ? 'Služba je dočasně nedostupná' : 'Service temporarily unavailable'}</h2>
          <p>{cs ? 'Můžete pokračovat v jiné části pracovního prostoru nebo se obrátit na podporu.' : 'You can continue in another part of your workspace or contact support.'}</p>
          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={refresh}><RefreshCw size={14} />{cs ? 'Zkusit znovu' : 'Try again'}</button>
            <Link href={`/events/${eventId}/service-status`}>{t('serviceStatus.title')}</Link>
            <Link href={`/events/${eventId}/support`}>{cs ? 'Kontaktovat podporu' : 'Contact support'}</Link>
          </div>
        </div>
      </section>
      {service === 'command' && (hasPermission('command.read', eventId) || hasPermission('command.defcon.change', eventId)) && <DefconPanel eventId={eventId} />}
    </div>
  </AppShell>;
}
