'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ServiceModule, ServiceStatusResponse } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';

type ServiceStatus = { data: ServiceStatusResponse | null; error: boolean; refresh: () => void };
const ServiceStatusContext = createContext<ServiceStatus>({ data: null, error: false, refresh: () => {} });

export function ServiceStatusProvider({ eventId, children }: { eventId: string | null; children: ReactNode }) {
  const [data, setData] = useState<ServiceStatusResponse | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);

  useEffect(() => {
    if (!eventId) return;
    const id = eventId;
    let active = true, pending = false;
    async function load() {
      if (!active || pending) return;
      pending = true;
      try {
        const response = await apiClient.getServiceStatus(id);
        if (!active) return;
        if (response.ok && response.data?.eventId === id) {
          setData(response.data);
          setError(false);
        } else setError(true);
      } catch {
        if (active) setError(true);
      } finally { pending = false; }
    }
    void load();
    const interval = window.setInterval(load, 15000);
    window.addEventListener('focus', load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', load); };
  }, [eventId, version]);

  const value = useMemo(() => ({ data: data?.eventId === eventId ? data : null, error, refresh }), [eventId, data, error, refresh]);
  return <ServiceStatusContext.Provider value={value}>{children}</ServiceStatusContext.Provider>;
}

export function useServiceStatus() {
  return useContext(ServiceStatusContext);
}

export function useServiceReadOnly(module: ServiceModule) {
  const { data } = useServiceStatus();
  return data?.items.some(item => item.service === module && item.impact === 'READ_ONLY') ?? false;
}
