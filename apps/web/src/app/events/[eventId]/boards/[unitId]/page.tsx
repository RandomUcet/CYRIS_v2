'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTeamDisplays } from '@/hooks/useTeamDisplays';
import { TeamWallboard } from '@/components/command/TeamWallboard';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/contexts/AuthContext';

export default function UnitDisplay() {
  const { eventId, unitId } = useParams<{ eventId: string; unitId: string }>();
  const { loading, currentUser } = useAuth();
  const cs = usePreferences().locale === 'cs';
  const result = useTeamDisplays(eventId);
  if (!loading && !currentUser) return <main className="display-directory"><Link href="/">{cs ? 'Přihlásit se' : 'Sign in'}</Link></main>;
  const team = result?.teams.find(unit => unit.id === unitId);
  if (!team) return <main className="display-directory"><p role="status">{result?.error || (result ? (cs ? 'Tato obrazovka není dostupná.' : 'This display is unavailable.') : (cs ? 'Načítám obrazovku…' : 'Loading display…'))}</p>
    <Link href={`/events/${eventId}/boards`}>{cs ? 'Týmové obrazovky' : 'Team displays'}</Link></main>;
  return <TeamWallboard key={unitId} eventId={eventId} team={team}/>;
}
