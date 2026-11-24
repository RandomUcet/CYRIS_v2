'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CommandReadinessSnapshot } from '@cyris/contracts';
import { stableReadinessSnapshot } from '@/lib/readiness-snapshot';

export function useDefconReadiness(eventId: string) {
  const [snapshot, setSnapshot] = useState<CommandReadinessSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!eventId) return;
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const result = await apiClient.getCommandReadiness(eventId);
        if (!active) return;
        if (result.ok && result.data?.eventId === eventId) {
          const next = result.data;
          setSnapshot(previous => stableReadinessSnapshot(previous,next));
          setStale(false);
        } else {
          if ([401, 403, 404].includes(result.status ?? 0)) setSnapshot(null);
          setStale(true);
        }
      } catch { if(active)setStale(true); } finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    window.addEventListener('cyris:defcon-updated', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('cyris:defcon-updated', refresh);
    };
  }, [eventId]);
  return { snapshot: snapshot?.eventId === eventId ? snapshot : null, stale };
}
