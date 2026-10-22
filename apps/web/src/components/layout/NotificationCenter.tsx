'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, X, ExternalLink, CheckCheck } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useEvent } from '@/contexts/EventContext';
import { apiClient } from '@/lib/api-client';
import type { NotificationItem, NotificationListResponse } from '@cyris/contracts';

export function NotificationCenter() {
  const { t, formatTime } = usePreferences();
  const { selectedEvent } = useEvent();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newItems, setNewItems] = useState<NotificationItem[]>([]);
  const [earlierItems, setEarlierItems] = useState<NotificationItem[]>([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.getNotifications(selectedEvent?.id);
      if (res.ok && res.data) {
        setUnreadCount(res.data.unreadCount || 0);
        setNewItems(res.data.newItems || []);
        setEarlierItems(res.data.earlierItems || []);
      }
    } catch {
      // Background poll error handled gracefully
    }
  }, [selectedEvent?.id]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.markNotificationRead(id);
      await fetchNotifications();
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.markAllNotificationsRead(selectedEvent?.id);
      await fetchNotifications();
    } catch {}
  };

  const handleDismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.dismissNotification(id);
      await fetchNotifications();
    } catch {}
  };

  const renderItem = (item: NotificationItem, isNew: boolean) => {
    const params = item.templateParams || {};
    let itemTitle = item.type.replace(/_/g, ' ');
    if (item.templateKey === 'task.assigned') {
      itemTitle = t('notification.taskAssigned', { taskNumber: params.taskNumber || 'TASK' });
    } else if (item.templateKey === 'briefing.new') {
      itemTitle = t('notification.briefingNew');
    } else if (item.templateKey === 'briefing.requiresAcknowledgement') {
      itemTitle = t('notification.briefingAck');
    }

    const detailText = params.title || params.description || '';

    const severityColor =
      item.severity === 'URGENT'
        ? 'var(--status-danger)'
        : item.severity === 'ACTION'
        ? 'var(--status-warning)'
        : 'var(--accent-active)';

    return (
      <div
        key={item.id}
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          background: isNew ? 'rgba(56, 189, 248, 0.04)' : 'transparent',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: severityColor,
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '10px' }}>
              {formatTime(item.createdAt)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {isNew && (
              <button
                type="button"
                onClick={(e) => handleMarkRead(item.id, e)}
                title={t('action.markRead')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  color: 'var(--text-muted)',
                }}
              >
                <Check size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => handleDismiss(item.id, e)}
              title={t('action.dismiss')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: 'var(--text-muted)',
              }}
            >
              <X size={12} />
            </button>
          </div>
        </div>

        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{itemTitle}</div>

        {detailText && (
          <div style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detailText}
          </div>
        )}

        {item.actionUrl && (
          <div style={{ marginTop: '2px' }}>
            <a
              href={item.actionUrl}
              onClick={() => setIsOpen(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--accent-active)',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '10px',
              }}
            >
              {t('action.open')} <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 8px',
          height: '28px',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xs)',
          fontSize: '11px',
          cursor: 'pointer',
          color: unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
        title="Operational Attention Notifications"
      >
        <Bell size={12} style={{ color: unreadCount > 0 ? 'var(--status-warning)' : 'inherit' }} />
        {unreadCount > 0 && (
          <span
            style={{
              background: 'var(--status-warning)',
              color: '#000',
              fontWeight: 700,
              fontSize: '10px',
              padding: '0 4px',
              borderRadius: '8px',
              lineHeight: '14px',
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '34px',
            width: '320px',
            maxHeight: '440px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 60,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-surface)',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em' }}>
              {t('notification.title')}
            </span>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '10px',
                  color: 'var(--accent-active)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCheck size={11} /> {t('notification.markAllRead')}
              </button>
            )}
          </div>

          {/* List Content */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {newItems.length === 0 && earlierItems.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                {t('notification.empty')}
              </div>
            ) : (
              <>
                {newItems.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '4px 10px',
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        color: 'var(--accent-active)',
                        background: 'rgba(56, 189, 248, 0.08)',
                      }}
                    >
                      {t('notification.new')} ({newItems.length})
                    </div>
                    {newItems.map((item) => renderItem(item, true))}
                  </div>
                )}

                {earlierItems.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '4px 10px',
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        background: 'rgba(255, 255, 255, 0.02)',
                      }}
                    >
                      {t('notification.earlier')}
                    </div>
                    {earlierItems.map((item) => renderItem(item, false))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
