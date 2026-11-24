import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Client as TypesenseClient } from 'typesense';
import {
  type SearchQueryFilters,
  type SearchResponse,
  type SearchResultItem,
} from '@cyris/contracts';
import { parseSearchQuery } from '@cyris/shared';
import { GLOBAL_SEARCH_COLLECTION } from '@cyris/db';
import { ConfigService } from '../config/config.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { SearchAuthzService } from './search-authz.service.js';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: TypesenseClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly searchAuthzService: SearchAuthzService
  ) {
    const { TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_API_KEY } = this.configService.values;

    this.client = new TypesenseClient({
      nodes: [
        {
          host: TYPESENSE_HOST,
          port: TYPESENSE_PORT,
          protocol: 'http',
        },
      ],
      apiKey: TYPESENSE_API_KEY,
      connectionTimeoutSeconds: 5,
    });
  }

  get typesenseClient(): TypesenseClient {
    return this.client;
  }

  /**
   * Verifies connectivity to the Typesense search cluster.
   */
  async verifyConnection(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    const health = await this.client.health.retrieve();
    const latencyMs = Date.now() - start;
    return { ok: health.ok === true, latencyMs };
  }

  /**
   * Healthcheck helper for readiness endpoints.
   */
  async checkHealth(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
    try {
      const result = await this.verifyConnection();
      return result.ok ? { status: 'up', latencyMs: result.latencyMs } : { status: 'down', error: 'Unhealthy response' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Typesense check failed';
      this.logger.error(`Typesense health check failed: ${message}`);
      return { status: 'down', error: 'Search engine inaccessible' };
    }
  }

  /**
   * Global cross-system search execution.
   * Permission-aware at query time: resolves authenticated user's canonical access
   * and builds Typesense filters BEFORE any documents or hit counts are returned.
   */
  async search(
    query: SearchQueryFilters,
    user: AuthenticatedUser
  ): Promise<SearchResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));

    // 1. Parse simple search filter syntax (e.g. `type:unit` or `event:cybertron-2027`)
    const parsed = parseSearchQuery(query.q || '');
    const cleanQuery = parsed.cleanQuery;

    const effectiveType = query.types
      ? Array.isArray(query.types)
        ? query.types[0]
        : query.types
      : parsed.typeFilter;

    const effectiveEventId = query.eventId || parsed.eventFilter;

    // 2. Empty queries return empty results rather than expensive browse scans
    if (!cleanQuery && !effectiveType && !effectiveEventId) {
      return {
        query: query.q || '',
        total: 0,
        page,
        limit,
        results: [],
      };
    }

    // 3. Resolve canonical authorization context and generate Typesense filter expression
    const filterBy = await this.searchAuthzService.buildTypesenseFilter(user, {
      typeFilter: effectiveType,
      eventFilter: effectiveEventId,
    });

    // If user has zero discoverable permissions or active memberships, return empty immediately
    if (filterBy === null) {
      return {
        query: query.q || '',
        total: 0,
        page,
        limit,
        results: [],
      };
    }

    // 4. Configure search parameters
    const searchParams: Record<string, unknown> = {
      q: cleanQuery || '*',
      query_by: 'identifiers,title,tags,subtitle,content,normalizedContent',
      query_by_weights: '10,8,6,4,2,2',
      page,
      per_page: limit,
      num_typos: 2,
      prefix: true,
      include_fields: 'id,canonicalId,resourceType,title,subtitle,eventId,route,status,tags',
    };

    if (filterBy && filterBy.length > 0) {
      searchParams.filter_by = filterBy;
    }

    if (cleanQuery) {
      searchParams.sort_by = '_text_match:desc,createdAt:desc';
    }

    try {
      // 5. Execute search against Typesense
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const searchResult: any = await this.client
        .collections(GLOBAL_SEARCH_COLLECTION)
        .documents()
        .search(searchParams);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hits = searchResult.hits || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: SearchResultItem[] = hits.map((hit: any) => {
        const doc = hit.document;
        const highlights: string[] = [];

        if (hit.highlights && Array.isArray(hit.highlights)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const h of hit.highlights) {
            if (h.snippet) {
              highlights.push(h.snippet);
            }
          }
        }

        return {
          id: doc.id,
          canonicalId: doc.canonicalId,
          type: doc.resourceType,
          title: doc.title,
          subtitle: doc.subtitle || undefined,
          eventId: doc.eventId || undefined,
          highlights,
          route: doc.route || undefined,
          status: doc.status || undefined,
          tags: doc.tags || [],
        };
      });

      return {
        query: query.q || '',
        total: searchResult.found || 0,
        page,
        limit,
        results,
      };
    } catch (err) {
      this.logger.error(`Search query failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Search is temporarily unavailable. Please try again.');
    }
  }
}
