'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type { AIProviderResponse, TestConnectionResponse } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import { ProviderCard } from './ProviderCard';
import { ProviderEditor } from './ProviderEditor';
import styles from './providers.module.css';

type Operation = { id: string; kind: 'toggle' | 'test' | 'delete' };

export default function AdminAIIntegrationsPage() {
  const { isPlatformAdmin, loading: authLoading } = useAuth();
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const [providers, setProviders] = useState<AIProviderResponse[] | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [test, setTest] = useState<{ id: string; result: TestConnectionResponse } | null>(null);
  const [editor, setEditor] = useState<AIProviderResponse | 'new' | null>(null);
  const listRequest = useRef(0);

  const loadProviders = useCallback(async () => {
    const request = ++listRequest.current;
    setRefreshing(true);
    setFetchError('');
    try {
      const response = await apiClient.listAIProviders();
      if (request !== listRequest.current) return;
      if (!response.ok || !response.data) throw new Error(response.error);
      setProviders(response.data);
    } catch (cause) {
      if (request === listRequest.current) {
        setFetchError((cause instanceof Error && cause.message) ||
          (cs ? 'Nastavení AI se nepodařilo načíst.' : 'Unable to load AI settings.'));
      }
    } finally {
      if (request === listRequest.current) setRefreshing(false);
    }
  }, [cs]);

  useEffect(() => {
    if (isPlatformAdmin) void loadProviders();
    return () => { listRequest.current++; };
  }, [isPlatformAdmin, loadProviders]);

  function acceptProvider(provider: AIProviderResponse) {
    // Enabling a provider is a single selection across all providers.
    setProviders(previous => {
      const otherProviders = (previous ?? []).filter(item => item.id !== provider.id);
      return [provider, ...otherProviders.map(item =>
        provider.enabled && item.enabled ? { ...item, enabled: false } : item)];
    });
  }

  async function runOperation(provider: AIProviderResponse, kind: Operation['kind']) {
    if (kind === 'delete' && !window.confirm(cs
      ? `Odstranit poskytovatele „${provider.name}“ včetně uloženého klíče?`
      : `Delete “${provider.name}” and its saved key?`)) return;

    const { id } = provider;
    setOperation({ id, kind });
    setActionError(null);
    try {
      if (kind === 'toggle') {
        const response = await apiClient.updateAIProvider(id, { enabled: !provider.enabled });
        if (!response.ok || !response.data) throw new Error(response.error);
        acceptProvider(response.data);
      } else if (kind === 'delete') {
        const response = await apiClient.deleteAIProvider(id);
        if (!response.ok) throw new Error(response.error);
        setProviders(previous => (previous ?? []).filter(item => item.id !== id));
      } else {
        setTest(null);
        const response = await apiClient.testAIConnection({ providerId: id });
        if (!response.ok || !response.data) throw new Error(response.error);
        const result = response.data;
        setTest({ id, result });
        // Show this completed probe immediately, then get its persisted timestamp.
        const checkedAt = new Date().toISOString();
        setProviders(previous => (previous ?? []).map(item => item.id === id
          ? { ...item, status: result.status, lastCheckedAt: checkedAt, lastError: result.error ?? null }
          : item));
        await loadProviders();
      }
    } catch (cause) {
      const fallback = kind === 'test'
        ? (cs ? 'Kontrolu se nepodařilo dokončit.' : 'The check could not be completed.')
        : (cs ? 'Změnu se nepodařilo uložit.' : 'The change could not be saved.');
      setActionError({ id, message: (cause instanceof Error && cause.message) || fallback });
    } finally {
      setOperation(null);
    }
  }

  const title = cs ? 'Integrace a AI' : 'Integrations & AI';
  if (authLoading) return <AppShell><LoadingState /></AppShell>;
  if (!isPlatformAdmin) {
    return <AppShell><ErrorState title={cs ? 'Přístup odepřen' : 'Access restricted'}
      message={cs ? 'Nastavení AI je dostupné správci platformy.' : 'AI settings require a platform administrator account.'} /></AppShell>;
  }

  const spark = providers?.find(provider => provider.systemProfile === 'DGX_SPARK');
  const others = (providers ?? []).filter(provider => provider.systemProfile !== 'DGX_SPARK');
  const otherActive = others.find(provider => provider.enabled);
  const busy = refreshing || operation !== null;
  function card(provider: AIProviderResponse) {
    return <ProviderCard key={provider.id} provider={provider} busy={busy}
      pending={operation?.id === provider.id ? operation.kind : null}
      error={actionError?.id === provider.id ? actionError.message : ''}
      test={test?.id === provider.id ? test.result : null}
      onToggle={() => void runOperation(provider, 'toggle')}
      onTest={() => void runOperation(provider, 'test')}
      onEdit={provider.systemProfile ? undefined : () => setEditor(provider)}
      onDelete={provider.systemProfile ? undefined : () => void runOperation(provider, 'delete')}
      otherActive={provider.systemProfile ? otherActive?.name : undefined} />;
  }

  return <AppShell title={title} breadcrumbs={[{ label: 'Administration', href: '/admin' }, { label: title }]}
    actions={<button className="btn btn-secondary" type="button" disabled={busy}
      onClick={() => { setTest(null); setActionError(null); void loadProviders(); }}>
      <RefreshCw size={15} aria-hidden="true" />{cs ? 'Obnovit' : 'Refresh'}
    </button>}>
    <div className={styles.page}>
      {fetchError && <ErrorState message={fetchError} onRetry={busy ? undefined : loadProviders} />}
      {providers === null && !fetchError && <LoadingState />}
      {providers && <>
        {spark ? card(spark) : <ErrorState
          title={cs ? 'Chybí profil CYRIS DGX Spark' : 'CYRIS DGX Spark profile is missing'}
          message={cs ? 'Ověřte, že byly na serveru provedeny databázové migrace CYRIS.' : 'Check that the CYRIS database migrations have been applied.'} />}
        <details className={styles.others}>
          <summary>{cs ? 'Další poskytovatelé' : 'Other providers'} ({others.length})</summary>
          <div className={styles.othersBody}>
            {others.map(card)}
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditor('new')}>
              <Plus size={15} aria-hidden="true" />{cs ? 'Přidat poskytovatele' : 'Add provider'}
            </button>
          </div>
        </details>
      </>}
      {editor && <ProviderEditor key={editor === 'new' ? 'new' : editor.id}
        provider={editor === 'new' ? null : editor} onClose={() => setEditor(null)}
        onSaved={provider => { acceptProvider(provider); setTest(null); setActionError(null); setEditor(null); }} />}
    </div>
  </AppShell>;
}
