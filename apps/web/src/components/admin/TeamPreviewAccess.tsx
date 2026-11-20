'use client';

import { useEffect, useState } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';

export function TeamPreviewAccess() {
  const { locale } = usePreferences();
  const cs = locale === 'cs';
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    apiClient.getPreviewAccess().then(result => {
      if (!active) return;
      if (result.ok && result.data) setEnabled(result.data.enabled);
      else setError(result.error || 'Unable to load preview settings');
    });
    return () => { active = false; };
  }, []);
  async function toggle() {
    if (enabled === null || saving) return;
    setSaving(true);
    setError('');
    const result = await apiClient.setPreviewAccess(!enabled);
    if (result.ok && result.data) setEnabled(result.data.enabled);
    else setError(result.error || 'Unable to update preview settings');
    setSaving(false);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL('/login/teams', window.location.origin).href);
      setCopied(true);
    } catch { setError(cs ? 'Zkopírujte adresu z odkazu níže.' : 'Copy the address from the link below.'); }
  }
  return <details className="preview-access">
    <summary>{cs ? 'Testovací přihlášení týmů' : 'Team test sign-in'}</summary>
    <p>{cs ? 'Vypnutí ukončí přístup i přihlášeným zkušebním účtům. Týmovou relaci otevřete v soukromém okně.' : 'Turning this off ends access for signed-in test accounts. Open the team link in a private window.'}</p>
    <button type="button" role="switch" aria-checked={enabled === true} disabled={saving || enabled === null} onClick={toggle}>
      {cs ? 'Testovací přihlášení' : 'Team test sign-in'} · {enabled === null ? '…' : enabled ? (cs ? 'Zapnuto' : 'On') : (cs ? 'Vypnuto' : 'Off')}
    </button>
    {enabled && <div><a href="/login/teams">/login/teams</a> <button type="button" onClick={copyLink}>
      {copied ? (cs ? 'Zkopírováno' : 'Copied') : (cs ? 'Kopírovat odkaz' : 'Copy link')}</button></div>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
