'use client';

import React from 'react';
import {usePreferences} from '@/contexts/PreferencesContext';
import {workspaceLabel} from '@/lib/workspace-navigation';
import { StatusBadge, PriorityBadge, ClassificationBadge, RecordIdentifier } from './Badges';

export interface RecordHeaderProps {
  identifier: string;
  title: string;
  status: string | React.ReactNode;
  priority?: string | React.ReactNode;
  classification?: string | React.ReactNode;
  owningUnit?: string | null;
  lead?: string | null;
  leadOrHolder?: string | null;
  leadLabel?: string;
  dates?: { label: string; value: string }[];
  actions?: React.ReactNode;
}

export function RecordHeader({
  identifier,
  title,
  status,
  priority,
  classification,
  owningUnit,
  lead,
  leadOrHolder,
  leadLabel = 'Lead',
  dates = [],
  actions,
}: RecordHeaderProps) {
  const finalLead = leadOrHolder || lead;
  const {locale}=usePreferences();
  const cs=locale==='cs';
  const label=(value:string)=>workspaceLabel(locale,value);

  return (
    <header className="record-header">
      <div className="record-header-top">
        <div className="record-title-group">
          <RecordIdentifier value={identifier} />
          <h1 className="record-title">{title}</h1>
          <div className="record-header-badges">
            {typeof status === 'string' ? <StatusBadge status={status} /> : status}
            {priority && (typeof priority === 'string' ? <PriorityBadge priority={priority} /> : priority)}
            {classification && (typeof classification === 'string' ? <ClassificationBadge classification={classification} /> : classification)}
          </div>
        </div>
        {actions && <div className="record-header-actions" role="group" aria-label={cs?'Akce záznamu':'Record actions'}>{actions}</div>}
      </div>

      <dl className="record-meta-strip">
        {owningUnit && (
          <div className="record-meta-item">
            <dt className="record-meta-label">{cs?'Tým':'Unit'}:</dt>
            <dd>{owningUnit}</dd>
          </div>
        )}
        {finalLead && (
          <div className="record-meta-item">
            <dt className="record-meta-label">{label(leadLabel)}:</dt>
            <dd>{finalLead}</dd>
          </div>
        )}
        {dates.map((d, i) => (
          <div key={i} className="record-meta-item">
            <dt className="record-meta-label">{label(d.label)}:</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
