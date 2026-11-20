'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Maximize, Minimize, Volume2, VolumeX, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useReadiness } from '@/contexts/ReadinessContext';
import { CyrisWordmark } from '@/components/layout/Brand';
import { levels, publicReadinessChanged, teamIdentity, type DisplayTeam } from './team-displays';
import type { CommandReadinessSnapshot } from '@cyris/contracts';

const cities = [
  ['Praha', 'Europe/Prague'], ['London', 'Europe/London'], ['UTC', 'UTC'],
  ['New York', 'America/New_York'], ['Dubai', 'Asia/Dubai'], ['Tokyo', 'Asia/Tokyo'],
].map(([city, zone]) => ({ city, time: new Intl.DateTimeFormat('cs-CZ',
  { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }) }));

function WorldClocks() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <footer className="board-clocks">{cities.map(({city, time}) =>
    <div key={city}><span>{city}</span><time>{now ? time.format(now) : '—'}</time></div>)}</footer>;
}

export function TeamWallboard({ eventId, team }: { eventId: string; team?: DisplayTeam }) {
  const { currentUser, loading, isPlatformAdmin, previewInvalid } = useAuth();
  const { selectedEvent } = useEvent();
  const { snapshot, stale } = useReadiness();
  const cs = usePreferences().locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const state = snapshot?.eventId === eventId ? snapshot : null;
  const [code, accent] = team ? teamIdentity(team) : ['CYRIS', '#8ec7d3'];
  const level = state?.level ? levels[state.level] : null;
  const [sound, setSound] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [full, setFull] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const previous = useRef<CommandReadinessSnapshot | null>(null);
  useEffect(() => {
    const onFullscreen = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => { document.removeEventListener('fullscreenchange', onFullscreen); audio.current?.pause(); };
  }, []);
  useEffect(() => {
    const changed = publicReadinessChanged(previous.current, state);
    previous.current = state;
    if (changed && sound && audio.current) {
      audio.current.currentTime = 0;
      void audio.current.play().catch(() => { setSound(false); setFeedback(tr('Zvuk se nepodařilo přehrát.', 'Sound playback failed.')); });
    }
  }, [state, sound, cs]);
  async function toggleSound() {
    const player = audio.current ??= new Audio('/sounds/defcon.mp3');
    setFeedback('');
    player.pause();
    player.currentTime = 0;
    if (sound) { setSound(false); return; }
    try { await player.play(); setSound(true); }
    catch { setFeedback(tr('Zvuk není dostupný. Zkuste ho povolit znovu.', 'Sound unavailable. Try enabling it again.')); }
  }
  async function toggleFull() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (panel.current?.requestFullscreen) await panel.current.requestFullscreen();
      else throw new Error();
    } catch { setFeedback(tr('Použijte celou obrazovku v nabídce prohlížeče.', 'Use the fullscreen option in your browser.')); }
  }
  if (!currentUser) return <main className="display-directory">{loading ? '…' : <Link href="/">{tr('Přihlásit se', 'Sign in')}</Link>}</main>;
  if (previewInvalid || (!isPlatformAdmin && !currentUser.memberships.some(member => member.eventId === eventId && member.status === 'ACTIVE'))) {
    return <main className="display-directory"><p role="alert">{tr('Tato obrazovka není dostupná.', 'This display is unavailable.')}</p></main>;
  }
  return <main className="team-wall" ref={panel} style={{ '--team-accent': accent, '--level-color': level?.color ?? '#acbaca' } as CSSProperties}>
    <header className="board-top"><CyrisWordmark/><strong>{selectedEvent?.id === eventId ? selectedEvent.name : 'CzechCybertron'}</strong>
      <span className={stale ? 'board-status stale' : 'board-status'}>{stale ? tr('Spojení přerušeno', 'Disconnected') : state ? tr('Připojeno', 'Connected') : tr('Připojování…', 'Connecting…')}</span></header>
    <div className="board-stage">
      <section className="board-team"><span className="board-code">{code}</span><h1>{team?.name ?? tr('Přehled cvičení', 'Exercise display')}</h1>
        {team?.slug === 'juniorska-zpravodajska-sluzba' && <p>Vidět – slyšet – nemluvit</p>}</section>
      <section className="board-state" aria-label="DEFCON"><div className="board-state-head"><b>DEFCON</b><time>{state?.updatedAt ? new Date(state.updatedAt).toLocaleString(cs ? 'cs-CZ' : 'en-GB', { timeZone: 'Europe/Prague' }) : '—'}</time></div>
        <div className="board-level"><strong>{state?.level ?? '—'}</strong><h2>{level ? (cs ? level.cs : level.en) : tr('Stupeň neurčen', 'Level not set')}</h2></div>
        <div className="board-scale" aria-hidden="true">{([5,4,3,2,1] as const).map(n => <span key={n} className={state?.level === n ? 'current' : ''} style={{borderColor:levels[n].color}}>{n}</span>)}</div>
        {state?.publicMessage && <p className="board-message">{state.publicMessage}</p>}
        {stale && state && <p>{tr('Zobrazen poslední potvrzený stav.', 'Showing the last confirmed state.')}</p>}
      </section>
    </div>
    <WorldClocks/>
    <div className="board-controls"><Link href={`/events/${eventId}/my-work`}><ArrowLeft size={15}/>{tr('Moje práce', 'My work')}</Link>
      <button type="button" aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}{sound ? tr('Vypnout zvuk', 'Mute') : tr('Zapnout a vyzkoušet zvuk', 'Enable and test sound')}</button>
      <button type="button" aria-pressed={full} onClick={toggleFull}>{full ? <Minimize size={16}/> : <Maximize size={16}/>}{tr('Celá obrazovka', 'Fullscreen')}</button>
      {feedback && <span role="status">{feedback}</span>}</div>
  </main>;
}
