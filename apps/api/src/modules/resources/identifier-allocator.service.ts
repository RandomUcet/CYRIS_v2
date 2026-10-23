import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { identifierCounters } from '@cyris/db';

@Injectable()
export class IdentifierAllocatorService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async getMaxExisting(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    eventId: string,
    entityType: string
  ): Promise<number> {
    try {
      let query;
      switch (entityType) {
        case 'scenario_inject':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(inject_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM scenario_injects WHERE event_id = ${eventId}`;
          break;
        case 'INC':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(i.incident_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM incidents i JOIN resources r ON r.id = i.id WHERE r.event_id = ${eventId}`;
          break;
        case 'CASE':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(c.case_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM cases c JOIN resources r ON r.id = c.id WHERE r.event_id = ${eventId}`;
          break;
        case 'EVIDENCE':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(e.evidence_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM evidence e JOIN resources r ON r.id = e.id WHERE r.event_id = ${eventId}`;
          break;
        case 'TASK':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(task_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM operational_tasks WHERE event_id = ${eventId}`;
          break;
        case 'DOCUMENT':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(document_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM documents WHERE event_id = ${eventId}`;
          break;
        case 'MEDICAL_ENCOUNTER':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(medical_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM medical_encounters WHERE event_id = ${eventId}`;
          break;
        case 'COURT_CASE':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(court_case_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM court_cases WHERE event_id = ${eventId}`;
          break;
        case 'FORENSIC_ANALYSIS':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(analysis_number FROM '[0-9]+$') AS INTEGER)), 0) as m FROM forensic_analyses WHERE event_id = ${eventId}`;
          break;
        case 'person':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(p.identifier FROM '[0-9]+$') AS INTEGER)), 0) as m FROM persons p JOIN resources r ON r.id = p.id WHERE r.event_id = ${eventId}`;
          break;
        case 'organisation':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(o.identifier FROM '[0-9]+$') AS INTEGER)), 0) as m FROM organisations o JOIN resources r ON r.id = o.id WHERE r.event_id = ${eventId}`;
          break;
        case 'location':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(l.identifier FROM '[0-9]+$') AS INTEGER)), 0) as m FROM locations l JOIN resources r ON r.id = l.id WHERE r.event_id = ${eventId}`;
          break;
        case 'vehicle':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(v.identifier FROM '[0-9]+$') AS INTEGER)), 0) as m FROM vehicles v JOIN resources r ON r.id = v.id WHERE r.event_id = ${eventId}`;
          break;
        case 'device':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(d.identifier FROM '[0-9]+$') AS INTEGER)), 0) as m FROM devices d JOIN resources r ON r.id = d.id WHERE r.event_id = ${eventId}`;
          break;
        case 'weapon':
          query = sql`SELECT COALESCE(MAX(CAST(SUBSTRING(w.identifier FROM '[0-9]+$') AS INTEGER)), 0) as m FROM weapons w JOIN resources r ON r.id = w.id WHERE r.event_id = ${eventId}`;
          break;
        default:
          return 0;
      }
      const res = await db.execute(query);
      return Number(res[0]?.m || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Concurrency-safe atomic counter allocator in PostgreSQL.
   * Allocates the next sequential integer for (eventId, entityType), strictly
   * exceeding any pre-existing records to eliminate unique constraint collisions.
   * Formats as `${prefix}-${String(num).padStart(width, '0')}`.
   */
  async allocate(
    eventId: string,
    entityType: string,
    prefix: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any,
    width = 4
  ): Promise<string> {
    const db = txClient || this.databaseService.client;

    const maxExisting = await this.getMaxExisting(db, eventId, entityType);
    const nextVal = maxExisting + 1;

    const [row] = await db
      .insert(identifierCounters)
      .values({
        eventId,
        entityType,
        lastValue: nextVal,
      })
      .onConflictDoUpdate({
        target: [identifierCounters.eventId, identifierCounters.entityType],
        set: {
          lastValue: sql`GREATEST(${identifierCounters.lastValue} + 1, ${nextVal})`,
        },
      })
      .returning({ lastValue: identifierCounters.lastValue });

    const allocatedNum = row?.lastValue ?? nextVal;
    return `${prefix}-${String(allocatedNum).padStart(width, '0')}`;
  }
}
