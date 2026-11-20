import { redirect } from 'next/navigation';

export default function TaskServiceStatus({ params }: { params: { eventId: string } }) {
  redirect(`/events/${params.eventId}/service-status`);
}
