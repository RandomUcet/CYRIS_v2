'use client';

import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface RecordTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  rightSlot?: React.ReactNode;
}

export function RecordTabs({ tabs, activeTab, onChange, rightSlot }: RecordTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--color-bg-panel)',
        borderBottom: '1px solid var(--color-border-subtle)',
        padding: '0 16px',
      }}
    >
      <div className="record-tabs" style={{ padding: 0, borderBottom: 'none' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`record-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {tab.icon}
            {tab.label}
            {tab.count != null && (
              <span
                style={{
                  marginLeft: '4px',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  background: activeTab === tab.id ? 'rgba(2, 132, 199, 0.2)' : 'var(--color-bg-surface)',
                  color: activeTab === tab.id ? 'var(--color-accent-ops)' : 'var(--color-text-dim)',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {rightSlot && <div>{rightSlot}</div>}
    </div>
  );
}
