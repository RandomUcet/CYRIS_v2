'use client';

import React, { useState, useEffect } from 'react';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { CommandPalette } from '../common/CommandPalette';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingState } from '../common/StateViews';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';
import { usePathname } from 'next/navigation';

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

export function AppShell({ children, breadcrumbs, title, actions }: AppShellProps) {
  const { currentUser, loading, isPlatformAdmin } = useAuth();
  const { t, locale } = usePreferences();
  const pathname = usePathname();
  const paddedRoute = /\/(tasks|medical|documents|forensics|court)(\/[^/]+)?$/.test(pathname);
  const localBreadcrumbs = breadcrumbs?.map(item => ({...item, label: workspaceLabel(locale, item.label)}));
  const [collapsed, setCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showWorkspaceHelp, setShowWorkspaceHelp] = useState(false);

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (currentUser && !currentUser.viewAs) {
          e.preventDefault();
          setIsSearchOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser]);

  // Responsive auto-collapse on narrower viewports
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1200) {
        setCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Guard: if unauthenticated in AppShell, immediately redirect to login root
  useEffect(() => {
    if (!loading && !currentUser) {
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  }, [loading, currentUser]);

  if (loading || !currentUser) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState message={!currentUser ? 'Session required. Redirecting to login...' : 'Authenticating CYRIS operator session...'} />
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <React.Suspense fallback={<div className="workspace-nav-placeholder" />}><SideNav collapsed={collapsed} onToggleCollapse={() => setCollapsed((p) => !p)} /></React.Suspense>

      <div className="app-shell-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
        <TopBar onOpenSearch={() => {if(!currentUser.viewAs)setIsSearchOpen(true)}} breadcrumbs={localBreadcrumbs} />
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
          {(title || actions) && <div className="workspace-page-header"><div className="workspace-page-title">{title && <h1>{typeof title === 'string' ? workspaceLabel(locale, title) : title}</h1>}</div>{actions && <div className="workspace-page-actions">{actions}</div>}</div>}
          <div className={paddedRoute ? 'workspace-content workspace-content-padded' : 'workspace-content'}>{children}</div>
        </main>
      </div>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
