import {pgTable,uuid,text,varchar,timestamp,integer,index} from 'drizzle-orm/pg-core';
import {generateId} from '@cyris/shared';
import {events} from './events.js';
import {users} from './users.js';
export const supportRequests=pgTable('support_requests',{
  id:uuid('id').primaryKey().$defaultFn(()=>generateId()),
  eventId:uuid('event_id').notNull().references(()=>events.id,{onDelete:'cascade'}),
  requesterId:uuid('requester_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  assignedToUserId:uuid('assigned_to_user_id').references(()=>users.id,{onDelete:'set null'}),
  category:varchar('category',{length:24}).notNull(),
  subject:varchar('subject',{length:160}).notNull(),
  status:varchar('status',{length:16}).notNull().default('OPEN'),
  revision:integer('revision').notNull().default(1),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({eventStatus:index('support_requests_event_status_idx').on(t.eventId,t.status,t.updatedAt),requester:index('support_requests_requester_idx').on(t.eventId,t.requesterId),assignee:index('support_requests_assignee_idx').on(t.eventId,t.assignedToUserId,t.status)}));
export const supportMessages=pgTable('support_messages',{
  id:uuid('id').primaryKey().$defaultFn(()=>generateId()),
  requestId:uuid('request_id').notNull().references(()=>supportRequests.id,{onDelete:'cascade'}),
  authorId:uuid('author_id').references(()=>users.id,{onDelete:'set null'}),
  authorKind:varchar('author_kind',{length:16}).notNull(),
  body:text('body').notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({thread:index('support_messages_request_idx').on(t.requestId,t.createdAt)}));
