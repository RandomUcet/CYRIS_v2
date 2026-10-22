'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function CourtHearingsRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  useEffect(() => {
    if (eventId) {
      router.replace(`/events/${eventId}/court`);
    }
  }, [eventId, router]);

  return null;
}
