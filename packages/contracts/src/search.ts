import { z } from 'zod';

export const SearchVisibility = {
  PLATFORM: 'PLATFORM',
  EVENT: 'EVENT',
  UNIT: 'UNIT',
  RESTRICTED: 'RESTRICTED',
} as const;

export type SearchVisibilityValue = (typeof SearchVisibility)[keyof typeof SearchVisibility];

/**
 * Global Search Document projection contract.
 * Represents derived search projections indexed into Typesense.
 */
export const SearchDocumentSchema = z.object({
  id: z.string(), // Unique Typesense document ID, e.g. `${resourceType}:${canonicalId}`
  canonicalId: z.string().uuid(),
  resourceType: z.string(),
  eventId: z.string().optional().default(''),

  title: z.string(),
  subtitle: z.string().optional().default(''),

  content: z.string().optional().default(''),
  normalizedContent: z.string().optional().default(''),

  identifiers: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),

  status: z.string().optional().default(''),

  requiredPermission: z.string(), // Permission required to discover this document (e.g. 'event.read')

  visibility: z.enum(['PLATFORM', 'EVENT', 'UNIT', 'RESTRICTED']).default('EVENT'),
  unitIds: z.array(z.string()).default([]),
  ownerUserId: z.string().optional().default(''),
  assignedUserIds: z.array(z.string()).default([]),

  route: z.string().optional().default(''),

  createdAt: z.number().optional().default(0),
  updatedAt: z.number().optional().default(0),
});

export type SearchDocument = z.infer<typeof SearchDocumentSchema>;

/**
 * Public Search Result Item returned to the authenticated client.
 * Strips all internal security and visibility metadata.
 */
export const SearchResultItemSchema = z.object({
  id: z.string(),
  canonicalId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  eventId: z.string().optional(),
  highlights: z.array(z.string()).default([]),
  route: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchQueryFiltersSchema = z.object({
  q: z.string().default(''),
  eventId: z.string().uuid().optional(),
  types: z.union([z.string(), z.array(z.string())]).optional(),
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(50).default(10).optional(),
});

export type SearchQueryFilters = z.infer<typeof SearchQueryFiltersSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  results: z.array(SearchResultItemSchema),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
