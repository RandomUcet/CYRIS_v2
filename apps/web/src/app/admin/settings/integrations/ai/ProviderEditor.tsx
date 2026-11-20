'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AIProviderResponse } from '@cyris/contracts';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import styles from './providers.module.css';

interface Props {
  provider: AIProviderResponse | null;
  onClose: () => void;
  onSaved: (saved: AIProviderResponse) => void;
}

export function ProviderEditor({ provider, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const title = provider
    ? (cs ? 'Upravit poskytovatele' : 'Edit provider')
    : (cs ? 'Přidat poskytovatele' : 'Add provider');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const common = {
      name: value('name'),
      endpoint: value('endpoint'),
      chatModel: value('chatModel'),
      embeddingEndpoint: value('embeddingEndpoint') || null,
      apiKey: removeKey ? undefined : value('apiKey') || undefined,
      timeoutSeconds: Number(value('timeoutSeconds')),
      tlsVerify: form.has('tlsVerify'),
    };
    const embeddingModel = value('embeddingModel');
    const enabled = form.has('enabled');
    setError('');
    setSubmitting(true);
    try {
      const response = provider
        ? await apiClient.updateAIProvider(provider.id, {
          ...common,
          embeddingModel: embeddingModel || null,
          enabled: enabled !== provider.enabled ? enabled : undefined,
          clearApiKey: removeKey,
        })
        : await apiClient.createAIProvider({
          ...common, providerType: 'OPENAI_COMPATIBLE', enabled,
          embeddingModel: embeddingModel || undefined,
        });
      if (!response.ok || !response.data) throw new Error(response.error);
      onSaved(response.data);
    } catch (cause) {
      setError((cause instanceof Error && cause.message) ||
        (cs ? 'Poskytovatele se nepodařilo uložit.' : 'Unable to save the provider.'));
    } finally {
      setSubmitting(false);
    }
  }

  return <dialog ref={dialog} aria-labelledby={heading} className={styles.dialog}
    onCancel={event => { event.preventDefault(); if (!submitting) onClose(); }}>
    <h2 id={heading}>{title}</h2>
    <form onSubmit={submit}>
      <fieldset disabled={submitting}>
        <label>{cs ? 'Název poskytovatele' : 'Provider name'}
          <input name="name" required maxLength={128} defaultValue={provider?.name} autoFocus />
        </label>
        <label>{cs ? 'Adresa chatu' : 'Chat endpoint'}
          <input name="endpoint" type="url" required defaultValue={provider?.endpoint} placeholder="https://host/v1" />
        </label>
        <label>{cs ? 'Model chatu' : 'Chat model'}
          <input name="chatModel" required defaultValue={provider?.chatModel} />
        </label>
        <label>{cs ? 'Adresa embeddingů' : 'Embedding endpoint'}
          <input name="embeddingEndpoint" type="url" defaultValue={provider?.embeddingEndpoint ?? ''} />
          <small>{cs ? 'Pokud obě služby sdílejí adresu, ponechte pole prázdné.' :
            'Leave empty if both services share an endpoint.'}</small>
        </label>
        <label>{cs ? 'Model embeddingů (volitelný)' : 'Embedding model (optional)'}
          <input name="embeddingModel" defaultValue={provider?.embeddingModel ?? ''} />
        </label>
        <label>{cs ? 'Klíč API (volitelný)' : 'API key (optional)'}
          <input name="apiKey" type="password" autoComplete="new-password" disabled={removeKey} />
          {provider?.hasApiKey && <small>{cs ? 'Klíč je uložený. Nová hodnota ho nahradí.' :
            'A key is saved. Enter a new value to replace it.'}</small>}
        </label>
        {provider?.hasApiKey && <label className={styles.checkbox}>
          <input type="checkbox" checked={removeKey} onChange={event => setRemoveKey(event.target.checked)} />
          {cs ? 'Odstranit uložený klíč' : 'Remove saved key'}
        </label>}
        <label>{cs ? 'Časový limit v sekundách' : 'Request timeout in seconds'}
          <input name="timeoutSeconds" type="number" required min={5} max={300}
            defaultValue={provider?.timeoutSeconds ?? 60} />
        </label>
        <label className={styles.checkbox}>
          <input name="tlsVerify" type="checkbox" defaultChecked={provider?.tlsVerify ?? true} />
          {cs ? 'Ověřovat certifikát TLS' : 'Verify TLS certificate'}
        </label>
        <label className={styles.checkbox}>
          <input name="enabled" type="checkbox" defaultChecked={provider?.enabled ?? false} />
          {cs ? 'Používat jako aktivního poskytovatele' : 'Use as active provider'}
        </label>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.footer}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>{cs ? 'Zrušit' : 'Cancel'}</button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? (cs ? 'Ukládání…' : 'Saving…') : (cs ? 'Uložit' : 'Save')}
        </button>
      </div>
    </form>
  </dialog>;
}
