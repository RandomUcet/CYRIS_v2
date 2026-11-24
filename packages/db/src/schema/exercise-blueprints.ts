import {pgTable,uuid,integer,varchar,text,timestamp,primaryKey} from 'drizzle-orm/pg-core';
import {events} from './events.js';
import {users} from './users.js';
export const exerciseBlueprints=pgTable('exercise_blueprints',{
 eventId:uuid('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),
 revision:integer('revision').notNull(),
 title:varchar('title',{length:160}).notNull(),
 brief:text('brief').notNull(),
 objectives:text('objectives').notNull(),
 constraints:text('constraints').notNull(),
 durationHours:integer('duration_hours').notNull(),
 reviewAfterHours:integer('review_after_hours').notNull(),
 updatedBy:uuid('updated_by').references(()=>users.id,{onDelete:'set null'}),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({pk:primaryKey({columns:[t.eventId,t.revision]})}));
