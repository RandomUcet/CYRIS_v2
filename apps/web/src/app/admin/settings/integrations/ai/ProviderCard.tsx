'use client';

import { useId } from 'react';
import { Activity, Cpu, Pencil, Trash2 } from 'lucide-react';
import type { AIProviderResponse, TestConnectionResponse } from '@cyris/contracts';
import { usePreferences } from '@/contexts/PreferencesContext';
import styles from './providers.module.css';

interface Props {
  provider: AIProviderResponse;
  busy: boolean;
  pending: 'toggle' | 'test' | 'delete' | null;
  error: string;
  test: TestConnectionResponse | null;
  otherActive?: string;
  onToggle: () => void;
  onTest: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function checkLabel(status: string, cs: boolean) {
  switch (status) {
    case 'OPERATIONAL': return cs ? 'V pořádku' : 'Operational';
    case 'DEGRADED': return cs ? 'Částečně dostupné' : 'Partially available';
    case 'ERROR': return cs ? 'Chyba spojení' : 'Connection error';
    default: return cs ? 'Dosud neověřeno' : 'Not checked yet';
  }
}

export function ProviderCard({ provider, busy, pending, error, test, otherActive, onToggle, onTest, onEdit, onDelete }: Props) {
  const { locale, formatTime } = usePreferences();
  const cs = locale === 'cs';
  const heading = useId();
  const switchLabel = useId();
  const spark = provider.systemProfile === 'DGX_SPARK';
  const status = test?.status ?? (provider.lastCheckedAt ? provider.status : 'NOT_CONFIGURED');
  const checking = pending === 'test';
  const chatAvailable = test?.success || test?.status === 'DEGRADED';
  const lastError = test ? test.error : provider.lastError;
  const endpoints = [{ label: 'Chat', model: provider.chatModel, address: provider.endpoint }];
  if (provider.embeddingModel) {
    endpoints.push({
      label: cs ? 'Embeddingy' : 'Embeddings',
      model: provider.embeddingModel,
      address: provider.embeddingEndpoint || provider.endpoint,
    });
  }

  return <section className={styles.card} aria-labelledby={heading}>
    <header className={styles.header}>
      <div className={styles.title}>
        <Cpu size={22} aria-hidden="true" />
        <h2 id={heading}>{provider.name}</h2>
      </div>
      {!spark && <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" />{cs ? 'Upravit' : 'Edit'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onDelete}>
          <Trash2 size={14} aria-hidden="true" />{cs ? 'Odstranit' : 'Delete'}
        </button>
      </div>}
    </header>

    <div className={styles.switchRow}>
      <div>
        <span className={styles.controlLabel} id={switchLabel}>
          {spark ? (cs ? 'Používat Spark v CYRIS' : 'Use Spark in CYRIS')
            : (cs ? 'Používat tohoto poskytovatele' : 'Use this provider')}
        </span>
        {otherActive && <p className={styles.help}>{cs
          ? `Zapnutím převezme Spark požadavky od poskytovatele ${otherActive}.`
          : `Enabling Spark will switch requests from ${otherActive}.`}</p>}
      </div>
      <label className={styles.switch}>
        <input type="checkbox" role="switch" aria-labelledby={switchLabel}
          checked={provider.enabled} disabled={busy} onChange={onToggle} />
        <span className={styles.switchTrack} aria-hidden="true" />
        <span className={styles.switchState} aria-live="polite">
          {pending === 'toggle' ? (cs ? 'Ukládání…' : 'Saving…') :
            (provider.enabled ? (cs ? 'Zapnuto' : 'On') : (cs ? 'Vypnuto' : 'Off'))}
        </span>
      </label>
    </div>

    <dl className={styles.endpoints}>
      {endpoints.map(({ label, model, address }) => <div key={label}>
        <dt>{label}</dt>
        <dd><code>{model}</code><code className={styles.address}>{address}</code></dd>
      </div>)}
    </dl>

    <details className={styles.settings}>
      <summary>{cs ? 'Parametry připojení' : 'Connection settings'}</summary>
      <dl>
        <div><dt>{cs ? 'Časový limit' : 'Timeout'}</dt><dd>{provider.timeoutSeconds} s</dd></div>
        <div><dt>{cs ? 'Klíč API' : 'API key'}</dt><dd>{provider.hasApiKey
          ? (cs ? 'Uložen' : 'Saved') : (cs ? 'Bez klíče' : 'No key')}</dd></div>
        <div><dt>TLS</dt><dd>{[provider.endpoint, provider.embeddingEndpoint].some(url => url?.startsWith('https://'))
          ? (provider.tlsVerify ? (cs ? 'Certifikát se ověřuje' : 'Certificate verified') : (cs ? 'Ověření vypnuto' : 'Verification disabled'))
          : 'HTTP'}</dd></div>
        {!spark && <div><dt>{cs ? 'Podporované funkce' : 'Capabilities'}</dt><dd>{provider.capabilities.join(' · ')}</dd></div>}
      </dl>
    </details>

    <div className={styles.diagnostics}>
      <div className={styles.checkRow}>
        <div>
          <h3>{cs ? 'Poslední kontrola spojení' : 'Last connection check'}</h3>
          <div className={styles.checkMeta} aria-live="polite">
            <span className={styles.checkStatus} data-state={status}>{checkLabel(status, cs)}</span>
            {provider.lastCheckedAt && <time dateTime={provider.lastCheckedAt}>{formatTime(provider.lastCheckedAt)}</time>}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy} aria-busy={checking} onClick={onTest}>
          <Activity size={15} aria-hidden="true" />
          {checking ? (cs ? 'Probíhá kontrola…' : 'Checking…') : (cs ? 'Otestovat spojení' : 'Test connection')}
        </button>
      </div>
      {test && <dl className={styles.testResults}>
        <div><dt>Chat</dt><dd>{chatAvailable ? (cs ? 'V pořádku' : 'Operational') : (cs ? 'Chyba' : 'Error')}
          {chatAvailable && test.latencyMs !== undefined && ` · ${test.latencyMs} ms`}</dd></div>
        {provider.embeddingModel && <div><dt>{cs ? 'Embeddingy' : 'Embeddings'}</dt><dd>
          {test.embedding ? checkLabel(test.embedding.status, cs) : (cs ? 'Neověřeno' : 'Not checked')}
        </dd></div>}
      </dl>}
      {lastError && <p className={styles.error}>{lastError}</p>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
