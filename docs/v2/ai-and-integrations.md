# CYRIS v2 — Intelligence, Integration Security & DGX Spark Architecture

> **Specification Reference**: STEP 8/8 — CYRIS Intelligence, Integration Security and Production Readiness.  
> **Status**: Completed & Production Ready.

---

## 1. Core Architectural Boundary & The DGX Spark Principle

CYRIS v2 implements an isolated, air-gapped integration boundary for artificial intelligence compute. During development and operational deployment, CYRIS does **not** assume continuous access to dedicated hardware, and the system is fully functional when **zero** AI providers are configured.

```
┌─────────────────────────────────────────────────────────────┐
│                    CYRIS Operational Core                   │
│         (Cases, Evidence, Laboratory, Timeline, Audit)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Permission-Aware Context                  │
│       (AuthorizationService & ResourceAccessService)        │
│          * ONLY user-permitted records extracted *          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                         AI Gateway                          │
│     (Provider Selection, Timeouts, Provenance ai_runs)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   AI Provider Abstraction                   │
│                     (OpenAI-Compatible)                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / TLS (Private Network)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Future NVIDIA DGX Spark                    │
│           (vLLM / NIM / OpenAI-Compatible Server)           │
└─────────────────────────────────────────────────────────────┘
```

### Strict Security Rules for DGX Spark
1. **Zero Database Access**: DGX Spark and inference hosts **NEVER** receive PostgreSQL credentials, connect to the database, or query Typesense directly.
2. **Context Ownership**: CYRIS controls 100% of the prompt context. Only data the authenticated user is authorized to read is ever delivered to the upstream model.
3. **No Silent State Mutations**: AI output is strictly advisory with default status `DRAFT`. AI never mutates evidence custody, approves laboratory analyses, changes case status, or alters audit logs.
4. **Resilience & Decoupling**: AI provider availability is completely decoupled from `/health/ready`. If DGX Spark goes offline during an exercise, all investigation, search, evidence, and court workflows continue without interruption.

---

## 2. AI Provider Abstraction

The provider abstraction is defined in [`apps/api/src/modules/ai/providers/ai-provider.interface.ts`](file:///Users/mac/Documents/Projekty/CYRIS_v2/apps/api/src/modules/ai/providers/ai-provider.interface.ts):

```typescript
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType: string;

  getCapabilities(): AICapabilityValue[];
  generate(messages: AIMessage[], options?: AIGenerateOptions): Promise<AIGenerateResult>;
  stream?(messages: AIMessage[], options?: AIGenerateOptions): AsyncIterable<string>;
  embed?(texts: string[]): Promise<number[][]>;
  testConnection(): Promise<TestConnectionResult>;
}
```

### Supported Capabilities
- `CHAT`: Multi-turn conversational and instruction inference.
- `STREAM`: Server-sent token streaming.
- `EMBED`: Vector representations (pgvector / semantic retrieval).
- `TOOL_CALL`: Read-only, authorized tool invocations.

### `OpenAICompatibleProvider`
Implements the HTTP interface consumed by standard modern inference servers (NVIDIA NIM, vLLM, Ollama, LocalAI, Azure OpenAI, OpenAI).
- **Dual runtime endpoints**: `endpoint` is used for chat completions. `embeddingEndpoint` is optional and is used for embeddings; when omitted, embeddings use `embeddingEndpoint || endpoint`.
- **Embedding requests**: When `embeddingModel` is configured, the provider sends `POST /embeddings` with only `model` and `input`. It preserves the runtime's native vector dimensions and does not send a `dimensions` override.
- **Private Network Support**: Compatible with internal hostnames (e.g. `https://spark.cylab.local/v1`) and raw IP addresses without internet access.
- **Optional Authentication**: Supports unauthenticated endpoints (common for internal private lab networks) or Bearer API keys.
- **TLS Verification**: Defaults to strict TLS verification (`rejectUnauthorized: true`). Supports development/internal lab overrides with logged security warnings.
- **Safe Probing**: `testConnection()` first probes `/models` or issues a 1-token dummy prompt, returning sanitized diagnostics without leaking secrets or stack traces.

### Reasoning policy

Generation accepts an explicit `reasoning` mode:

- `default`: omit provider-specific thinking controls and use the runtime default.
- `disabled`: send `chat_template_kwargs.enable_thinking: false`.
- `enabled`: send `chat_template_kwargs.enable_thinking: true`.

CYRIS currently uses:

| Operation | Reasoning | Output limit |
|---|---|---:|
| Writing Assist | disabled | 768 tokens |
| Case Summary | disabled | 1,800 tokens |
| Catch Me Up | enabled | 1,000 tokens |
| Timeline Explain | enabled | 1,200 tokens |

Writing Assist and Case Summary are transformation/structured-output utilities,
so they do not need hidden reasoning budget. Catch Me Up and Timeline Explain
retain reasoning because they synthesize operational context and causal chains.
Reasoning is never returned as user-visible text or persisted in provenance.

Example DGX Spark configuration:

```text
endpoint:          http://<SPARK_IP>:8000/v1
chatModel:         nvidia/Qwen3.8-27B-NVFP4
embeddingEndpoint: http://<SPARK_IP>:8001/v1
embeddingModel:    Qwen/Qwen3-Embedding-8B
timeoutSeconds:    120
tlsVerify:         true
```

The embedding endpoint and model are optional. Existing integrations that
only contain `endpoint`, `chatModel`, and optionally `embeddingModel` remain
valid; the provider falls back to the chat endpoint when
`embeddingEndpoint` is absent.

---

## 3. Envelope Encryption & Key Management

Integration credentials (AI API keys, future LDAP bind passwords, and OIDC client secrets) are encrypted before persistence in PostgreSQL.

### Cryptographic Specification:
- **Algorithm**: `AES-256-GCM` (NIST SP 800-38D).
- **Key Source**: Root secret `CYRIS_MASTER_KEY` loaded exclusively from the server environment.
- **IV / Nonce**: Fresh, cryptographically random 12-byte IV per encryption (never deterministic).
- **Integrity**: 128-bit authentication tag; tampering causes immediate fail-closed authentication rejection.
- **Master Key Format**: Cryptographically secure 256-bit (32-byte) key encoded in Base64 or 64-character hex.
- **Key Generation**: Run `pnpm secrets:keygen` to produce a random suitable master key.

### Database Model:
- `integrations`: Non-sensitive configuration (display name, category, endpoint, chat model, timeout, tlsVerify).
- `integration_secrets`: Envelope-encrypted ciphertext, base64 IV, base64 auth tag, key version, and algorithm.

### API Secret Rules:
- Secrets are accepted only on create or update.
- Secret plaintexts are **never** returned in API responses.
- The UI exclusively displays boolean state: `hasApiKey: true` ("Configured") or `false`.
- A blank edit does not erase an existing key unless the administrator explicitly triggers `clearApiKey: true`.
- Audit logs record secret modification events (`integration.secret.updated`, `integration.secret.deleted`) without storing secret values.

---

## 4. Permission-Aware AI Context Builder

CYRIS enforces zero *"the model sees it but is told not to tell the user"* security. Context retrieval strictly reuses the central [`ResourceAccessService`](file:///Users/mac/Documents/Projekty/CYRIS_v2/apps/api/src/modules/resources/resource-access.service.ts) and [`AuthorizationService`](file:///Users/mac/Documents/Projekty/CYRIS_v2/apps/api/src/modules/authorization/authorization.service.ts).

### Flow:
```
User Request (with JWT Session)
    ↓
Check Domain Permission (e.g. case.read)
    ↓
Resource Access Check (Ownership, Unit Membership, Event Membership, Visibility)
    ↓
Permitted Entities Only
    ↓
Context Formatting & Identifier Tagging (CASE-0001, E-0004, LAB-0002)
    ↓
AI Gateway
    ↓
Inference Host (DGX Spark)
```

- **SCENARIO Isolation**: Scenario records are strictly hidden from normal event participants. AI never receives scenario materials unless invoked by an authorized Scenario Controller or Platform Admin.
- **RESTRICTED Isolation**: Restricted evidence, cases, or notes are omitted unless the requesting user has explicit access rights.
- **Causal Traversal**: When walking parent activity causation, if the user lacks read permission on any upstream parent resource, the causal chain terminates immediately.

---

## 5. AI Execution Provenance (`ai_runs`)

Every AI invocation records auditable metadata in the `ai_runs` table:

| Column | Type | Description |
|---|---|---|
| `id` | UUIDv7 | Unique execution run identifier |
| `userId` | UUID | Authenticated user who triggered the operation |
| `eventId` | UUID | Bounded event/exercise identifier |
| `providerId` | UUID | Foreign key to `integrations.id` |
| `capability` | VARCHAR(64) | `CHAT`, `STREAM`, `EMBED`, etc. |
| `operationType` | VARCHAR(64) | `WRITING_ASSIST`, `CASE_SUMMARY`, `CATCH_ME_UP`, `TIMELINE_EXPLAIN` |
| `model` | VARCHAR(128) | Model identifier (e.g. `meta/llama-3.1-70b-instruct`) |
| `promptTemplateVersion` | VARCHAR(32) | Version tag of system prompt template |
| `contextResourceIds` | JSONB | Array of resource UUIDs supplied in context |
| `startedAt` / `completedAt` | TIMESTAMP | High-resolution execution timestamps |
| `durationMs` | INTEGER | End-to-end execution latency |
| `status` | VARCHAR(32) | `SUCCESS`, `FAILED`, `TIMED_OUT` |
| `usageMetadata` | JSONB | Token usage breakdown when provided by runtime |
| `errorCategory` | VARCHAR(64) | Sanitized category (`TIMEOUT`, `AUTH_FAILED`, `UNREACHABLE`, etc.) |

**Privacy Safeguard**: Raw user prompts and generated model texts are **not** persisted indefinitely in `ai_runs`, preventing sensitive query leakage into database logs.

---

## 6. Implemented Intelligence Features

### 1. Contextual Writing Assist
- **Location**: Available on long-text fields across Cases, Incidents, Evidence notes, and Lab conclusions.
- **Actions**: Improve writing, Make concise, Make formal, Correct language, Translate Czech ↔ English.
- **Factual Uncertainty Preservation**: The system prompt strictly prohibits upgrading uncertain statements (e.g. "asi", "možná", "suspected") into confirmed facts.
- **Trust Model**: Generated output is presented in a modal with a `DRAFT` tag; human review is required before applying.

### 2. Case Intelligence Summary
- **Location**: Header action on Case Detail views (`/events/[eventId]/cases/[caseId]`).
- **Context**: Bounded by user permissions: case overview, related entities, registered evidence, laboratory findings, and timeline events.
- **Factual Classification**: Explicitly distinguishes:
  1. *Confirmed Facts* (referencing concrete codes `E-0001`, `LAB-0001`).
  2. *Correlations & Links* (network associations, related persons/devices).
  3. *Unverified Information* (preliminary leads, open hypotheses).

### 3. Catch Me Up Operational Briefing
- **Location**: Header widget on Operational Overview (`/events/[eventId]/overview`).
- **Context**: Bounded to recent events in units accessible to the operator.
- **Periods**: "Last 2 Hours", "Today", "Since Last Login".
- **Output**: Synthesized situational awareness briefing highlighting critical evidence movements, new cases, and approved lab analyses without dumping raw rows.

### 4. Timeline Causation Analysis ("Explain / Why")
- **Location**: Action on activity timeline items (`/events/[eventId]/timeline`).
- **Causation Engine**: Inspects explicit `causationId` links and shared correlation batches.
- **Anti-Hallucination Rule**: If CYRIS does not contain parent records or explicit causation, the model is strictly forbidden from inventing causality and reports: *"Insufficient recorded information to establish causality."*

---

## 7. Connecting Future NVIDIA DGX Spark

When DGX Spark is powered on and configured with NVIDIA NIM or vLLM:

1. Log into CYRIS as Platform Administrator (`admin@cyris.local`).
2. Navigate to **Administration → Settings → Integrations → Intelligence / AI**.
3. Click **Add AI Provider**:
   - **Display Name**: `NVIDIA DGX Spark`
   - **Provider Type**: `OPENAI_COMPATIBLE`
   - **Endpoint URL**: `https://spark.cylab.local/v1` (or internal IP)
   - **Chat Model**: Name of loaded model (e.g. `meta/llama-3.1-70b-instruct`)
   - **API Key**: Optional (leave empty if DGX Spark private network requires no auth)
   - **Timeout**: `60` or `120` seconds
   - **TLS Verification**: Enabled (or uncheck if using a private self-signed certificate)
   - Check **Set as Active AI Provider for CYRIS**.
4. Click **Test Connection**:
   - CYRIS probes `/models` or issues a 1-token test completion.
   - Verifies network route, latency, and model availability.
5. Save the configuration. CYRIS Intelligence is immediately live across all operational workspaces.
