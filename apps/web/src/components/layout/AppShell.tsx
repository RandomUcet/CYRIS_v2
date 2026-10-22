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

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState message="Authenticating CYRIS operator session..." />
      </div>
    );
  }

  if (!currentUser) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <SideNav collapsed={collapsed} onToggleCollapse={() => setCollapsed((p) => !p)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
        <TopBar onOpenSearch={() => setIsSearchOpen(true)} breadcrumbs={breadcrumbs} />
        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
          {children}
        </main>
      </div>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
