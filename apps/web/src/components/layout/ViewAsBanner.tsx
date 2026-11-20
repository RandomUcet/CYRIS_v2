'use client';

import { useState } from 'react';
import { Eye, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';

export function ViewAsBanner() {
  const { viewAs, previewInvalid, exitViewAs } = useAuth();
  const { locale } = usePreferences();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState(false);
  const cs = locale === 'cs';
  if (!viewAs && !previewInvalid) return null;
  return <div className="view-as-banner" role="status">
    <Eye size={18} aria-hidden="true" />
    <div>
      <strong>{previewInvalid ? (cs ? 'Náhled už není dostupný' : 'Preview is no longer available') : `${cs ? 'Zobrazeno jako' : 'Viewing as'} ${viewAs?.targetDisplayName}`}</strong>
      <span>{cs ? 'Pouze pro čtení · změny a potvrzení jsou zablokované.' : 'Read only · changes and acknowledgements are blocked.'}</span>
      {error && <span role="alert">{cs ? 'Návrat se nepodařil. Zkus to znovu.' : 'Unable to exit. Please try again.'}</span>}
    </div>
    <button className="btn btn-secondary" disabled={leaving} onClick={() => { setLeaving(true); setError(false); void exitViewAs().catch(() => { setLeaving(false); setError(true); }); }}>
      <ArrowLeft size={14} /> {cs ? 'Zpět do správy' : 'Return to administration'}
    </button>
  </div>;
}
