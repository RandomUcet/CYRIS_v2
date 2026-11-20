'use client';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';
import { ExternalLink, Monitor } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { teamIdentity } from '@/components/command/team-displays';
import { useTeamDisplays } from '@/hooks/useTeamDisplays';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function TeamDisplaysPage() {
  const { viewAs } = useAuth();
  const { eventId } = useParams<{ eventId: string }>();
  const result = useTeamDisplays(eventId);
  const cs = usePreferences().locale === 'cs';
  return <AppShell title={cs ? 'Týmové obrazovky' : 'Team displays'}>
    <section className="display-directory">
      {result?.teams.map(team => {
        const [code, color] = teamIdentity(team);
        return <Link target={viewAs ? undefined : "_blank"} rel="noopener" key={team.id} href={`/events/${eventId}/boards/${team.id}`}>
          <span className="team-code" style={{ borderColor: color }}><Monitor size={16}/>{code}</span>
          <strong>{team.name}</strong><ExternalLink size={16} />
        </Link>;
      })}
      {!result ? <p>{cs ? 'Načítám týmy…' : 'Loading teams…'}</p> : result.error ? <p role="alert">{result.error}</p> :
        !result.teams.length && <p>{cs ? 'Nemáte přidělený tým.' : 'No team assigned.'}</p>}
    </section>
  </AppShell>;
}
