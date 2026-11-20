'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SideNav } from './SideNav';
import Link from 'next/link';
import { useServiceStatus } from '@/hooks/useServiceStatus';
import { serviceModuleForPath } from '@/lib/service-module-route';
import availabilityStyles from './ServiceAvailability.module.css';
import { TopBar } from './TopBar';
import { CommandPalette } from '../common/CommandPalette';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingState } from '../common/StateViews';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';
import { usePathname } from 'next/navigation';
import { ViewAsBanner } from './ViewAsBanner';

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

const mobileQuery = '(max-width: 700px)';
const narrowQuery = '(max-width: 1199px)';

function desktopCollapsed(narrow: boolean) {
  try {
    const saved = localStorage.getItem('cyris.sidebar');
    if (saved === 'rail' || saved === 'expanded') return saved === 'rail';
  } catch {}
  return narrow;
}

export function AppShell({ children, breadcrumbs, title, actions }: AppShellProps) {
  const { currentUser, loading, isPlatformAdmin, previewInvalid, viewAs } = useAuth();
  const { t, locale } = usePreferences();
  const pathname = usePathname();
  const { data: services } = useServiceStatus();
  const module = serviceModuleForPath(pathname);
  const readOnly = services?.items.some(item => item.service === module && item.impact === 'READ_ONLY');
  const paddedRoute = /\/(tasks|medical|documents|forensics|court)(\/[^/]+)?$/.test(pathname);
  const localBreadcrumbs = breadcrumbs?.map(item => ({...item, label: workspaceLabel(locale, item.label)}));
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && desktopCollapsed(window.matchMedia(narrowQuery).matches));
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(mobileQuery).matches);
  const [drawer, setDrawer] = useState(false);
  const mainColumn = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeDrawer = () => {
    setDrawer(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };
  const toggleSidebar = () => {
    if (mobile) { if (drawer) closeDrawer(); else setDrawer(true); return; }
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('cyris.sidebar', next ? 'rail' : 'expanded'); } catch {}
  };
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showWorkspaceHelp, setShowWorkspaceHelp] = useState(false);

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (currentUser) {
          e.preventDefault();
          setIsSearchOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser]);

  useEffect(() => {
    const small = window.matchMedia(mobileQuery);
    const narrow = window.matchMedia(narrowQuery);
    const sync = () => {
      setMobile(small.matches);
      setDrawer(false);
      setCollapsed(desktopCollapsed(narrow.matches));
    };
    sync();
    small.addEventListener('change', sync);
    narrow.addEventListener('change', sync);
    return () => { small.removeEventListener('change', sync); narrow.removeEventListener('change', sync); };
  }, []);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!mobile || !drawer) return;
    mainColumn.current?.setAttribute('inert', '');
    const nav = document.getElementById('workspace-nav');
    nav?.querySelector<HTMLButtonElement>('.nav-toggle')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); }
      if (event.key !== 'Tab') return;
      const controls = nav?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)');
      const first = controls?.[0], last = controls?.[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => { mainColumn.current?.removeAttribute('inert'); window.removeEventListener('keydown', handleKey); };
  }, [mobile, drawer]);

  // Guard: if unauthenticated in AppShell, immediately redirect to login root
  useEffect(() => {
    if (!loading && !currentUser && !viewAs && !previewInvalid) {
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  }, [loading, currentUser, viewAs, previewInvalid]);

  if (previewInvalid || (!loading && !currentUser && viewAs)) {
    return <div className="preview-unavailable"><ViewAsBanner /></div>;
  }

  if (loading || !currentUser) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState message={!currentUser ? 'Session required. Redirecting to login...' : 'Authenticating CYRIS operator session...'} />
      </div>
    );
  }

  return (
    <div className={`workspace-shell${drawer && mobile ? ' drawer-open' : ''}`}>
      <React.Suspense fallback={<div className="workspace-nav-placeholder" />}><SideNav collapsed={!mobile && collapsed} mobile={mobile} onToggleCollapse={toggleSidebar} onNavigate={() => { if (mobile) closeDrawer(); }} /></React.Suspense>

      {mobile && drawer && <button type="button" className="nav-scrim" tabIndex={-1} aria-label={locale === 'cs' ? 'Zavřít navigaci' : 'Close navigation'} onClick={closeDrawer} />}
      <div ref={mainColumn} className="workspace-main-column">
        <ViewAsBanner />
        <TopBar menuOpen={mobile && drawer} menuButton={menuButton} onOpenMenu={() => setDrawer(true)} onOpenSearch={() => setIsSearchOpen(true)} breadcrumbs={localBreadcrumbs} />
        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
          {currentUser && !isPlatformAdmin && (
            <div className="workspace-help-bar">
              <button type="button" onClick={() => setShowWorkspaceHelp((value) => !value)} aria-expanded={showWorkspaceHelp}>
                {t('workspace.help')}
              </button>
              {showWorkspaceHelp && (
                <span className="workspace-help-panel" role="note">
                  {t('workspace.helpCopy')}
                </span>
              )}
            </div>
          )}
          {readOnly && services && <div className={availabilityStyles.notice} role="status">
            <strong>{t('serviceStatus.impact.read_only')}</strong>
            <span>{locale === 'cs' ? 'Záznamy můžete prohlížet. Ukládání změn je dočasně nedostupné.' : 'You can view records. Saving changes is temporarily unavailable.'}</span>
            <Link href={`/events/${services.eventId}/service-status`}>{t('serviceStatus.title')}</Link>
          </div>}
          {(title || actions) && <div className="workspace-page-header"><div className="workspace-page-title">{title && <h1>{typeof title === 'string' ? workspaceLabel(locale, title) : title}</h1>}</div>{actions && <div className="workspace-page-actions">{actions}</div>}</div>}
          <div className={paddedRoute ? 'workspace-content workspace-content-padded' : 'workspace-content'}>{children}</div>
        </main>
      </div>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
