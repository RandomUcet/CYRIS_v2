import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { identifierCounters, persons, organisations, locations, vehicles, devices, weapons, licences } from '@cyris/db';

const registryTables = { person:persons, organisation:organisations, location:locations, vehicle:vehicles, device:devices, weapon:weapons, licence:licences };
type RegistryType = keyof typeof registryTables;
type Transaction = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];
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
        default:
          return 0;
      }
      const res = await db.execute(query);
      return Number(res[0]?.m || 0);
    } catch {
      return 0;
    }
  }

  // Registry identifiers have global unique indexes; the old counters are per event.
  // Serialize reservations by registry and include legacy counter values even after a cleanup.
  async reserveRegistry(eventId:string, type:RegistryType, prefix:string, count:number, tx:Transaction):Promise<number> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'registry-id:'+type}, 0))`);
    const table=registryTables[type];
    const [row]=await tx.execute(sql`select greatest(
      coalesce((select max(substring(${table.identifier} from '[0-9]+$')::bigint) from ${table} where ${table.identifier} ~ ${'^'+prefix+'-[0-9]{1,9}$'}),0),
      coalesce((select max(${identifierCounters.lastValue}) from ${identifierCounters} where ${identifierCounters.entityType}=${type}),0)) as previous`);
    const first=Number(row!.previous)+1;
    await tx.insert(identifierCounters).values({eventId,entityType:type,lastValue:first+count-1}).onConflictDoUpdate({
      target:[identifierCounters.eventId,identifierCounters.entityType],set:{lastValue:first+count-1}
    });
    return first;
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
    if (Object.hasOwn(registryTables,entityType)) {
      const reserve=(tx:Transaction)=>this.reserveRegistry(eventId,entityType as RegistryType,prefix,1,tx);
      const next=txClient ? await reserve(txClient) : await this.databaseService.client.transaction(reserve);
      return `${prefix}-${String(next).padStart(width,'0')}`;
    }
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
