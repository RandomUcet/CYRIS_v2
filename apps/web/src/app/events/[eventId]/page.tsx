import { redirect } from 'next/navigation';

export default function EventRootPage({ params }: { params: { eventId: string } }) {
  redirect(`/events/${params.eventId}/overview`);
}
