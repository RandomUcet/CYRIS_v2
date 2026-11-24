import {z} from 'zod';
export const ExerciseAdviceInputSchema=z.object({
 mode:z.enum(['ARCHITECT','INTERVENTION']),brief:z.string().trim().min(10).max(12000),
 locale:z.enum(['cs','en']).default('cs'),
 blueprintRevision:z.number().int().positive().optional(),
}).strict();
export type ExerciseAdviceInput=z.infer<typeof ExerciseAdviceInputSchema>;
export const ExerciseSignalSchema=z.object({id:z.string(),level:z.enum(['HIGH','MEDIUM']),label:z.string(),labelCs:z.string(),count:z.number().int().nonnegative(),source:z.string(),href:z.string()});
export type ExerciseSignal=z.infer<typeof ExerciseSignalSchema>;
export const ExerciseObserverSnapshotSchema=z.object({eventId:z.string().uuid(),observedAt:z.string().datetime(),pending:z.number().int().nonnegative(),reviewAfterHours:z.number().int().min(1).max(72),unchanged:z.number().int().nonnegative(),blocked:z.number().int().nonnegative()}).strict();
export type ExerciseObserverSnapshot=z.infer<typeof ExerciseObserverSnapshotSchema>;
export const exerciseObserverKey=(eventId:string)=>'cyris:exercise-observer:v2:'+eventId;
export const ExerciseIntelligenceOverviewSchema=z.object({
 eventId:z.string().uuid(),asOf:z.string(),
 event:z.object({id:z.string().uuid(),name:z.string(),status:z.string(),timezone:z.string()}),defcon:z.object({level:z.number().int().min(1).max(5).nullable(),updatedAt:z.string().nullable()}),phases:z.object({total:z.number().int(),completed:z.number().int()}),activePhase:z.object({id:z.string().uuid(),code:z.string(),title:z.string()}).nullable(),participation:z.object({activeUsers:z.number().int(),activeTeams:z.number().int()}),provider:z.object({configured:z.boolean(),enabled:z.boolean(),status:z.string(),providerName:z.string().optional(),chatModel:z.string().optional()}),
 usage:z.object({total:z.number(),successful:z.number(),failed:z.number(),averageMs:z.number().nullable(),admissionAverageMs:z.number().nullable(),providerAverageMs:z.number().nullable(),timedSamples:z.number().int().nonnegative(),capacityRejected:z.number().int().nonnegative(),timeouts:z.number().int().nonnegative(),byOperation:z.array(z.object({operation:z.string(),count:z.number(),averageMs:z.number().nullable(),p95Ms:z.number().nullable(),capacityRejected:z.number().int().nonnegative()}))}),
 signals:z.array(ExerciseSignalSchema),
 observer:ExerciseObserverSnapshotSchema.nullable(),
 admission:z.object({limit:z.number().int().positive(),active:z.number().int().nonnegative(),regular:z.number().int().nonnegative(),waiting:z.number().int().nonnegative(),waitingSupport:z.number().int().nonnegative(),maxPending:z.number().int().positive(),maxWaitMs:z.number().int().nonnegative()}).nullable(),
});
export type ExerciseIntelligenceOverview=z.infer<typeof ExerciseIntelligenceOverviewSchema>;
export const ExercisePhasePlanSchema=z.array(z.object({title:z.string().trim().min(3).max(120),purpose:z.string().trim().min(3).max(400)}).strict()).min(1).max(8);
export const ExerciseAdviceDraftSchema=z.object({
 summary:z.string().min(1).max(2500),
 actions:z.array(z.object({module:z.enum(['EXCON','SCENARIO','REGISTRY','INVESTIGATION','JSOC','LAB','FORENSICS','MEDICAL','LEGAL','COMMAND','EVALUATION','SUPPORT']),title:z.string().min(1).max(160),proposal:z.string().min(1).max(1400),reason:z.string().min(1).max(700),signalIds:z.array(z.string()).max(8),phasePlan:ExercisePhasePlanSchema.optional()}).strict()).min(1).max(12),
 reviewNotes:z.array(z.string().max(700)).max(8),
}).strict();
export type ExerciseAdviceDraft=z.infer<typeof ExerciseAdviceDraftSchema>;
export type ExerciseAdviceResult=ExerciseAdviceDraft&{eventId:string;runId:string;model:string;durationMs:number;generatedAt:string;status:'DRAFT';blueprintRevision:number|null;mode:ExerciseAdviceInput['mode']};

/** Private organizer planning data; never part of participant event DTOs. */
export const ExerciseBlueprintInputSchema=z.object({
 expectedRevision:z.number().int().min(0).max(2147483646),
 title:z.string().trim().min(3).max(160),
 brief:z.string().trim().min(10).max(12000),
 objectives:z.string().trim().max(6000),
 constraints:z.string().trim().max(4000),
 durationHours:z.number().int().min(1).max(168),
 reviewAfterHours:z.number().int().min(1).max(72),
}).strict();
export type ExerciseBlueprintInput=z.infer<typeof ExerciseBlueprintInputSchema>;
export const ExerciseBlueprintSchema=ExerciseBlueprintInputSchema.omit({expectedRevision:true}).extend({
 eventId:z.string().uuid(),revision:z.number().int().positive(),
 updatedAt:z.string().datetime(),updatedBy:z.string().uuid().nullable(),
});
export type ExerciseBlueprint=z.infer<typeof ExerciseBlueprintSchema>;
export type ExerciseBlueprintOverview={current:ExerciseBlueprint|null;history:Array<Pick<ExerciseBlueprint,'revision'|'title'|'updatedAt'|'updatedBy'>>};

export const ExerciseAdviceDecisionSchema=z.object({actionIndex:z.number().int().min(0).max(11),expectedRevision:z.number().int().positive(),decision:z.enum(['ACCEPTED','REJECTED','PENDING']),note:z.string().trim().max(1000)}).strict();
export type ExerciseAdviceDecision=z.infer<typeof ExerciseAdviceDecisionSchema>;
export const ExerciseAdviceReviewSchema=z.object({actionIndex:z.number().int().min(0).max(11),decision:z.enum(['ACCEPTED','REJECTED','PENDING']),note:z.string().max(1000),reviewedAt:z.string().datetime(),reviewedBy:z.string().uuid()}).strict();
export type ExerciseAdviceReview=z.infer<typeof ExerciseAdviceReviewSchema>;
export type StoredExerciseAdvice=ExerciseAdviceResult&{revision:number;observedAt:string;signals:ExerciseSignal[];observations:ExerciseObserverSnapshot[];reviews:ExerciseAdviceReview[];handoffs:ExerciseAdviceHandoff[];setupReceipts:ExercisePhaseSetupReceipt[];createdBy:string|null};

/** Explicit human-written, team-scoped handoff. No model text is copied automatically. */
export const ExerciseAdviceHandoffInputSchema=z.object({actionIndex:z.number().int().min(0).max(11),expectedRevision:z.number().int().positive(),unitId:z.string().uuid(),title:z.string().trim().min(3).max(120),message:z.string().trim().min(3).max(900),confirmedSafe:z.literal(true)}).strict();
export type ExerciseAdviceHandoffInput=z.infer<typeof ExerciseAdviceHandoffInputSchema>;
export const ExerciseAdviceHandoffSchema=z.object({actionIndex:z.number().int().min(0).max(11),planId:z.string().uuid(),unitId:z.string().uuid(),createdAt:z.string().datetime(),createdBy:z.string().uuid()}).strict();
export type ExerciseAdviceHandoff=z.infer<typeof ExerciseAdviceHandoffSchema>;

export const ExerciseJobStatusSchema=z.enum(['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED']);
export type ExerciseJobStatus=z.infer<typeof ExerciseJobStatusSchema>;
export type ExerciseJob={id:string;eventId:string;mode:ExerciseAdviceInput['mode'];status:ExerciseJobStatus;blueprintRevision:number|null;createdAt:string;updatedAt:string;resultRunId:string|null;errorCode:string|null;attempts:number;createdBy:string|null};
export const ExerciseJobSubmitSchema=z.object({requestId:z.string().uuid(),input:ExerciseAdviceInputSchema}).strict();
export type ExerciseJobSubmit=z.infer<typeof ExerciseJobSubmitSchema>;

export const OBSERVER_HISTORY_INTERVAL_MS=15*60*1000;
export const observerBucket=(date:Date)=>new Date(Math.floor(date.getTime()/OBSERVER_HISTORY_INTERVAL_MS)*OBSERVER_HISTORY_INTERVAL_MS);
export const ExerciseObserverHistorySchema=z.object({eventId:z.string().uuid(),asOf:z.string().datetime(),windowHours:z.literal(72),intervalMinutes:z.literal(15),samples:z.array(ExerciseObserverSnapshotSchema).max(289)}).strict();
export type ExerciseObserverHistory=z.infer<typeof ExerciseObserverHistorySchema>;
/** Compare only consecutive observations using the same review threshold. Missing intervals are unknown. */
export function observerChange(previous:ExerciseObserverSnapshot,current:ExerciseObserverSnapshot){
 const elapsed=Date.parse(current.observedAt)-Date.parse(previous.observedAt);
 if(previous.eventId!==current.eventId||previous.reviewAfterHours!==current.reviewAfterHours||!Number.isFinite(elapsed)||elapsed<=0||elapsed>20*60*1000)return null;
 return {pending:current.pending-previous.pending,unchanged:current.unchanged-previous.unchanged,blocked:current.blocked-previous.blocked};
}

export const ExercisePhaseSetupInputSchema=z.object({actionIndex:z.number().int().min(0).max(11),expectedRevision:z.number().int().positive(),titles:z.array(z.string().trim().min(3).max(120)).min(1).max(8),confirmedSafe:z.literal(true)}).strict().refine(p=>new Set(p.titles.map(t=>t.toLowerCase())).size===p.titles.length,'Duplicate phase titles');
export type ExercisePhaseSetupInput=z.infer<typeof ExercisePhaseSetupInputSchema>;
export const ExercisePhaseSetupReceiptSchema=z.object({actionIndex:z.number().int().min(0).max(11),phaseIds:z.array(z.string().uuid()).min(1).max(8),createdAt:z.string().datetime(),createdBy:z.string().uuid()}).strict();
export type ExercisePhaseSetupReceipt=z.infer<typeof ExercisePhaseSetupReceiptSchema>;
