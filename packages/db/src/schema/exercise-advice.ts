import {pgTable,uuid,integer,varchar,timestamp,jsonb,index,foreignKey} from 'drizzle-orm/pg-core';
import {events} from './events.js';
import {users} from './users.js';
import {exerciseBlueprints} from './exercise-blueprints.js';
import type {ExerciseAdviceDraft,ExerciseSignal,ExerciseAdviceReview,ExerciseAdviceHandoff,ExerciseObserverSnapshot,ExercisePhaseSetupReceipt,ExerciseTeamSetupReceipt,ExerciseInjectSetupReceipt} from '@cyris/contracts';
export const exerciseAdvice=pgTable('exercise_advice',{
 runId:uuid('run_id').primaryKey(),eventId:uuid('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),
 createdBy:uuid('created_by').references(()=>users.id,{onDelete:'set null'}),blueprintRevision:integer('blueprint_revision'),
 mode:varchar('mode',{length:16}).$type<'ARCHITECT'|'INTERVENTION'>().notNull(),model:varchar('model',{length:128}).notNull(),
 durationMs:integer('duration_ms').notNull(),generatedAt:timestamp('generated_at',{withTimezone:true}).notNull(),observedAt:timestamp('observed_at',{withTimezone:true}).notNull(),
 draft:jsonb('draft').$type<ExerciseAdviceDraft>().notNull(),signals:jsonb('signals').$type<ExerciseSignal[]>().notNull(),
 observations:jsonb('observations').$type<ExerciseObserverSnapshot[]>().notNull().default([]),
 injectReceipts:jsonb('inject_receipts').$type<ExerciseInjectSetupReceipt[]>().notNull().default([]),
 teamReceipts:jsonb('team_receipts').$type<ExerciseTeamSetupReceipt[]>().notNull().default([]),
 setupReceipts:jsonb('setup_receipts').$type<ExercisePhaseSetupReceipt[]>().notNull().default([]),
 handoffs:jsonb('handoffs').$type<ExerciseAdviceHandoff[]>().notNull().default([]),
 reviews:jsonb('reviews').$type<ExerciseAdviceReview[]>().notNull().default([]),revision:integer('revision').notNull().default(1),
},t=>({eventDate:index('exercise_advice_event_date_idx').on(t.eventId,t.generatedAt),blueprint:foreignKey({columns:[t.eventId,t.blueprintRevision],foreignColumns:[exerciseBlueprints.eventId,exerciseBlueprints.revision]}).onDelete('cascade')}));
