'use client';

import React from 'react';
import type { MedicalTriageCategory } from '@cyris/contracts';

export function TriageBadge({ category }: { category?: MedicalTriageCategory | string | null }) {
  if (!category) {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
        UNKNOWN
      </span>
    );
  }

  switch (category) {
    case 'IMMEDIATE':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-950/80 text-rose-300 border border-rose-700/80">
          IMMEDIATE (RED)
        </span>
      );
    case 'DELAYED':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/80">
          DELAYED (YELLOW)
        </span>
      );
    case 'MINOR':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/80">
          MINOR (GREEN)
        </span>
      );
    case 'EXPECTANT':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-purple-950/80 text-purple-300 border border-purple-700/80">
          EXPECTANT (BLACK)
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          {category}
        </span>
      );
  }
}
