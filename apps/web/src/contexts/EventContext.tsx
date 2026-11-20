'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { EventResponse, WorkspaceResolutionResponse } from '@cyris/contracts';
import { useAuth } from './AuthContext';

export interface EventContextType {
  events: EventResponse[];
  selectedEventId: string | null;
  selectedEvent: EventResponse | null;
  currentEvent: EventResponse | null;
  workspace: WorkspaceResolutionResponse | null;
  loadingEvents: boolean;
  loadingWorkspace: boolean;
  selectEvent: (eventId: string) => void;
  refreshEvents: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export function EventProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, isPlatformAdmin, viewAs } = useAuth();
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Synchronize eventId directly from URL route transitions
  useEffect(() => {
    if (pathname) {
      const match = pathname.match(/^\/events\/([0-9a-fA-F-]{36})/);
      if (match && match[1] && match[1] !== selectedEventId) {
        setSelectedEventId(match[1]);
        if (typeof window !== 'undefined' && !viewAs) {
          localStorage.setItem('cyris_selected_event', match[1]);
        }
      }
    }
  }, [pathname, selectedEventId, viewAs]);
  const [workspace, setWorkspace] = useState<WorkspaceResolutionResponse | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const workspaceRequest=useRef(0);

  const refreshEvents = useCallback(async () => {
    if (!currentUser) {
      setEvents([]);
      setSelectedEventId(null);
      setWorkspace(null);
      return;
    }

    setLoadingEvents(true);
    try {
      const res = await apiClient.getEvents();
      if (res.ok && res.data) {
        setEvents(res.data);
        if (res.data.length > 0) {
          const saved = viewAs?.eventId ?? (typeof window !== 'undefined' ? localStorage.getItem('cyris_selected_event') : null);
          const match = saved ? res.data.find((e) => e.id === saved) : null;
          setSelectedEventId(match ? match.id : isPlatformAdmin ? null : res.data[0]!.id);
        } else {
          setSelectedEventId(null);
        }
      }
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [currentUser, isPlatformAdmin, viewAs]);

  const refreshWorkspace = useCallback(async () => {
    const request=++workspaceRequest.current;
    setWorkspace(null);
    if (!selectedEventId || !currentUser) {
      setWorkspace(null);
      return;
    }

    setLoadingWorkspace(true);
    try {
      const res = await apiClient.getWorkspace(selectedEventId);
      if(request!==workspaceRequest.current)return;
      if (res.ok && res.data) {
        setWorkspace(res.data);
      } else {
        setWorkspace(null);
      }
    } catch {
      if(request===workspaceRequest.current)setWorkspace(null);
    } finally {
      if(request===workspaceRequest.current)setLoadingWorkspace(false);
    }
  }, [selectedEventId, currentUser]);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const selectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    if (typeof window !== 'undefined' && !viewAs) {
      localStorage.setItem('cyris_selected_event', eventId);
    }
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  return (
    <EventContext.Provider
      value={{
        events,
        selectedEventId,
        selectedEvent,
        currentEvent: selectedEvent,
        workspace,
        loadingEvents,
        loadingWorkspace,
        selectEvent,
        refreshEvents,
        refreshWorkspace,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEvent() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
}
