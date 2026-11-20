import { EventServiceAvailability } from '@/components/layout/EventServiceAvailability';

export default function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  return <EventServiceAvailability key={params.eventId} eventId={params.eventId}>{children}</EventServiceAvailability>;
}
