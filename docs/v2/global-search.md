# CYRIS v2 — Global Search & Indexing Architecture

## 1. Architectural Philosophy: Typesense as Derived State

In CYRIS v2, **PostgreSQL is the single canonical source of truth**. Typesense operates exclusively as a **derived, disposable projection index**:
- Typesense holds search projections, not authoritative business state.
- If the Typesense cluster is purged or reinitialized, the search index is completely and deterministically rebuildable from PostgreSQL via `pnpm search:reindex`.
- Transient Typesense downtime or network degradation **never causes canonical transactions to fail**.

### Critical Security Rule: No Direct Browser Access
The browser client **never** connects directly to Typesense and **never** receives administrative or search Typesense API keys.
```
Browser  ───▶  CYRIS API (GET /search)  ───▶  Search Authorization  ───▶  Typesense
               (Session Authenticated)         (Canonical DB State)        (Derived Index)
```

---

## 2. Global Search Document Contract

Cross-system search uses one unified Typesense collection: `cyris_global_v1`.

### Projection Contract (`SearchDocument`)
```typescript
interface SearchDocument {
  id: string;                  // e.g. "event:019..." or "unit:019..."
  canonicalId: string;         // UUID matching domain entity PK
  resourceType: string;        // "event" | "unit" | "role" | future ("case", "evidence", etc.)
  eventId?: string;            // Scoped event UUID (if applicable)

  title: string;               // Primary human-readable name
  subtitle?: string;           // Descriptive context, slug, or parent hierarchy

  content?: string;            // Text content, description, or extracted document body
  normalizedContent?: string;  // Deterministically normalized text (diacritics stripped)

  identifiers: string[];       // Exact technical identifiers (UUIDs, slugs, IPs, hashes)
  tags: string[];              // Resource tags and classification tokens

  status?: string;             // Lifecycle state ("ACTIVE", "ARCHIVED", etc.)

  requiredPermission: string;  // Permission atom required to discover (e.g. "unit.read")

  visibility: string;          // "PLATFORM" | "EVENT" | "UNIT" | "RESTRICTED"
  unitIds: string[];           // Organizational units guarding document access
  ownerUserId?: string;        // Owner predicate
  assignedUserIds: string[];   // Assigned user predicates

  route?: string;              // Canonical frontend route
  createdAt?: number;          // Epoch milliseconds
  updatedAt?: number;          // Epoch milliseconds
}
```

### Public Result Shape (`SearchResultItem`)
The browser receives a sanitized projection stripping internal visibility scopes and authorization internals:
```typescript
interface SearchResultItem {
  id: string;
  canonicalId: string;
  type: string;
  title: string;
  subtitle?: string;
  eventId?: string;
  highlights: string[];
  route?: string;
  status?: string;
  tags: string[];
}
```

---

## 3. Query-Time Permission-Aware Filtering

Search authorization does not bake user access statically into indexed documents. Instead, **at query time**, the CYRIS API resolves the authenticated user's canonical access against PostgreSQL:
1. **Platform Administrators** (`platform.manage` / platform-level role):
   - Can discover records across the entire platform.
   - Filter applies only user-supplied constraints (e.g. `type:unit` or `event:cybertron-2027`).
2. **Standard Operators**:
   - Access is resolved dynamically:
     - Platform-level permissions (`visibility:PLATFORM && requiredPermission:[userPerms...]`)
     - Active event memberships (`eventId:[userEvents...] && visibility:[PLATFORM, EVENT] && requiredPermission:[userPerms...]`)
     - Organizational unit memberships (`eventId:eventId && visibility:UNIT && requiredPermission:[unitPerms...] && unitIds:[userUnitIds...]`)
     - Immediate revocation: When an operator is removed from an event membership or role in PostgreSQL, their subsequent `/search` request immediately reflects the updated state without reindexing documents.
3. **No Leakage Principle**:
   - Filter expressions execute at the Typesense engine query level.
   - Unauthorized records never appear in result sets, facets, hit counts, or highlights.

---

## 4. Projection Provider Architecture

Search core does not know every domain table. Instead, it defines an extensible provider contract:

```typescript
export interface SearchProjectionProvider {
  getSupportedTypes(): string[];
  buildDocument(db: CyrisDb, type: string, id: string): Promise<SearchDocument | null>;
  listAllDocuments(db: CyrisDb, type: string, eventId?: string): Promise<SearchDocument[]>;
}
```

### Registered Providers (STEP 5)
- `EventSearchProjectionProvider`: Projects `events` table.
- `UnitSearchProjectionProvider`: Projects `organizational_units` table with event hierarchy context.
- `RoleSearchProjectionProvider`: Projects `roles` table.

When domain entities (`Case`, `Evidence`, `Person`, etc.) are introduced in STEP 6, they simply implement `SearchProjectionProvider` and register into `defaultSearchProjectionRegistry`. Zero modifications to the core search controller, indexer, or worker are required.

---

## 5. Indexing Pipeline: Transactional Outbox

Mutations in CYRIS write canonical rows and search outbox events atomically within the database transaction:
```
PostgreSQL Mutation (e.g. Event, Unit, Role)
       │
       ▼
Transactional Outbox (outbox_events: "search.upsert" / "search.delete")
       │
       ▼
CYRIS Worker (OutboxProcessorService polling)
       │
       ▼
Projection Builder (SearchProjectionRegistry)
       │
       ▼
Typesense Upsert (Collection: cyris_global_v1)
```

- **Idempotency**: All indexing operations use Typesense upsert semantics.
- **Fault-Tolerance**: If Typesense is temporarily unreachable, the canonical database mutation succeeds. The worker catches the indexing error, increments `retryCount`, and retries on subsequent polling ticks.
- **Relationship-Driven Reindexing**: When a relationship between two entities changes, `searchIndexerService.requestRelationshipReindex(source, target)` enqueues indexing events for both entities without recursive graph crawling.

---

## 6. Rebuild & Reindex Strategy

Typesense state is managed via explicit CLI commands:

- **`pnpm search:setup`**:
  Validates the presence of the `cyris_global_v1` collection. If absent, creates it with full schema typing. Idempotent and safe to run at any time.
- **`pnpm search:reindex`**:
  Streams all canonical PostgreSQL entities through registered projection providers and performs batch upsert into Typesense.
- **`pnpm search:reindex --event <eventId>`**:
  Reindexes only entities associated with a specific event.

Application startup **never** destroys or drops search collections.

---

## 7. Normalization & Ranking

Search ranking prioritizes:
1. Exact Identifiers (`identifiers`) — Weight 10
2. Title (`title`) — Weight 8
3. Tags (`tags`) — Weight 6
4. Subtitle (`subtitle`) — Weight 4
5. Content & Normalized Content (`content, normalizedContent`) — Weight 2

### Unicode & Diacritics Normalization
`normalizeSearchText(text)` strips Czech / Unicode diacritics deterministically:
- Original display: `"Novotný"`, `"Český Cybertron"`
- Indexed normalized representation: `"novotny"`, `"cesky cybertron"`
- Searching for `novotny` immediately matches `Novotný`.

Technical identifiers (IP addresses like `10.42.18.7`, case codes `CASE-004`, evidence tags `E-042`, hashes, and UUIDs) are stored intact in `identifiers` to preserve exact match semantics.

---

## 8. Simple Search Syntax Parser

The search query parser extracts explicit inline filters without requiring a heavyweight AST:
- `type:<value>`: Filters by `resourceType` (e.g. `type:unit`)
- `event:<value>`: Filters by `eventId` (e.g. `event:019...`)
- Remaining text is passed as `cleanQuery` to full-text search.

Example: `investigation type:unit` searches for keyword `"investigation"` scoped to units.

---

## 9. Future Integration Boundaries

### Future Document Search (STEP 6)
Extracted textual data from PDFs, evidence reports, and forensic logs will be fed into `SearchDocument.content`. The search pipeline remains agnostic to whether content originated from a database column or extracted document text.

### Future Semantic & AI Search Boundary (STEP 8)
- STEP 5 establishes high-performance **keyword & identifier search** in Typesense.
- In STEP 8, semantic vector search (leveraging PostgreSQL `pgvector`) and DGX Spark AI synthesis will sit alongside Typesense:
  ```
  User Query
      │
      ├──▶ Typesense (Keyword & Technical Identifiers)
      │
      └──▶ pgvector (Dense Semantic Embeddings)
              │
              ▼
         Hybrid Ranking & Context Synthesis (AI Engine)
  ```
The Typesense contract and API endpoint remain completely stable.
