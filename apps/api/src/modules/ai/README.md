# CYRIS v2 — AI Gateway & DGX Spark Architectural Boundary

The AI gateway currently supports OpenAI-compatible chat generation and
embedding requests. Embedding storage and retrieval are intentionally outside
this module.

---

## Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    CYRIS Domain Core                         │
│         (Cases, Evidence, Laboratory, Workflows)            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       AI Gateway                            │
│  (Orchestration, Prompt Templates, Rate Limiting, Auditing) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   AI Provider Abstraction                   │
│           (e.g., DGX Spark Provider, Local/Cloud)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST / gRPC
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                         DGX Spark                           │
│   (Accelerated Compute, LLM Inference, Embedding Models)    │
└─────────────────────────────────────────────────────────────┘
```

## Immutable Architecture Rules
1. **No Direct Database Access**: DGX Spark will **NEVER** receive database credentials or access PostgreSQL directly. All interactions flow through the application AI Provider abstraction.
2. **Provider Configuration**: Provider configuration stores `endpoint`,
   `chatModel`, optional `embeddingEndpoint`, optional `embeddingModel`,
   timeout, and TLS settings. Secrets are envelope-encrypted at rest using
   `CYRIS_MASTER_KEY`.
3. **Embedding Endpoint Fallback**: When `embeddingEndpoint` is absent, the
   provider uses `embeddingEndpoint || endpoint`, allowing chat and embedding
   runtimes to share one OpenAI-compatible base URL.
4. **No RAG Persistence**: Embeddings are returned through the gateway but are
   not persisted or indexed by this integration.
