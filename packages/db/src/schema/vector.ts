import { customType } from 'drizzle-orm/pg-core';

/**
 * Custom Drizzle ORM column type for pgvector `vector` data type.
 * Supports configurable dimension sizes (e.g. 384, 768, 1536).
 */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions?: number };
}>({
  dataType(config) {
    return config?.dimensions ? `vector(${config.dimensions})` : 'vector';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (!value) return [];
    return value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((v) => parseFloat(v.trim()))
      .filter((v) => !isNaN(v));
  },
});
