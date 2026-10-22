'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';
import { Calendar, Check, X } from 'lucide-react';
import { StatusBadge } from '../common/Badges';

interface EventSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EventSwitcherModal({ isOpen, onClose }: EventSwitcherModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { events, selectedEventId, selectEvent } = useEvent();

  const handleSelect = (evId: string) => {
    selectEvent(evId);
    onClose();
    if (pathname.startsWith('/events/')) {
      const parts = pathname.split('/');
      if (parts.length >= 4) {
        parts[2] = evId;
        router.push(parts.join('/'));
      } else {
        router.push(`/events/${evId}/overview`);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '460px',
          maxWidth: '92vw',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} style={{ color: 'var(--accent-active)' }} />
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Switch Exercise / Event</span>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Select the active Cybertron exercise edition or simulation context to scope operations:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
          {events.map((ev) => {
            const isSelected = ev.id === selectedEventId;
            return (
              <div
                key={ev.id}
                onClick={() => handleSelect(ev.id)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected ? '1px solid var(--accent-active)' : '1px solid var(--border-default)',
                  background: isSelected ? 'var(--bg-active)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {ev.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Slug: <code>/{ev.slug}</code>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <StatusBadge status={ev.status} />
                  {isSelected && <Check size={16} style={{ color: 'var(--accent-active)' }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
