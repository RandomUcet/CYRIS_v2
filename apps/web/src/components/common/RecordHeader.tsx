'use client';

import React from 'react';
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

  return (
    <div className="record-header">
      <div className="record-header-top">
        <div className="record-title-group">
          <RecordIdentifier value={identifier} />
          <h1 className="record-title">{title}</h1>
          {typeof status === 'string' ? <StatusBadge status={status} /> : status}
          {priority && (typeof priority === 'string' ? <PriorityBadge priority={priority} /> : priority)}
          {classification && (typeof classification === 'string' ? <ClassificationBadge classification={classification} /> : classification)}
        </div>
        {actions && <div className="flex-row">{actions}</div>}
      </div>

      <div className="record-meta-strip">
        {owningUnit && (
          <div className="record-meta-item">
            <span className="record-meta-label">Unit:</span>
            <span>{owningUnit}</span>
          </div>
        )}
        {finalLead && (
          <div className="record-meta-item">
            <span className="record-meta-label">{leadLabel}:</span>
            <span>{finalLead}</span>
          </div>
        )}
        {dates.map((d, i) => (
          <div key={i} className="record-meta-item">
            <span className="record-meta-label">{d.label}:</span>
            <span>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
