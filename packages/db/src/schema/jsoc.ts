import {pgTable,uuid,varchar,text,timestamp,index} from 'drizzle-orm/pg-core';
import {generateId} from '@cyris/shared';
import {events} from './events.js';
import {users} from './users.js';

// Synthetic only: no connectivity to real logs, systems or infrastructure.
export const jsocSyntheticLogs=pgTable('jsoc_synthetic_logs',{
  id:uuid('id').primaryKey().$defaultFn(()=>generateId()),
  eventId:uuid('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),
  observedAt:timestamp('observed_at',{withTimezone:true}).notNull(),
  category:varchar('category',{length:20}).notNull(),
  severity:varchar('severity',{length:20}).notNull(),
  source:varchar('source',{length:120}).notNull(),
  message:text('message').notNull(),
  sourceAddress:varchar('source_address',{length:64}),
  destinationAddress:varchar('destination_address',{length:64}),
  scenario:varchar('scenario',{length:160}).notNull(),
  createdByUserId:uuid('created_by_user_id').references(()=>users.id,{onDelete:'set null'}),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({eventTime:index('jsoc_logs_event_time_idx').on(t.eventId,t.observedAt),
  eventSeverity:index('jsoc_logs_event_severity_idx').on(t.eventId,t.severity,t.observedAt)}));
