import {z} from 'zod';
export const ExerciseAdviceInputSchema=z.object({
 mode:z.enum(['ARCHITECT','INTERVENTION']),brief:z.string().trim().min(10).max(12000),
 locale:z.enum(['cs','en']).default('cs'),
}).strict();
export type ExerciseAdviceInput=z.infer<typeof ExerciseAdviceInputSchema>;
export const ExerciseSignalSchema=z.object({id:z.string(),level:z.enum(['HIGH','MEDIUM']),label:z.string(),labelCs:z.string(),count:z.number().int().nonnegative(),source:z.string(),href:z.string()});
export type ExerciseSignal=z.infer<typeof ExerciseSignalSchema>;
export const ExerciseObserverSnapshotSchema=z.object({eventId:z.string().uuid(),observedAt:z.string().datetime(),pending:z.number().int().nonnegative(),unchanged12h:z.number().int().nonnegative(),blocked:z.number().int().nonnegative()}).strict();
export type ExerciseObserverSnapshot=z.infer<typeof ExerciseObserverSnapshotSchema>;
export const exerciseObserverKey=(eventId:string)=>'cyris:exercise-observer:v1:'+eventId;
export const ExerciseIntelligenceOverviewSchema=z.object({
 eventId:z.string().uuid(),asOf:z.string(),provider:z.object({configured:z.boolean(),enabled:z.boolean(),status:z.string(),providerName:z.string().optional(),chatModel:z.string().optional()}),
 usage:z.object({total:z.number(),successful:z.number(),failed:z.number(),averageMs:z.number().nullable(),byOperation:z.array(z.object({operation:z.string(),count:z.number()}))}),
 signals:z.array(ExerciseSignalSchema),
 observer:ExerciseObserverSnapshotSchema.nullable(),
 admission:z.object({limit:z.number().int().positive(),active:z.number().int().nonnegative(),regular:z.number().int().nonnegative()}).nullable(),
});
export type ExerciseIntelligenceOverview=z.infer<typeof ExerciseIntelligenceOverviewSchema>;
export const ExerciseAdviceDraftSchema=z.object({
 summary:z.string().min(1).max(2500),
 actions:z.array(z.object({module:z.enum(['EXCON','SCENARIO','REGISTRY','INVESTIGATION','JSOC','LAB','FORENSICS','MEDICAL','LEGAL','COMMAND','EVALUATION','SUPPORT']),title:z.string().min(1).max(160),proposal:z.string().min(1).max(1400),reason:z.string().min(1).max(700),signalIds:z.array(z.string()).max(8)}).strict()).min(1).max(12),
 reviewNotes:z.array(z.string().max(700)).max(8),
}).strict();
export type ExerciseAdviceDraft=z.infer<typeof ExerciseAdviceDraftSchema>;
export type ExerciseAdviceResult=ExerciseAdviceDraft&{eventId:string;runId:string;model:string;durationMs:number;generatedAt:string;status:'DRAFT';mode:ExerciseAdviceInput['mode']};
