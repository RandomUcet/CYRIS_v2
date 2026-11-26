'use client';

import React from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';

export function StatusBadge({ status }: { status: string }) {
  const { t } = usePreferences();
  const s = status.toUpperCase();
  let badgeClass = 'badge-neutral';
  if (['ACTIVE', 'OPEN', 'COMPLETED', 'APPROVED', 'SECURED'].includes(s)) {
    badgeClass = 'badge-success';
  } else if (['IN_PROGRESS', 'IN PROGRESS', 'INVESTIGATING', 'IN_TRANSIT', 'PENDING', 'ACCEPTED', 'REQUESTED'].includes(s)) {
    badgeClass = 'badge-warning';
  } else if (['CRITICAL', 'REJECTED', 'DISPOSED', 'CANCELLED'].includes(s)) {
    badgeClass = 'badge-danger';
  } else if (['STORED', 'REGISTERED', 'CONTAINED', 'RESOLVED'].includes(s)) {
    badgeClass = 'badge-info';
  } else if (['CLOSED', 'ARCHIVED', 'DECEASED'].includes(s)) {
    badgeClass = 'badge-neutral';
  }

  const camelKey = 'status.' + status.toLowerCase().replace(/_([a-z])/g, (_, g) => g.toUpperCase());
  const translated = t(camelKey);
  const displayText = (translated && translated !== camelKey) ? translated : status.replace(/_/g, ' ');

  return (
    <span className={`badge ${badgeClass}`}>
      <span className="badge-dot" aria-hidden="true" />
      {displayText}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const { t } = usePreferences();
  const p = priority.toUpperCase();
  let badgeClass = 'badge-neutral';
  if (p === 'CRITICAL') badgeClass = 'badge-danger';
  else if (p === 'HIGH') badgeClass = 'badge-orange';
  else if (p === 'MEDIUM' || p === 'NORMAL') badgeClass = 'badge-info';
  else if (p === 'LOW') badgeClass = 'badge-neutral';

  const camelKey = 'priority.' + priority.toLowerCase();
  const translated = t(camelKey);
  const displayText = (translated && translated !== camelKey) ? translated : priority;

  return (
    <span className={`badge ${badgeClass}`}>
      {displayText}
    </span>
  );
}

export function ClassificationBadge({ classification }: { classification: string }) {
  const {locale}=usePreferences();
  const c = classification.toUpperCase();
  const cs=locale==='cs';
  const labels:Record<string,string>=cs?{EVENT:'Cvičení',UNIT:'Tým',RESTRICTED:'Omezený přístup',SCENARIO:'Scénář'}:{EVENT:'Exercise',UNIT:'Team',RESTRICTED:'Restricted',SCENARIO:'Scenario'};
  let badgeClass = 'badge-neutral';
  if (c === 'RESTRICTED') badgeClass = 'badge-restricted';
  else if (c === 'SCENARIO') badgeClass = 'badge-orange';
  else if (c === 'UNIT') badgeClass = 'badge-info';
  else if (c === 'EVENT') badgeClass = 'badge-neutral';

  return (
    <span className={`badge ${badgeClass}`} title={(cs?'Rozsah přístupu: ':'Access scope: ')+(labels[c]??classification)}>
      {labels[c]??classification}
    </span>
  );
}

export function RecordIdentifier({ value, code, id, prefix }: { value?: string; code?: string; id?: string; prefix?: string }) {
  const displayVal = value || code || (prefix ? `${prefix}-${(id || '').slice(0, 8)}` : id) || '';
  return (
    <span className="record-identifier">
      {displayVal}
    </span>
  );
}
