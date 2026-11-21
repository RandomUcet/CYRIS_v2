'use client';

import Link from 'next/link';
import { Activity, Calendar, ClipboardCheck, KeyRound, Users, Building2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { StatusBadge } from '@/components/common/Badges';

const adminLinks = [
  { href: '/admin/events', icon: Calendar, titleKey: 'nav.events', descriptionKey: 'admin.overview.events' },
  { href: '/admin/units', icon: Building2, titleKey: 'nav.units', descriptionKey: 'admin.overview.units' },
  { href: '/admin/users', icon: Users, titleKey: 'nav.users', descriptionKey: 'admin.overview.users' },
  { href: '/admin/roles', icon: KeyRound, titleKey: 'nav.roles', descriptionKey: 'admin.overview.roles' },
  { href: '/admin/settings/modules', icon: Activity, titleKey: 'nav.modules', descriptionKey: 'admin.overview.modules' },
  { href: '/admin/audit', icon: ClipboardCheck, titleKey: 'nav.audit', descriptionKey: 'admin.overview.audit' },
];

export default function AdminOverviewPage() {
  const { t,locale } = usePreferences();
  const { events } = useEvent();
  const { isPlatformAdmin } = useAuth();

  return (
    <AppShell breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.adminOverview') }]}>
      <div className="admin-overview">
        <div className="admin-overview-intro">
          <div className="admin-overview-kicker">
            <Activity size={16} />
            <span>{t('nav.administration')}</span>
          </div>
          <h1>{t('nav.adminOverview')}</h1>
          <p>{t('admin.overview.subtitle')}</p>
        </div>
        <section className="admin-overview-section">
          <h2>{t('admin.overview.eventsTitle')}</h2>
          <div className="admin-overview-events">
            {events.length === 0 ? (
              <p className="admin-overview-muted">{t('empty.events')}</p>
            ) : (
              events.map((event) => (
                <Link className="admin-overview-event-row" href="/admin/events" key={event.id}>
                  <span>
                    <strong>{event.name}</strong>
                    <small>{event.slug}</small>
                  </span>
                  <StatusBadge status={event.status} />
                </Link>
              ))
            )}
          </div>
        </section>
        <section className="admin-overview-section">
          <h2>{t('admin.overview.administrationTitle')}</h2>
        <div className="admin-overview-list">
          {adminLinks.filter(link => link.href !== '/admin/settings/modules' || isPlatformAdmin).map(({ href, icon: Icon, titleKey, descriptionKey }) => (
            <Link className="admin-overview-row" href={href} key={href}>
              <span className="admin-overview-row-icon"><Icon size={18} /></span>
              <span>
                <strong>{t(titleKey)}</strong>
                <small>{t(descriptionKey)}</small>
              </span>
            </Link>
          ))}
          {isPlatformAdmin && <Link className="admin-overview-row" href="/admin/health">
            <span className="admin-overview-row-icon"><Activity size={18}/></span>
            <span><strong>{locale==='cs'?'Zdraví systému':'System health'}</strong>
              <small>{locale==='cs'?'Skutečný stav API a provozních závislostí. Nejde o DEFCON ani simulované odstávky.':'Actual API and dependency health; separate from DEFCON and exercise disruptions.'}</small></span>
          </Link>}
        </div>
        </section>
      </div>
    </AppShell>
  );
}
