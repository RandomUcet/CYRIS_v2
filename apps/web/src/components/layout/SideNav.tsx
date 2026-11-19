'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  onToggleCollapse: () => void;
}

export function SideNav({ collapsed, onToggleCollapse }: SideNavProps) {
  const pathname = usePathname();
  const { isPlatformAdmin } = useAuth();
  const { selectedEventId, workspace, loadingWorkspace } = useEvent();
  const { t } = usePreferences();

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
  const sectionsToRender: WorkspaceNavSection[] = selectedEventId
    ? (() => {
        const alreadyPresent = baseSections.some((section) => section.items.some((item) => item.id === 'nav-my-work'));
        let inserted = alreadyPresent;
        const seen = new Set<string>();
        return baseSections.map((section) => {
          const filteredItems = section.items.filter((item) => {
            if (item.id !== 'nav-my-work') return true;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
          if (inserted) return { ...section, items: filteredItems };
          inserted = true;
          return {
            ...section,
            items: [
              {
                id: 'nav-my-work',
                label: 'My Work',
                href: `/events/${selectedEventId}/my-work`,
                iconKey: 'briefcase',
              },
              ...filteredItems,
            ],
          };
        });
      })()
    : baseSections;

  const getNavLabel = (item: WorkspaceNavItem): string => {
    const idMap: Record<string, string> = {
      'nav-admin-events': 'nav.events',
      'nav-admin-overview': 'nav.adminOverview',
      'nav-admin-units': 'nav.units',
      'nav-admin-capabilities': 'nav.capabilities',
      'nav-admin-users': 'nav.users',
      'nav-admin-roles': 'nav.roles',
      'nav-admin-audit': 'nav.audit',
      'nav-admin-identity': 'nav.identity',
      'nav-admin-integrations': 'nav.integrations',
      'nav-admin-settings': 'nav.settings',
      'nav-overview': 'nav.command',
      'nav-command': 'nav.command',
      'nav-tasks': 'nav.tasks',
      'nav-my-work': 'nav.myWork',
      'nav-incidents': 'nav.incidents',
      'nav.registry': 'nav.registry',
      'nav.cases': 'nav.cases',
      'nav.evidence': 'nav.evidence',
      'nav.lab': 'nav.laboratory',
      'nav.forensics': 'nav.forensics',
      'nav.court': 'nav.court',
      'nav.medical': 'nav.medical',
      'nav.scenario': 'nav.scenario',
      'nav.briefings': 'nav.briefings',
      'nav.evaluation': 'nav.evaluation',
      'nav.documents': 'nav.documents',
      'nav.search': 'nav.search',
      'nav.timeline': 'nav.timeline',
      'nav.administration': 'nav.administration',
      'nav.settings': 'nav.settings',
    };

    if (idMap[item.id]) {
      const translated = t(idMap[item.id]!);
      if (translated && translated !== idMap[item.id]) return translated;
    }

    const labelKey = 'nav.' + item.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byLabel = t(labelKey);
    if (byLabel && byLabel !== labelKey) return byLabel;

    return item.label;
  };

  const getSectionTitle = (title: string): string => {
    const titleMap: Record<string, string> = {
      'Operations': 'nav.operations',
      'Incident & Investigation': 'nav.cases',
      'Specialized Capabilities': 'nav.operations',
      'Scenario & Exercise Control': 'nav.scenario',
      'Intelligence & Situational Awareness': 'nav.command',
      'Administration': 'nav.administration',
      'Settings': 'nav.settings',
      'Institutional Governance': 'nav.administration',
    };
    if (titleMap[title]) {
      const translated = t(titleMap[title]!);
      if (translated && translated !== titleMap[title]) return translated;
    }
    return title;
  };

  const renderSection = (section: WorkspaceNavSection) => {
    if (!section.items || section.items.length === 0) return null;

    return (
      <div key={section.id} style={{ marginBottom: '14px' }}>
        {!collapsed && (
          <div
            style={{
              padding: '6px 14px 4px 14px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              letterSpacing: '0.08em',
            }}
          >
            {getSectionTitle(section.title)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {section.items.map((item: WorkspaceNavItem) => {
            const isActive =
              pathname === item.href ||
              (item.href !== `/events/${selectedEventId}/overview` &&
                item.href !== '/admin' &&
                pathname.startsWith(item.href));

            const labelText = getNavLabel(item);

            return (
              <Link
                key={item.id || item.href}
                href={item.href}
                prefetch={false}
                title={collapsed ? labelText : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: collapsed ? '8px 0' : '6px 14px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent-active)' : '2px solid transparent',
                  fontSize: '12px',
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
        </div>
      </div>
    );
  };

  return (
    <nav
      className="app-sidebar"
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
      <div>
        {/* Brand Header */}
        <div
          style={{
            height: 'var(--topbar-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '0' : '0 14px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--bg-sidebar-elevated)',
          }}
        >
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '6px',
                  height: '12px',
                  borderRadius: '1px',
                  background: 'var(--cylab-orange)',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: '14px',
                  letterSpacing: '0.1em',
                  color: 'var(--text-primary)',
                }}
              >
                CYRIS
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600 }}>v2</span>
            </div>
          ) : (
            <span
              style={{
                width: '6px',
                height: '12px',
                borderRadius: '1px',
                background: 'var(--cylab-orange)',
              }}
            />
          )}

          <button
            type="button"
            onClick={onToggleCollapse}
            className="btn-ghost"
            style={{
              padding: '3px 4px',
              height: 'auto',
              minWidth: 'auto',
              color: 'var(--text-muted)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        {/* Dynamic Navigation Sections from Resolver */}
        <div style={{ padding: '10px 0', overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
          {sectionsToRender.map((section) => renderSection(section))}

          {!selectedEventId && !isPlatformAdmin && !collapsed && (
            <div style={{ padding: '16px 14px', fontSize: '11px', color: 'var(--text-dim)' }}>
              No operational event context selected.
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      {!collapsed && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '10px',
            color: 'var(--text-dim)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            letterSpacing: '0.04em',
          }}
        >
          <span>Cybertron</span>
          <span>CYLAB</span>
        </div>
      )}
    </nav>
  );
}
