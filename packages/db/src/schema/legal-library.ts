import {pgTable,uuid,varchar,text,date,timestamp,index,unique} from 'drizzle-orm/pg-core';
import {events} from './events.js';
import {users} from './users.js';
export const legalLibrary=pgTable('legal_library',{
 id:uuid('id').primaryKey(),eventId:uuid('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),
 act:varchar('act',{length:16}).notNull(),provision:varchar('provision',{length:100}).notNull(),heading:varchar('heading',{length:250}).notNull(),text:text('text').notNull(),
 effectiveFrom:date('effective_from').notNull(),effectiveTo:date('effective_to'),sourceUrl:text('source_url').notNull(),sha256:varchar('sha256',{length:64}).notNull(),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),createdBy:uuid('created_by').references(()=>users.id,{onDelete:'set null'}),
},t=>({version:unique().on(t.eventId,t.act,t.provision,t.effectiveFrom),eventDate:index('legal_library_event_date_idx').on(t.eventId,t.effectiveFrom,t.effectiveTo)}));
