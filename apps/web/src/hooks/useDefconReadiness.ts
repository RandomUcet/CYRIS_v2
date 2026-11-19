'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CommandReadinessSnapshot } from '@cyris/contracts';

export function useDefconReadiness(eventId: string, enabled = true) {
  const [snapshot, setSnapshot] = useState<CommandReadinessSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await apiClient.getReadiness(eventId);
      if (id !== requestId.current) return;
      if (result.ok && result.data && result.data.eventId === eventId) {
        setSnapshot(result.data);
        setStale(false);
        setError(null);
      } else {
        setStale(true);
        setError(result.error || 'Readiness není dostupná');
      }
    } catch (cause) {
      if (id === requestId.current) {
        setStale(true);
        setError(cause instanceof Error ? cause.message : 'Readiness není dostupná');
      }
    }
  }, [eventId]);

  useEffect(() => {
    if (!enabled || !eventId) return;
    setSnapshot(null);
    setStale(false);
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      requestId.current += 1;
    };
  }, [enabled, eventId, refresh]);

  return { snapshot, stale, error, refresh };
}
