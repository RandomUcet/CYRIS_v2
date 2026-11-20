'use client';
import { useParams } from 'next/navigation';
import { TeamWallboard } from '@/components/command/TeamWallboard';
export default function CommandWallboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return <TeamWallboard key={eventId} eventId={eventId}/>;
}
