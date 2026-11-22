'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Activity, BookOpen, CheckCircle2, Inbox, Plus, RefreshCw, Send } from 'lucide-react';
import type { CreateSupportRequest, SupportInbox, SupportThread } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { SupportAssist } from './SupportAssist';
import { SupportFaq } from './SupportFaq';
import styles from './support.module.css';

type View = { kind: 'home' | 'faq' | 'create' } | { kind: 'thread'; id: string };
type Filter = 'ALL' | SupportThread['status'];
type ReplyDraft = { body: string; edit: number };
const emptyReply: ReplyDraft = { body: '', edit: 0 };
const emptyRequest: CreateSupportRequest = { category: 'NAVIGATION', subject: '', body: '' };

export default function SupportPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { currentUser, viewAs } = useAuth();
  if (!currentUser) return <AppShell><LoadingState /></AppShell>;
  const preview = currentUser.viewAs ?? viewAs;
  return <EventSupport key={[eventId, currentUser.user.id, preview?.id].join('/')}
    eventId={eventId} userId={currentUser.user.id} readOnly={Boolean(preview)} />;
}

function EventSupport({ eventId, userId, readOnly }: { eventId: string; userId: string; readOnly: boolean }) {
  const { locale, formatDate, formatTime } = usePreferences();
  const language = locale === 'cs' ? 'cs' : 'en';
  const tr = (cs: string, en: string) => language === 'cs' ? cs : en;
  const [inbox, setInbox] = useState<SupportInbox | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [page, setPage] = useState(1);
  const selectedId = view.kind === 'thread' ? view.id : undefined;
  const [filter, setFilter] = useState<Filter>('ALL');
  const [category, setCategory] = useState<'ALL' | CreateSupportRequest['category']>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [newRequest, setNewRequest] = useState(emptyRequest);
  const [drafts, setDrafts] = useState<Record<string, ReplyDraft>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<{ target: string; message: string } | null>(null);
  const replyField = useRef<HTMLTextAreaElement>(null);

  const refresh = () => setRefreshVersion(previous => previous + 1);

  // Debounce network requests; the backend filters across the whole accessible
  // inbox before pagination, rather than searching only the current page.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchTerm(searchInput.trim().length >= 2 ? searchInput.trim() : '');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await apiClient.listSupport(eventId, { page, threadId: selectedId, status: filter === 'ALL' ? undefined : filter, category: category === 'ALL' ? undefined : category, q: searchTerm || undefined });
        if (!active) return;
        if (response.ok && response.data) {
          const data = response.data;
          if (data.total !== undefined && data.pageSize && page > 1 && (page - 1) * data.pageSize >= data.total) {
            setPage(Math.max(1, Math.ceil(data.total / data.pageSize)));
          }
          setInbox(data);
          setLoadError(false);
          setAccessDenied(false);
          // The manager inbox is ordered by the time each open request has waited.
          const firstWaiting = data.canManage && (data.threads.find(thread => thread.status === 'OPEN') ?? data.threads[0]);
          if (firstWaiting) {
            setView(current => current.kind === 'home' ? { kind: 'thread', id: firstWaiting.id } : current);
          }
        } else {
          setLoadError(true);
          if ([401, 403, 404].includes(response.status ?? 0)) {
            setAccessDenied(true);
            setInbox(null);
          }
        }
      } catch {
        if (active) setLoadError(true);
      } finally {
        pending = false;
      }
    }
    void load();
    const visibleLoad = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(visibleLoad, 15000);
    document.addEventListener('visibilitychange', visibleLoad);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visibleLoad); };
  }, [eventId, page, filter, category, searchTerm, selectedId, refreshVersion]);

  const threads = inbox?.threads ?? [];
  const waiting = threads.filter(thread => thread.status === 'OPEN');
  const waitingSnapshot = inbox?.queueRevision ?? waiting.map(thread => thread.id + ':' + thread.revision).sort().join(',');
  const visible = threads.filter(thread => filter === 'ALL' || thread.status === filter);
  const thread = selectedId && inbox?.selectedThread?.id === selectedId ? inbox.selectedThread : undefined;
  const reply = thread ? drafts[thread.id] ?? emptyReply : emptyReply;
  const canManage = inbox?.canManage === true;
  const canWrite = !readOnly && !accessDenied;
  const canRespond = Boolean(thread && canManage && thread.requesterId !== userId);
  const showFaq = view.kind === 'faq' || (view.kind === 'home' && !canManage);
  const categories: Record<CreateSupportRequest['category'], string> = {
    NAVIGATION: tr('Orientace v systému', 'Navigation'), TASK: tr('Úkol nebo zadání', 'Task instructions'),
    TECHNICAL: tr('Technický problém', 'Technical problem'), OTHER: tr('Ostatní', 'Other'),
  };
  const statuses = {
    OPEN: tr('Čeká na odpověď', 'Waiting for a reply'),
    ANSWERED: tr('Zodpovězeno', 'Answered'),
    RESOLVED: tr('Vyřešeno', 'Resolved'),
  };

  function navigate(next: View) {
    setView(next);
    setActionError(null);
  }
  function selectFilter(next: Filter) {
    setPage(1);
    setFilter(next);
    if (view.kind !== 'thread' || !thread || next === 'ALL' || thread.status === next) return;
    navigate({ kind: 'home' });
  }
  function changeReply(id: string, body: string) {
    setDrafts(previous => ({ ...previous, [id]: { body, edit: (previous[id]?.edit ?? 0) + 1 } }));
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || saving || newRequest.subject.trim().length < 3 || !newRequest.body.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await apiClient.createSupport(eventId, newRequest);
      if (!response.ok || !response.data) throw new Error();
      const id = response.data.id;
      setNewRequest(emptyRequest);
      setView(current => current.kind === 'create' ? { kind: 'thread', id } : current);
      setPage(1);
      setFilter('ALL');
      setCategory('ALL');
      setSearchInput('');
      setSearchTerm('');
      refresh();
    } catch {
      setActionError({ target: 'create', message: tr('Žádost se nepodařilo odeslat. Zkuste to znovu.', 'The request could not be sent. Please try again.') });
    } finally {
      setSaving(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!thread || !canWrite || saving || !reply.body.trim() || reply.body.length > 4000) return;
    const id = thread.id;
    setSaving(true);
    setActionError(null);
    try {
      const response = await apiClient.replySupport(eventId, id, { body: reply.body, expectedRevision: thread.revision });
      if (!response.ok) throw new Error();
      setDrafts(previous => previous[id]?.edit === reply.edit ? { ...previous, [id]: emptyReply } : previous);
    } catch {
      setActionError({ target: id, message: tr('Odpověď se nepodařilo odeslat. Zkontrolujte poslední zprávy a zkuste to znovu.', 'The reply could not be sent. Check the latest messages and try again.') });
    } finally {
      setSaving(false);
      refresh();
    }
  }
  async function resolve() {
    if (!thread || !canWrite || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await apiClient.resolveSupport(eventId, thread.id, thread.revision);
      if (!response.ok) throw new Error();
    } catch {
      setActionError({ target: thread.id, message: tr('Žádost se nepodařilo uzavřít. Zkontrolujte poslední zprávy a zkuste to znovu.', 'The request could not be resolved. Check the latest messages and try again.') });
    } finally {
      setSaving(false);
      refresh();
    }
  }
  const contact = () => navigate({ kind: 'create' });

  return (
    <AppShell title={canManage ? tr('Podpora EXCON', 'EXCON helpdesk') : tr('Pomoc a podpora', 'Help & support')}
      breadcrumbs={[{ label: 'Exercise support' }, { label: 'Help & support' }]}
      actions={<>
        <button type="button" onClick={refresh}><RefreshCw size={15} aria-hidden="true" />{tr('Obnovit', 'Refresh')}</button>
        {canWrite && view.kind !== 'create' && <button type="button" className="btn-primary" onClick={contact}>
          <Plus size={15} aria-hidden="true" />{tr('Napsat podpoře', 'Contact support')}
        </button>}
      </>}>
      <div className="helpdesk">
        <div className={styles.toolbar}>
          {canManage && <p className={styles.waitingCount}><Inbox size={17} aria-hidden="true" />
            {tr('Čeká na odpověď', 'Waiting for a reply')} <strong>{inbox?.waiting ?? waiting.length}</strong>
          </p>}
          <div className={styles.actions}>
            {!showFaq && <button type="button" className="btn-ghost" onClick={() => navigate({ kind: 'faq' })}>
              <BookOpen size={15} aria-hidden="true" />{tr('Časté dotazy', 'Frequently asked questions')}
            </button>}
            <Link href={'/events/' + eventId + '/service-status'}><Activity size={15} aria-hidden="true" />{tr('Stav služeb', 'Service status')}</Link>
          </div>
        </div>
        {canManage && canWrite && (
          <SupportAssist key={'handover/' + language + '/' + waitingSnapshot} eventId={eventId} input={{ action: 'HANDOVER', locale: language }} />
        )}
        {readOnly && <p className={styles.note}>{tr('Náhled pouze pro čtení.', 'Read-only preview.')}</p>}
        {loadError && <ErrorState
          message={accessDenied ? tr('Seznam žádostí pro toto cvičení není dostupný.', 'The request list for this exercise is unavailable.') : tr('Seznam žádostí se nepodařilo aktualizovat.', 'The request list could not be refreshed.')}
          onRetry={refresh} />}
        <div className={'helpdesk-layout ' + styles.layout}>
          <aside className="helpdesk-inbox" aria-labelledby="support-inbox-heading">
            <div className="helpdesk-inbox-header"><h2 id="support-inbox-heading" className={styles.inboxHeading}>
              {canManage ? tr('Fronta žádostí', 'Request queue') : tr('Moje žádosti', 'My requests')}
            </h2></div>
            {inbox && <>
              <div className="helpdesk-filters" role="group" aria-label={tr('Stav žádosti', 'Request status')}>
                {(['ALL', 'OPEN', 'ANSWERED', 'RESOLVED'] as const).map(value => (
                  <button type="button" key={value} aria-pressed={filter === value} onClick={() => selectFilter(value)}>
                    {value === 'ALL' ? tr('Vše', 'All') : statuses[value]}
                  </button>
                ))}
              </div>
              <div className={styles.inboxSearchFilters}>
                <label>{tr('Kategorie', 'Category')}
                  <select value={category} onChange={event => { setPage(1); setCategory(event.target.value as 'ALL' | CreateSupportRequest['category']); }}
                    aria-label={tr('Filtrovat podle kategorie', 'Filter by category')}>
                    <option value="ALL">{tr('Všechny kategorie', 'All categories')}</option>
                    {(['NAVIGATION', 'TASK', 'TECHNICAL', 'OTHER'] as const).map(value =>
                      <option key={value} value={value}>{categories[value]}</option>)}
                  </select>
                </label>
                <label>{tr('Hledat v žádostech', 'Search requests')}
                  <input type="search" value={searchInput} maxLength={80}
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder={tr('Předmět žádosti (alespoň 2 znaky)', 'Subject (at least 2 characters)')}/>
                </label>
              </div>
              <div className="helpdesk-threads">
                {visible.map(item => (
                  <button type="button" key={item.id} aria-current={thread?.id === item.id ? 'true' : undefined}
                    className={'helpdesk-thread' + (thread?.id === item.id ? ' selected' : '')}
                    onClick={() => navigate({ kind: 'thread', id: item.id })}>
                    <strong>{item.subject}</strong>
                    <small>{canManage && item.requesterName + ' · '}{categories[item.category]}</small>
                    <span className={styles.threadMeta}>
                      <span className={'support-status ' + item.status.toLowerCase()}>{statuses[item.status]}</span>
                      <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)} · {formatTime(item.updatedAt)}</time>
                    </span>
                  </button>
                ))}
                {!visible.length && <p className="service-empty">{tr('Žádné žádosti v tomto pohledu.', 'No requests in this view.')}</p>}
              </div>
              {Boolean(inbox.pageSize && (inbox.total ?? 0) > inbox.pageSize) && <nav className={styles.pages} aria-label={tr('Strany žádostí', 'Request pages')}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{tr('Předchozí', 'Previous')}</button>
                <span>{page} / {Math.ceil((inbox.total ?? 0) / (inbox.pageSize ?? 25))}</span>
                <button disabled={page * (inbox.pageSize ?? 25) >= (inbox.total ?? 0)} onClick={() => setPage(p => p + 1)}>{tr('Další', 'Next')}</button>
              </nav>}
            </>}
            {!inbox && !loadError && <LoadingState />}
          </aside>
          <section className={'helpdesk-conversation ' + styles.conversation} aria-label={tr('Podpora', 'Support')}>
            {showFaq ? <SupportFaq locale={language} onContact={canWrite ? contact : undefined} />
              : view.kind === 'create' && canWrite ? (
                <form className="helpdesk-form" onSubmit={create}>
                  <h2>{tr('Nová žádost o pomoc', 'New help request')}</h2>
                  <p className={styles.note}>{tr('Konverzaci vidíte vy a tým podpory. Hesla a přístupové údaje si ponechte pro sebe.', 'You and the support team can read this conversation. Keep passwords and credentials private.')}</p>
                  <label>{tr('Kategorie', 'Category')}
                    <select disabled={saving} value={newRequest.category} onChange={e => setNewRequest({ ...newRequest, category: e.target.value as CreateSupportRequest['category'] })}>
                      {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>{tr('Předmět', 'Subject')}
                    <input autoFocus required minLength={3} maxLength={160} disabled={saving} value={newRequest.subject} onChange={e => setNewRequest({ ...newRequest, subject: e.target.value })} />
                  </label>
                  <label>{tr('S čím potřebujete pomoci?', 'How can we help?')}
                    <textarea required maxLength={4000} rows={6} disabled={saving} value={newRequest.body} onChange={e => setNewRequest({ ...newRequest, body: e.target.value })}
                      placeholder={tr('Kterého úkolu nebo obrazovky se to týká? Co jste zkusili?', 'Which task or screen is involved? What have you tried?')} />
                  </label>
                  {actionError?.target === 'create' && <p className={styles.feedback} role="alert">{actionError.message}</p>}
                  <div className={styles.actions}>
                    <button type="submit" className="btn-primary" disabled={saving || newRequest.subject.trim().length < 3 || !newRequest.body.trim()}>
                      <Send size={15} aria-hidden="true" />{tr('Odeslat žádost', 'Send request')}
                    </button>
                    <button type="button" onClick={() => navigate({ kind: 'faq' })}>{tr('Zpět', 'Back')}</button>
                  </div>
                </form>
              ) : thread ? (
                <>
                  <header className="helpdesk-conversation-header"><div><h2>{thread.subject}</h2><small>{categories[thread.category]} · {thread.requesterName}</small></div>
                    <span className={'support-status ' + thread.status.toLowerCase()}>{statuses[thread.status]}</span>
                  </header>
                  <div className="helpdesk-messages">{thread.messages.map(message => (
                    <article key={message.id} className={'helpdesk-message ' + (message.authorKind === 'EXCON' ? 'excon' : 'participant')}>
                      <div><strong>{message.authorKind === 'EXCON' ? (canManage ? 'EXCON' : tr('Tým podpory', 'Support team')) : thread.requesterName}</strong>
                        <small><time dateTime={message.createdAt}>{formatDate(message.createdAt)} · {formatTime(message.createdAt)}</time></small></div>
                      <p>{message.body}</p>
                    </article>
                  ))}</div>
                  {actionError?.target === thread.id && <p role="alert" className={styles.feedback}>{actionError.message}</p>}
                  {thread.status !== 'RESOLVED' && canWrite && <form className="helpdesk-reply" onSubmit={send}>
                    <label>{canRespond ? tr('Odpověď účastníkovi', 'Reply to participant') : tr('Doplnění žádosti', 'Follow-up')}
                      <textarea ref={replyField} rows={4} required maxLength={4000} value={reply.body} onChange={e => changeReply(thread.id, e.target.value)} />
                    </label>
                    {canRespond && !saving && <SupportAssist key={[language, thread.id, thread.revision, reply.edit].join('/')}
                      eventId={eventId} input={{ action: 'REPLY', threadId: thread.id, expectedRevision: thread.revision, locale: language }}
                      hasDraft={Boolean(reply.body)} applyReply={suggestion => {
                        changeReply(thread.id, reply.body ? reply.body + '\n\n' + suggestion : suggestion);
                        replyField.current?.focus();
                      }} />}
                    {reply.body.length > 4000 && <p role="alert" className={styles.feedback}>
                      {tr('Zkraťte odpověď na 4 000 znaků.', 'Shorten the reply to 4,000 characters.')}
                    </p>}
                    <div className={styles.actions}>
                      <button type="submit" className="btn-primary" disabled={saving || !reply.body.trim() || reply.body.length > 4000}>
                        <Send size={15} aria-hidden="true" />{canRespond ? tr('Odeslat odpověď', 'Send reply') : tr('Odeslat doplnění', 'Send follow-up')}
                      </button>
                      <button type="button" disabled={saving} onClick={() => void resolve()}>
                        <CheckCircle2 size={15} aria-hidden="true" />{tr('Označit jako vyřešené', 'Mark as resolved')}
                      </button>
                    </div>
                  </form>}
                </>
              ) : (
                <div className="helpdesk-empty"><Inbox size={30} aria-hidden="true" /><h2>{tr('Vyberte žádost', 'Select a request')}</h2>
                  <p>{tr('Otevřete konverzaci ze seznamu žádostí.', 'Open a conversation from the request list.')}</p>
                </div>
              )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
