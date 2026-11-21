'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Maximize, Minimize, Volume2, VolumeX, X } from 'lucide-react';
import type { CommandReadinessSnapshot } from '@cyris/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useReadiness } from '@/contexts/ReadinessContext';
import { defconLevelChanged, levels, teamBrand, type DisplayTeam } from './team-displays';
import styles from './TeamWallboard.module.css';

const cities = [
  { city: 'Prague', zone: 'Europe/Prague', label: 'CET/CEST' },
  { city: 'London', zone: 'Europe/London', label: 'GMT/BST' },
  { city: 'UTC', zone: 'UTC', label: 'UNIVERSAL' },
  { city: 'New York', zone: 'America/New_York', label: 'EST/EDT' },
  { city: 'Dubai', zone: 'Asia/Dubai', label: 'GST' },
  { city: 'Tokyo', zone: 'Asia/Tokyo', label: 'JST' },
];
const clockOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' } as const;

type BoardProps = { eventId: string; team?: DisplayTeam };

export function TeamWallboard({ eventId, team }: BoardProps) {
  const { currentUser, loading, isPlatformAdmin, previewInvalid } = useAuth();
  const cs = usePreferences().locale === 'cs';
  if (!currentUser) return <main className="display-directory">{loading ? '…' : <Link href="/">{cs ? 'Přihlásit se' : 'Sign in'}</Link>}</main>;
  if (previewInvalid || (!isPlatformAdmin && !currentUser.memberships.some(member => member.eventId === eventId && member.status === 'ACTIVE'))) {
    return <main className="display-directory"><p role="alert">{cs ? 'Tato obrazovka není dostupná.' : 'This display is unavailable.'}</p></main>;
  }
  return <SignalBoard eventId={eventId} team={team} cs={cs}/>;
}

function SignalBoard({ eventId, team, cs }: BoardProps & { cs: boolean }) {
  const { selectedEvent } = useEvent();
  const { snapshot, stale } = useReadiness();
  const state = snapshot?.eventId === eventId ? snapshot : null;
  const level = state?.level ? levels[state.level] : null;
  const brand = team && teamBrand(team);
  const tr = (cz: string, en: string) => cs ? cz : en;
  const [now, setNow] = useState<Date | null>(null);
  const [sound, setSound] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [full, setFull] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const previous = useRef<CommandReadinessSnapshot | null>(null);
  const locale = cs ? 'cs-CZ' : 'en-GB';
  const prague = useMemo(() => new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Prague', day: '2-digit', month: '2-digit', year: 'numeric', ...clockOptions,
  }), [locale]);
  const clocks = useMemo(() => cities.map(({ city, zone, label }) => ({
    city, label,
    time: new Intl.DateTimeFormat(locale, { timeZone: zone, ...clockOptions }),
    date: new Intl.DateTimeFormat(locale, { timeZone: zone, day: '2-digit', month: '2-digit', weekday: 'short' }),
  })), [locale]);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    const onFullscreen = () => setFull(document.fullscreenElement === panel.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearInterval(timer);
      document.removeEventListener('fullscreenchange', onFullscreen);
      audio.current?.pause();
    };
  }, []);

  useEffect(() => {
    const changed = defconLevelChanged(previous.current, state);
    previous.current = state;
    if (changed && sound && audio.current) {
      audio.current.currentTime = 0;
      void audio.current.play().catch(() => {
        setSound(false);
        setFeedback(cs ? 'Zvuk se nepodařilo přehrát.' : 'Sound playback failed.');
      });
    }
  }, [state, sound, cs]);

  async function toggleSound() {
    const player = audio.current ??= new Audio('/sounds/defcon.mp3');
    setFeedback('');
    player.pause();
    player.currentTime = 0;
    if (sound) { setSound(false); return; }
    // Prime audio permission using a *silent* playback within the user's gesture.
    // Enabling sound must not emit an alert; alerts belong to DEFCON changes.
    player.muted = true;
    try {
      await player.play();
      player.pause();
      player.currentTime = 0;
      player.muted = false;
      setSound(true);
    } catch {
      player.pause();
      player.muted = false;
      setSound(false);
      setFeedback(tr('Zvuk není dostupný. Zkuste ho povolit znovu.', 'Sound unavailable. Try enabling it again.'));
    }
  }
  async function toggleFull() {
    setFeedback('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (panel.current?.requestFullscreen) await panel.current.requestFullscreen();
      else throw new Error();
    } catch { setFeedback(tr('Použijte celou obrazovku v nabídce prohlížeče.', 'Use the fullscreen option in your browser.')); }
  }

  const isPublic = !team;
  const title = team?.name ?? 'Czech Cybertron';
  const soundLabel = sound ? tr('Vypnout zvuk', 'Mute') : tr('Zapnout upozornění na změny DEFCON', 'Enable DEFCON change alerts');
  const fullLabel = full ? tr('Ukončit celou obrazovku', 'Exit fullscreen') : tr('Celá obrazovka', 'Fullscreen');
  const status = stale ? tr('Spojení přerušeno', 'Disconnected') : state ? 'LIVE' : tr('Připojování…', 'Connecting…');
  const unknownLevel = state ? tr('Stupeň neurčen', 'Level not set') : stale ? tr('Stav nedostupný', 'State unavailable') : tr('Načítám stav…', 'Loading state…');
  const updated = state?.updatedAt ? new Date(state.updatedAt) : null;
  const iso = now?.toISOString();

  return <main className={styles.board} ref={panel} lang={cs ? 'cs' : 'en'}>
    <header className={`${styles.panel} ${styles.masthead}`}>
      <div className={styles.mastheadLeft}>
        <span>{brand ? brand.masthead ?? `${brand.code} OPS CENTER` : 'PUBLIC SIGNAL'}</span>
        <div className={styles.controls}>
          <Link href={`/events/${eventId}/my-work`} aria-label={tr('Moje práce', 'My work')} title={tr('Moje práce', 'My work')}><ArrowLeft/></Link>
          <button type="button" aria-pressed={sound} aria-label={soundLabel} title={soundLabel} onClick={toggleSound}>{sound ? <Volume2/> : <VolumeX/>}</button>
          <button type="button" aria-pressed={full} aria-label={fullLabel} title={fullLabel} onClick={toggleFull}>{full ? <Minimize/> : <Maximize/>}</button>
        </div>
      </div>
      <div className={styles.mastheadCenter} title={selectedEvent?.id === eventId ? selectedEvent.name : undefined}>{brand?.mastheadCenter ?? 'CZECHCYBERTRON'}</div>
      <div className={styles.mastheadRight}>
        <time className={styles.localTime} dateTime={iso} title="Europe/Prague">{now ? prague.format(now) : '––.––.–––– ––:––:––'}</time>
        <span className={styles.liveBadge} data-status={stale ? 'offline' : state ? 'live' : 'pending'} role="status"><i/>{status}</span>
      </div>
    </header>

    <div className={`${styles.stage} ${isPublic ? styles.publicStage : ''}`}>
      <section className={`${styles.panel} ${styles.identity}`}>
        <img className={styles.emblem} src={`/brand/teams/${brand?.emblem ?? 'cct.png'}`} alt={brand?.emblem ? title : 'Czech Cybertron'}/>
        <h1 className={styles.identityTitle}>{title}</h1>
        {isPublic && <p className={styles.identitySubtitle}>{tr('Veřejná informační brána', 'Public information gateway')}</p>}
        {(brand?.motto || isPublic) && <p className={styles.identityMotto}>{brand?.motto ?? tr('Aktuální stav, upozornění a veřejný přehled', 'Current status, alerts and public overview')}</p>}
      </section>

      <section className={`${styles.panel} ${styles.defcon}`} aria-label="DEFCON" data-level={state?.level ?? undefined}>
        <div className={styles.label}>CURRENT DEFCON</div>
        <div className={styles.numberWrap}>
          <strong className={styles.number} style={{ color: level?.color }}>{state?.level ?? '—'}</strong>
          <h2 className={styles.stateTitle}>{level ? (cs ? level.cs : level.en) : unknownLevel}</h2>
        </div>
        <div className={styles.noteWrap}>
          <div className={styles.noteLabel}>NOTE</div>
          <p className={styles.note}>{state?.publicMessage || (state?.initialized ? tr('Bez poznámky.', 'No note.') : '—')}</p>
        </div>
        <div className={styles.footerRow}>
          <div className={styles.updated}>
            {updated && !Number.isNaN(updated.getTime()) ? <time dateTime={updated.toISOString()}>{tr('Aktualizováno', 'Updated')} {prague.format(updated)}</time> : '—'}
            {stale && state && <p className={styles.stale} role="status">{tr('Zobrazen poslední potvrzený stav.', 'Showing the last confirmed state.')}</p>}
          </div>
          <ol className={styles.scale} aria-label={tr('Stupnice DEFCON', 'DEFCON scale')}>{([5, 4, 3, 2, 1] as const).map(n =>
            <li key={n} className={styles.segment} data-level={n} aria-current={state?.level === n ? 'true' : undefined}>{n}</li>)}</ol>
        </div>
      </section>
    </div>

    <footer className={`${styles.panel} ${styles.clockStrip}`} aria-label={tr('Světové hodiny', 'World clocks')}>
      {clocks.map(clock => <article className={styles.clockTile} key={clock.city}>
        <div className={styles.clockCity}>{clock.city}</div>
        <time className={styles.clockTime} dateTime={iso}>{now ? clock.time.format(now) : '––:––:––'}</time>
        <div className={styles.clockDate}>{now ? clock.date.format(now) : '––.––.'}</div>
        <div className={styles.clockZone}>{clock.label}</div>
      </article>)}
    </footer>
    {feedback && <aside className={styles.feedback} role="status">{feedback}
      <button type="button" aria-label={tr('Zavřít', 'Dismiss')} onClick={() => setFeedback('')}><X size={16}/></button></aside>}
  </main>;
}
