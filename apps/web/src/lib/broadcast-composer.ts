import type { ExerciseBroadcastPlanResponse } from '@cyris/contracts';

/**
 * Pure UI readiness checks. API remains the authority for authorization,
 * event/recipient scope, time windows and idempotent delivery.
 */
export interface BroadcastComposerState {
  readOnly: boolean;
  loading: boolean;
  sending: boolean;
  planBusy: boolean;
  editingDraft: boolean;
  eligible: number | null;
  audience: 'ALL' | 'UNIT';
  unitId: string;
  title: string;
  message: string;
}

export function broadcastComposerControls(state: BroadcastComposerState) {
  const title = state.title.trim();
  const message = state.message.trim();
  const validContent = title.length >= 3 && title.length <= 120 &&
    message.length >= 3 && message.length <= 900 &&
    (state.audience === 'ALL' || Boolean(state.unitId));
  const ready = validContent && !state.readOnly && !state.loading &&
    !state.sending && !state.planBusy;

  return {
    canSave: ready,
    canSendNow: ready && !state.editingDraft &&
      state.eligible !== null && state.eligible > 0,
  };
}

/**
 * Copy an existing broadcast plan into a NEW composer session. Never reuse
 * the plan ID or revision as an idempotency key for an immediate broadcast.
 */
export function copyBroadcastPlan(plan: Pick<ExerciseBroadcastPlanResponse,
  'title' | 'message' | 'kind' | 'audience' | 'unitId'>) {
  return {
    title: plan.title,
    message: plan.message,
    kind: plan.kind,
    audience: plan.audience,
    unitId: plan.audience === 'UNIT' ? plan.unitId ?? '' : '',
  };
}
