# CYRIS v2 — AI Gateway & DGX Spark Architectural Boundary

The AI gateway currently supports OpenAI-compatible chat generation and
embedding requests. Embedding storage and retrieval are intentionally outside
this module.

---

## EXCON support and shared inference capacity

The participant FAQ runs in the browser. In the event helpdesk an EXCON operator can request a reply draft for one conversation or a handover covering up to the twelve longest-waiting open requests. Publishing a reply requires a separate operator action.

Set `CYRIS_AI_MAX_CONCURRENT` on the API to control concurrent calls to the model across all replicas. Its default of two admits one ordinary call alongside one EXCON call, or two EXCON calls from different operators. Each signed-in user may have one active inference. A busy or offline model leaves tickets and manual replies available. Set the limit after measuring the chosen model on the exercise Spark.

Support drafts use 320 output tokens for a reply and 600 for a handover, with a 45-second timeout. Redis shares an encrypted five-minute result for matching authorized inputs and suppresses duplicate model calls. Before returning a draft, CYRIS checks the session, permissions and current conversation or queue again.

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
