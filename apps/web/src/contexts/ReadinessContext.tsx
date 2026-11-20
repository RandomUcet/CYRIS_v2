'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import type { CommandReadinessSnapshot } from '@cyris/contracts';
import { useAuth } from './AuthContext';
import { useEvent } from './EventContext';
import { usePreferences } from './PreferencesContext';
import { publicReadinessChanged } from '@/components/command/team-displays';
import { useDefconReadiness } from '@/hooks/useDefconReadiness';

const Context = createContext<{ snapshot: CommandReadinessSnapshot | null; stale: boolean }>({ snapshot: null, stale: false });
export const useReadiness = () => useContext(Context);

export function ReadinessProvider({ children }: { children: ReactNode }) {
  const { currentUser, isPlatformAdmin, previewInvalid } = useAuth();
  const { selectedEventId } = useEvent();
  const path = usePathname();
  const id = path.match(/^\/events\/([^/]+)/)?.[1] ?? selectedEventId;
  const allowed = currentUser && !previewInvalid && id && (isPlatformAdmin ||
    currentUser.memberships.some(member => member.status === 'ACTIVE' && member.eventId === id));
  return <Channel key={`${currentUser?.user.id}:${allowed ? id : ''}`} eventId={allowed ? id : ''}>{children}</Channel>;
}

function Channel({ eventId, children }: { eventId: string; children: ReactNode }) {
  const state = useDefconReadiness(eventId);
  const previous = useRef<CommandReadinessSnapshot | null>(null);
  const [notice, setNotice] = useState<CommandReadinessSnapshot | null>(null);
  const { locale } = usePreferences();
  useEffect(() => {
    const next = state.snapshot;
    const last = previous.current;
    previous.current = next;
    if (!next) { setNotice(null); return; }
    if (publicReadinessChanged(last, next)) setNotice(next);
  }, [state.snapshot]);
  const [fullscreen, setFullscreen] = useState<Element | null>(null);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const bulletin = notice && <aside role="alert" className="readiness-bulletin">
      <div><strong>{locale === 'cs' ? 'Změna připravenosti' : 'Exercise readiness changed'} · DEFCON {notice.level}</strong>
      {notice.publicMessage && <p>{notice.publicMessage}</p>}</div>
      <button aria-label={locale === 'cs' ? 'Zavřít upozornění' : 'Dismiss alert'} onClick={() => setNotice(null)}>×</button>
    </aside>;
  return <Context.Provider value={state}>
    {children}
    {bulletin && (fullscreen ? createPortal(bulletin, fullscreen) : bulletin)}
  </Context.Provider>;
}
