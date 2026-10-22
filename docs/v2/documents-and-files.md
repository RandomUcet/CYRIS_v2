# CYRIS v2 — Documents and Binary Files Architecture

## 1. Architectural Overview

CYRIS v2 handles document attachments, operational filings, forensic reports, and multimedia files using a strict separation of metadata and binary payload storage:
- **Canonical Metadata**: Stored in PostgreSQL in the `documents` table (`resources.id === documents.id`) and `document_versions` table.
- **Binary Payloads**: Stored in S3-compatible object storage (MinIO locally, AWS S3 / Ceph in production). No raw binary bytes are ever stored in PostgreSQL rows.
- **Fail-Closed Access**: All download requests, presigned URLs, and streaming endpoints authorize the user against `ResourceAccessService` and `document.read` permissions *before* interacting with object storage. The underlying storage bucket is private and never exposed to the public internet.

```
+-------------------------------------------------------------------+
|                        CYRIS Web Client                           |
+---------------------------------+---------------------------------+
                                  | Upload (multipart or JSON)
                                  v
+-------------------------------------------------------------------+
|                   CYRIS API (DocumentsModule)                     |
|  - Validates event and permissions (document.create / version)    |
|  - Streams file to S3 with generated UUIDv7 objectKey             |
|  - Computes SHA-256 integrity hash during upload stream           |
|  - Inserts resource & document record in PostgreSQL               |
|  - Enqueues outbox event: document.extract_text                   |
+---------------------------------+---------------------------------+
                                  | Outbox Pattern
                                  v
+-------------------------------------------------------------------+
|                     CYRIS Worker Service                          |
|  - Consumes document.extract_text                                 |
|  - Downloads object stream from S3                                |
|  - Extracts text (plaintext, markdown, PDF via pdf-parse)         |
|  - Updates extractedText and textExtractionStatus                 |
|  - Enqueues search.upsert for SearchProjectionProvider            |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|              Typesense / PostgreSQL Global Search                 |
|  - Fail-closed document projection (title, DOC-ID, text, filename)|
+-------------------------------------------------------------------+
```

---

## 2. Data Model

### `documents` Table
- `id`: UUIDv7 PK, references `resources.id` (1:1 resource identity).
- `eventId`: UUID references `events.id`.
- `documentNumber`: Human-readable identifier allocated via concurrency-safe allocator (`DOC-0001`).
- `title`: String.
- `description`: Text (optional).
- `documentType`: Extensible category: `REPORT`, `PHOTO`, `FORENSIC_REPORT`, `LAB_REPORT`, `INTERVIEW`, `COURT_FILING`, `EXHIBIT`, `BRIEFING_ATTACHMENT`, `OTHER`.
- `status`: Lifecycle: `DRAFT`, `FINAL`, `ARCHIVED`, `RESTRICTED`.
- `originalFilename`: Safe metadata string (never used directly as a filesystem path).
- `mimeType`: String (e.g. `application/pdf`, `text/plain`).
- `byteSize`: Integer (size in bytes).
- `objectKey`: Secure internal S3 path (`events/{eventId}/documents/{docId}/{versionId}_{filename}`).
- `sha256`: Hexadecimal SHA-256 cryptographic hash of object content.
- `uploadedByUserId`: UUID references `users.id`.
- `uploadedAt`: Timestamp.
- `textExtractionStatus`: `PENDING`, `COMPLETED`, `FAILED`, `NO_TEXT`.
- `extractedText`: Normalized text representation for full-text search and AI summarization.
- `createdAt`, `updatedAt`: Timestamps.

### `document_versions` Table
Preserves historical revisions without silent overwrites:
- `id`: UUIDv7 PK.
- `documentId`: UUID references `documents.id`.
- `versionNumber`: Integer (1, 2, 3...).
- `objectKey`: S3 path for this specific revision.
- `filename`: Original filename for this revision.
- `mimeType`: String.
- `byteSize`: Integer.
- `sha256`: SHA-256 hash of this revision.
- `uploadedByUserId`: UUID references `users.id`.
- `uploadedAt`: Timestamp.
- `changeNote`: Optional explanation of revision.

---

## 3. Asynchronous Text Extraction & Search

When a document is uploaded or versioned:
1. The API writes an outbox message `document.extract_text` containing `{ documentId, eventId, mimeType, objectKey }`.
2. The Worker polls the outbox and invokes `OutboxProcessorService`:
   - Text files (`text/plain`, `text/markdown`, `application/json`): Read UTF-8 string directly.
   - PDF files (`application/pdf`): Processed via `pdf-parse` in Worker process.
   - Non-extractable binaries (images, raw disk dumps): Set to `NO_TEXT`.
3. The normalized text is stored in `documents.extractedText` and indexed by the Document `SearchProjectionProvider`.
4. Fail-closed confidentiality is strictly preserved: search queries only project document content to users with valid `ResourceAccessService` access to the document's resource classification.
