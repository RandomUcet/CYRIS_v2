import { EventServiceAvailability } from '@/components/layout/EventServiceAvailability';
import { EventOperationalHoldNotice } from '@/components/layout/EventOperationalHoldNotice';

export default function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  return <EventServiceAvailability key={params.eventId} eventId={params.eventId} ><EventOperationalHoldNotice eventId={params.eventId} />{children}</EventServiceAvailability>;
}
