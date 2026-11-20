'use client';

import { CyrisWordmark, CylabLogo } from './Brand';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { activeWorkspaceHref, workspaceItemLabel, workspaceLabel } from '@/lib/workspace-navigation';
import {
  Activity,
  Briefcase,
  AlertOctagon,
  FolderArchive,
  FlaskConical,
  Cpu,
  Users,
  Building2,
  Share2,
  ShieldAlert,
  Calendar,
  Key,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  Hash,
  BookOpen,
  FileText,
  Award,
  CheckCircle2,
  CheckSquare,
  Heart,
  Tag,
  Truck,
  Eye,
  Target,
  Radio,
  Mail,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { WorkspaceNavSection, WorkspaceNavItem } from '@cyris/contracts';

interface SideNavProps {
  collapsed: boolean;
  mobile: boolean;
  onNavigate: () => void;
  onToggleCollapse: () => void;
}

export function SideNav({ collapsed, mobile, onNavigate, onToggleCollapse }: SideNavProps) {
  const pathname = usePathname();
  const { isPlatformAdmin, currentUser, viewAs } = useAuth();
  const { selectedEventId, workspace, loadingWorkspace } = useEvent();
  const { locale } = usePreferences();
  const query = useSearchParams();
  const adminMode = pathname === '/admin' || pathname.startsWith('/admin/');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const renderIcon = (iconKey?: string) => {
    switch (iconKey) {
      case 'activity':
        return <Activity size={15} />;
      case 'clock':
        return <Clock size={15} />;
      case 'briefcase':
        return <Briefcase size={15} />;
      case 'alert-octagon':
        return <AlertOctagon size={15} />;
      case 'folder':
        return <FolderArchive size={15} />;
      case 'flask':
        return <FlaskConical size={15} />;
      case 'cpu':
        return <Cpu size={15} />;
      case 'hash':
        return <Hash size={15} />;
      case 'book-open':
        return <BookOpen size={15} />;
      case 'file-text':
        return <FileText size={15} />;
      case 'award':
        return <Award size={15} />;
      case 'check-circle':
        return <CheckCircle2 size={15} />;
      case 'check-square':
        return <CheckSquare size={15} />;
      case 'heart':
        return <Heart size={15} />;
      case 'tag':
        return <Tag size={15} />;
      case 'truck':
        return <Truck size={15} />;
      case 'eye':
        return <Eye size={15} />;
      case 'target':
        return <Target size={15} />;
      case 'radio':
        return <Radio size={15} />;
      case 'mail':
        return <Mail size={15} />;
      case 'building':
        return <Building2 size={15} />;
      case 'share':
        return <Share2 size={15} />;
      case 'calendar':
        return <Calendar size={15} />;
      case 'users':
        return <Users size={15} />;
      case 'key':
        return <Key size={15} />;
      case 'shield':
        return <ShieldAlert size={15} />;
      case 'sliders':
        return <Sliders size={15} />;
      default:
        return <LayoutGrid size={15} />;
    }
  };

  // Static Admin fallback if no event is active but user is platform administrator
  const staticAdminSection: WorkspaceNavSection = {
    id: 'admin-section',
    title: 'Administration',
    items: [
      { id: 'nav-admin-overview', label: 'Platform overview', href: '/admin', iconKey: 'activity' },
      { id: 'nav-admin-events', label: 'Events', href: '/admin/events', iconKey: 'calendar' },
      { id: 'nav-admin-units', label: 'Units & Teams', href: '/admin/units', iconKey: 'building' },
      { id: 'nav-admin-capabilities', label: 'Capabilities', href: '/admin/units', iconKey: 'sliders' },
      { id: 'nav-admin-users', label: 'Users & Access', href: '/admin/users', iconKey: 'users' },
      { id: 'nav-admin-roles', label: 'Roles & Perms', href: '/admin/roles', iconKey: 'key' },
      { id: 'nav-admin-audit', label: 'Audit Log', href: '/admin/audit', iconKey: 'shield' },
      { id: 'nav-admin-identity', label: 'Identity Providers', href: '/admin/settings/identity', iconKey: 'users' },
      { id: 'nav-admin-integrations', label: 'Integrations & AI', href: '/admin/settings/integrations/ai', iconKey: 'sliders' },
      { id: 'nav-admin-settings', label: 'Settings', href: '/admin/settings/identity', iconKey: 'sliders' },
    ],
  };

  const baseSections: WorkspaceNavSection[] =
    workspace && workspace.sections.length > 0
      ? workspace.sections
      : isPlatformAdmin
      ? [staticAdminSection]
      : [];
  const canOpenAdministration = !viewAs && (isPlatformAdmin || baseSections.some((section) => section.items.some((item) => item.href.startsWith('/admin'))));
  const source = adminMode && isPlatformAdmin ? [staticAdminSection] : baseSections;
  const seen = new Set<string>();
  const sectionsToRender = source.map(section => ({...section, items: section.items.filter(item => {
    if (item.href.startsWith('/admin') !== adminMode || seen.has(item.href)) return false;
    seen.add(item.href); return true;
  })})).filter(section => section.items.length > 0);
  if (!adminMode && selectedEventId && (isPlatformAdmin ||
    currentUser?.memberships.some(member => member.eventId === selectedEventId && member.status === 'ACTIVE'))) {
    const root = `/events/${selectedEventId}`;
    const workHref = `${root}/my-work`;
    const personal = sectionsToRender.find(section => section.items.some(item => item.href === workHref));
    const displayItem = { id: 'nav-team-displays', label: 'Team displays', href: `${root}/boards`, iconKey: 'activity' };
    if (personal) {
      if (!seen.has(displayItem.href)) personal.items.push(displayItem);
    } else {
      sectionsToRender.unshift({ id: 'personal-work', title: 'My Work', items: [
        { id: 'nav-my-work', label: 'My Work', href: workHref, iconKey: 'briefcase' }, displayItem,
      ] });
    }
    if (!seen.has(`${root}/service-status`)) sectionsToRender.push({ id: 'exercise-services', title: 'Exercise support', items: [
      { id: 'nav-service-status', label: 'Service status', href: `${root}/service-status`, iconKey: 'activity' },
      { id: 'nav-exercise-help', label: 'Help & support', href: `${root}/support`, iconKey: 'mail' },
    ] });
  }
  const activeHref = activeWorkspaceHref(sectionsToRender.flatMap(section => section.items.map(item => item.href)), pathname, query.toString());
  const getSectionTitle = (title: string) => workspaceLabel(locale, title);

  const renderSection = (section: WorkspaceNavSection) => {
    if (!section.items || section.items.length === 0) return null;
    const sectionHasActiveRoute = section.items.some((item) => item.href === activeHref);
    const isSectionCollapsed = !collapsed && (collapsedSections[section.id] ?? (!sectionHasActiveRoute && section.id !== 'personal-work' && !['Overview', 'Operations', 'Administration'].includes(section.title)));

    return (
      <div key={section.id} style={{ marginBottom: '14px' }}>
        {!collapsed && (
          <button
            type="button"
            aria-expanded={!isSectionCollapsed}
            onClick={() => setCollapsedSections((current) => ({ ...current, [section.id]: !isSectionCollapsed }))}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '6px 14px 4px 14px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              letterSpacing: '0.08em',
            }}
          >
            {getSectionTitle(section.title)}
            <ChevronRight size={12} style={{ transform: isSectionCollapsed ? undefined : 'rotate(90deg)' }} />
          </button>
        )}
        {!isSectionCollapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {section.items.map((item: WorkspaceNavItem) => {
            const isActive = item.href === activeHref;

            const labelText = workspaceItemLabel(locale, item);

            return (
              <Link
                key={item.id || item.href}
                href={item.href}
                prefetch={false}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? labelText : undefined}
                aria-label={collapsed ? labelText : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: collapsed ? '8px 0' : '6px 14px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent-active)' : '2px solid transparent',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'background-color 0.1s ease, color 0.1s ease',
                  textDecoration: 'none',
                }}
              >
                <span
                  style={{
                    color: isActive ? 'var(--accent-active)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {renderIcon(item.iconKey)}
                </span>
                {!collapsed && (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {labelText}
                  </span>
                )}
                {!collapsed && item.badge && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(225, 92, 25, 0.2)',
                      color: '#e15c19',
                      border: '1px solid rgba(225, 92, 25, 0.4)',
                      lineHeight: '1.2',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>}
      </div>
    );
  };

  return (
    <nav
      id="workspace-nav" aria-label={locale === 'cs' ? 'Navigace' : 'Navigation'}
      onClick={e => { if ((e.target as HTMLElement).closest('a')) onNavigate(); }}
      className={`app-sidebar${collapsed ? ' is-rail' : ''}`}
      style={{
        width: collapsed ? 'var(--nav-collapsed-width)' : 'var(--nav-width)',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-default)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        transition: 'width 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
        zIndex: 30,
      }}
    >
      <div className="workspace-nav-body">
        {/* Brand Header */}
        <div
          style={{
            height: 'var(--topbar-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '0' : '0 14px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--bg-sidebar)',
          }}
        >
          {!collapsed && <CyrisWordmark />}
          <button type="button" className="nav-toggle" aria-controls="workspace-nav" aria-expanded={!collapsed}
            onClick={onToggleCollapse}
            aria-label={mobile ? (locale === 'cs' ? 'Zavřít navigaci' : 'Close navigation') : workspaceLabel(locale, collapsed ? 'Expand Sidebar' : 'Collapse Sidebar')}
            title={workspaceLabel(locale, collapsed ? 'Expand Sidebar' : 'Collapse Sidebar')}>
            {collapsed ? <><CyrisWordmark compact /><ChevronRight className="nav-expand-hint" aria-hidden size={19} /></> : <ChevronLeft size={17} />}
          </button>
        </div>

        {/* Dynamic Navigation Sections from Resolver */}
        <div className="workspace-nav-scroll">
          {canOpenAdministration && <div className="workspace-mode-switch"><Link prefetch={false} href={adminMode ? (selectedEventId ? `/events/${selectedEventId}/my-work` : '/') : isPlatformAdmin ? '/admin' : (baseSections.flatMap((section) => section.items).find((item) => item.href.startsWith('/admin'))?.href ?? '/admin/events')} title={workspaceLabel(locale, adminMode ? 'Exercise workspace' : 'Platform Administration')}><ShieldAlert size={15}/>{!collapsed && workspaceLabel(locale, adminMode ? 'Exercise workspace' : 'Platform Administration')}</Link></div>}
          {sectionsToRender.map((section) => renderSection(section))}

          {!selectedEventId && !isPlatformAdmin && !collapsed && (
            <div style={{ padding: '16px 14px', fontSize: '11px', color: 'var(--text-dim)' }}>
              {workspaceLabel(locale, 'No operational event context selected.')}
            </div>
          )}
        </div>
      </div>

      {!collapsed && <footer className="workspace-brand-footer"><span>CzechCybertron</span><CylabLogo /></footer>}
    </nav>
  );
}
