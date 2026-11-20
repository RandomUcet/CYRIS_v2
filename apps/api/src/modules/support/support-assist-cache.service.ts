import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { Command } from 'ioredis';
import { decryptSecret, encryptSecret, parseMasterKey } from '@cyris/shared';
import { SupportAssistResultSchema, type SupportAssistInput, type SupportAssistResult } from '@cyris/contracts';
import { ConfigService } from '../config/config.service.js';
import { QueueService } from '../queue/queue.service.js';

const CLAIM = `
  local existing = redis.call('GET', KEYS[1])
  if existing then return existing end
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return ARGV[1]`;
const FINISH = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  if ARGV[2] == '' then return redis.call('DEL', KEYS[1]) end
  redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
  return 1`;
const LEASE_MS = 90_000;
const RESULT_MS = 300_000;
type Locale = SupportAssistInput['locale'];

export function assistUnavailable(locale: Locale) {
  return new ServiceUnavailableException(locale === 'cs'
    ? 'AI není dostupná. Pokračujte ručně nebo to zkuste později.'
    : 'AI is unavailable. Continue manually or try again later.');
}

@Injectable()
export class SupportAssistCache {
  private readonly masterKey: Buffer;

  constructor(private readonly queue: QueueService, config: ConfigService) {
    this.masterKey = parseMasterKey(config.values.CYRIS_MASTER_KEY);
  }

  private encryptionKey(key: string) {
    // A cached draft can only be decrypted for its exact exercise, resources and revision.
    return createHmac('sha256', this.masterKey).update(key).digest();
  }

  private async command(script: string, args: string[], locale: Locale) {
    try {
      const redis = this.queue.client;
      if (redis.status !== 'ready') throw assistUnavailable(locale);
      const command = new Command('eval', [script, '1', ...args]);
      command.setTimeout(2000);
      const reply: unknown = await redis.sendCommand(command);
      return Buffer.isBuffer(reply) ? reply.toString('utf8') : reply;
    } catch {
      throw assistUnavailable(locale);
    }
  }

  async claim(key: string, locale: Locale): Promise<{ owner: string } | { result: SupportAssistResult }> {
    const owner = 'pending:' + randomUUID();
    const entry = await this.command(CLAIM, [key, owner, String(LEASE_MS)], locale);
    if (entry === owner) return { owner };
    if (typeof entry === 'string' && entry.startsWith('pending:')) {
      throw new ConflictException(locale === 'cs'
        ? 'Návrh se už připravuje. Zkuste jej za chvíli otevřít znovu nebo pokračujte ručně.'
        : 'A draft is already being prepared. Try again shortly or continue manually.');
    }
    try {
      if (typeof entry !== 'string') throw assistUnavailable(locale);
      const text = decryptSecret(JSON.parse(entry), this.encryptionKey(key));
      return { result: SupportAssistResultSchema.parse({ text }) };
    } catch {
      throw assistUnavailable(locale);
    }
  }

  async publish(key: string, owner: string, result: SupportAssistResult, locale: Locale) {
    const entry = JSON.stringify(encryptSecret(result.text, this.encryptionKey(key)));
    const saved = await this.command(FINISH, [key, owner, entry, String(RESULT_MS)], locale);
    if (saved !== 1) throw assistUnavailable(locale);
  }

  async release(key: string, owner: string, locale: Locale) {
    // If Redis went offline, the lease expires. A late caller can never clear its successor.
    await this.command(FINISH, [key, owner, '', '0'], locale).catch(() => {});
  }
}
