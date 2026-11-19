'use client';

import React, { useState, useEffect } from 'react';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { CommandPalette } from '../common/CommandPalette';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingState } from '../common/StateViews';

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

export function AppShell({ children, breadcrumbs, title, actions }: AppShellProps) {
  const { currentUser, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
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
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <SideNav collapsed={collapsed} onToggleCollapse={() => setCollapsed((p) => !p)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
        <TopBar onOpenSearch={() => setIsSearchOpen(true)} breadcrumbs={breadcrumbs} />
        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
          <div className="workspace-help-bar">
            <span>Pracujete v aktuálním eventu. Začněte v <strong>My Work</strong>; Command je určen pro autorizované operační řízení.</span>
            <button type="button" onClick={() => setShowWorkspaceHelp((value) => !value)} aria-expanded={showWorkspaceHelp}>Nápověda</button>
          </div>
          {showWorkspaceHelp && (
            <div className="workspace-help-panel" role="note">
              <strong>Rychlá orientace</strong>
              <span>My Work zobrazuje vaše dostupné úkoly. Command a změny DEFCON jsou viditelné pouze podle eventových oprávnění.</span>
              <button type="button" onClick={() => setShowWorkspaceHelp(false)}>Zavřít</button>
            </div>
          )}
          {children}
        </main>
      </div>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
