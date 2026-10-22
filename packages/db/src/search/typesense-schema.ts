/**
 * ==============================================================================
 * CYRIS v2 — Global Typesense Search Collection Schema
 * ==============================================================================
 * Schema version constant and field definitions for the unified global search index.
 */

export const GLOBAL_SEARCH_COLLECTION = 'cyris_global_v1';

export const cyrisGlobalCollectionSchema = {
  name: GLOBAL_SEARCH_COLLECTION,
  fields: [
    { name: 'id', type: 'string' as const },
    { name: 'canonicalId', type: 'string' as const },
    { name: 'resourceType', type: 'string' as const, facet: true },
    { name: 'eventId', type: 'string' as const, facet: true, optional: true },
    { name: 'title', type: 'string' as const },
    { name: 'subtitle', type: 'string' as const, optional: true },
    { name: 'content', type: 'string' as const, optional: true },
    { name: 'normalizedContent', type: 'string' as const, optional: true },
    { name: 'identifiers', type: 'string[]' as const, facet: true, optional: true },
    { name: 'tags', type: 'string[]' as const, facet: true, optional: true },
    { name: 'status', type: 'string' as const, facet: true, optional: true },
    { name: 'requiredPermission', type: 'string' as const, facet: true },
    { name: 'visibility', type: 'string' as const, facet: true },
    { name: 'unitIds', type: 'string[]' as const, facet: true, optional: true },
    { name: 'ownerUserId', type: 'string' as const, facet: true, optional: true },
    { name: 'assignedUserIds', type: 'string[]' as const, facet: true, optional: true },
    { name: 'route', type: 'string' as const, optional: true },
    { name: 'createdAt', type: 'int64' as const, optional: true },
    { name: 'updatedAt', type: 'int64' as const, optional: true },
  ],
};
