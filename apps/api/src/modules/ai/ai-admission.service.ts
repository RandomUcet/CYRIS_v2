import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '../config/config.service.js';

const keyPrefix = 'cyris:{ai-admission}:';
const keyTtlMs = 310_000;

// Redis time keeps lease deadlines consistent between API replicas. A process
// that exits mid-request frees its slot automatically after the model timeout.
const acquireSlot = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
for _, key in ipairs(KEYS) do redis.call('ZREMRANGEBYSCORE', key, '-inf', now) end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
if ARGV[3] == 'regular' and redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[2]) then return 0 end
for i = 3, #KEYS do
  if redis.call('ZCARD', KEYS[i]) > 0 then return 0 end
end
for i, key in ipairs(KEYS) do
  if i ~= 2 or ARGV[3] == 'regular' then
    redis.call('ZADD', key, now + tonumber(ARGV[4]), ARGV[5])
    redis.call('PEXPIRE', key, ARGV[6])
  end
end
return 1
`;

export function inferenceTimeoutMs(requested: number): number {
  return Number.isFinite(requested) ? Math.max(1000, Math.min(300_000, requested)) : 60_000;
}

@Injectable()
export class AIAdmissionService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly limit: number;

  constructor(config: ConfigService) {
    this.limit = config.values.CYRIS_AI_MAX_CONCURRENT;
    this.redis = new Redis(config.values.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 1500,
    });
    this.redis.on('error', () => { /* run() reports unavailability to the caller. */ });
  }

  async run<T>(lane: 'regular' | 'support', userId: string | null | undefined, timeoutMs: number, work: () => Promise<T>, exclusiveScope?: string): Promise<T> {
    const keys = [keyPrefix + 'active', keyPrefix + 'regular'];
    if (userId) keys.push(keyPrefix + 'user:' + userId);
    // A draft is shared by multiple administrators and API replicas. Do not
    // spend another inference slot generating the same draft concurrently.
    if (exclusiveScope) keys.push(keyPrefix + 'scope:' + exclusiveScope);
    const token = randomUUID();
    let admitted: unknown;
    try {
      admitted = await this.redis.eval(acquireSlot, keys.length, ...keys,
        this.limit, Math.max(1, this.limit - 1), lane, inferenceTimeoutMs(timeoutMs) + 5000, token, keyTtlMs);
    } catch {
      throw new ServiceUnavailableException('AI je dočasně nedostupná. Zkus to později.');
    }
    if (admitted !== 1) throw new HttpException('AI je vytížená. Zkus to za chvíli.', HttpStatus.TOO_MANY_REQUESTS);
    try {
      return await work();
    } finally {
      const release = this.redis.multi();
      for (const key of keys) release.zrem(key, token);
      await release.exec().catch(() => undefined);
    }
  }

  /** Global admitted leases, not GPU utilization or a queue length. */
  async snapshot():Promise<{limit:number;active:number;regular:number}|null>{
    try{
      const values=await this.redis.eval(`local c=redis.call('TIME'); local now=tonumber(c[1])*1000+math.floor(tonumber(c[2])/1000); return {redis.call('ZCOUNT',KEYS[1],'('..now,'+inf'),redis.call('ZCOUNT',KEYS[2],'('..now,'+inf')}`,2,keyPrefix+'active',keyPrefix+'regular');
      if(!Array.isArray(values)||values.length!==2||values.some(v=>!Number.isInteger(v)||v<0))return null;
      return {limit:this.limit,active:Number(values[0]),regular:Number(values[1])};
    }catch{return null;}
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
