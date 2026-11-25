import {pgTable,uuid,varchar,timestamp,integer,jsonb,index,unique} from 'drizzle-orm/pg-core';
import {events} from './events.js';
import {users} from './users.js';
import type {ExerciseAdviceInput,ExerciseJobStatus} from '@cyris/contracts';
export const exerciseJobs=pgTable('exercise_jobs',{
 id:uuid('id').primaryKey(),eventId:uuid('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),
 createdBy:uuid('created_by').references(()=>users.id,{onDelete:'set null'}),requestId:uuid('request_id').notNull(),
 mode:varchar('mode',{length:16}).$type<ExerciseAdviceInput['mode']>().notNull(),blueprintRevision:integer('blueprint_revision'),
 input:jsonb('input').$type<ExerciseAdviceInput>(),status:varchar('status',{length:16}).$type<ExerciseJobStatus>().notNull().default('QUEUED'),
 attempts:integer('attempts').notNull().default(0),claimToken:uuid('claim_token'),leaseUntil:timestamp('lease_until',{withTimezone:true}),
 availableAt:timestamp('available_at',{withTimezone:true}).notNull().defaultNow(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
 resultRunId:uuid('result_run_id'),errorCode:varchar('error_code',{length:40}),
},t=>({request:unique().on(t.eventId,t.createdBy,t.requestId),dispatch:index('exercise_jobs_dispatch_idx').on(t.status,t.availableAt,t.createdAt),event:index('exercise_jobs_event_idx').on(t.eventId,t.createdAt)}));
