import { redirect } from 'next/navigation';

export default function ScenarioRootPage({ params }: { params: { eventId: string } }) {
  redirect(`/events/${params.eventId}/scenario/control`);
}
