import {pgTable,uuid,timestamp,integer,primaryKey} from 'drizzle-orm/pg-core';
import {events} from './events.js';
export const exerciseObservations=pgTable('exercise_observations',{
 eventId:uuid('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),
 bucketAt:timestamp('bucket_at',{withTimezone:true}).notNull(),observedAt:timestamp('observed_at',{withTimezone:true}).notNull(),
 pending:integer('pending').notNull(),reviewAfterHours:integer('review_after_hours').notNull(),unchanged:integer('unchanged').notNull(),blocked:integer('blocked').notNull(),
},t=>({pk:primaryKey({columns:[t.eventId,t.bucketAt]})}));
