'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { DisplayTeam } from '@/components/command/team-displays';

export function useTeamDisplays(eventId: string) {
  const { currentUser, previewInvalid } = useAuth();
  const userId = currentUser?.user.id;
  const [result, setResult] = useState<{ userId: string; eventId: string; teams: DisplayTeam[]; error: string } | null>(null);
  useEffect(() => {
    if (!userId || previewInvalid) return;
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      const response = await apiClient.getTeamDisplays(eventId);
      if (active) setResult(previous => {
        const denied = [401, 403, 404].includes(response.status ?? 0);
        const cached = previous?.userId === userId && previous.eventId === eventId && !denied ? previous.teams : [];
        return { userId, eventId, teams: response.ok ? response.data ?? [] : cached,
          error: response.ok ? '' : response.error || 'Unavailable' };
      });
      pending = false;
    };
    void load();
    const timer = window.setInterval(load, 15000);
    window.addEventListener('focus', load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [userId, previewInvalid, eventId]);
  return userId && !previewInvalid && result?.userId === userId && result.eventId === eventId ? result : null;
}
