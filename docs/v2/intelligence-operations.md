# Intelligence & Operations — design and safety boundary

## Current increment
Organizer-only overview and two bounded Spark draft operations. Signal counts are observations, not causal explanations. No background LLM calls, automatic hints, or writes from generated content. Audit metadata uses existing ai_runs; raw prompt and completion are not stored by the gateway. Real inference performance is unverified.

## Next increments
1. Persist organizer-approved exercise blueprint, versioned and scoped per event; separate confidential answer key from participant data. Preview changes with dependencies, idempotency and explicit approval before applying.
2. Worker-based observer with persisted last activity, configurable grace windows aligned to scenario time, pause/hold awareness, durable deduplication and intervention cooldowns. Use deterministic measurements first; Spark explains selected observations, not continuous polling. Organizer approves suggested hint. No autonomous participant messaging until a separately reviewed policy and leak tests exist.
3. Participant assistant retrieves only authorized records; never receives organizer blueprint or answers. Treat prompts and documents as untrusted, cite records, no tools that mutate state without separate authorization.
4. Legal corpus: official Czech e-Sbírka source, exact provision/version/effective date, provenance and retrieval tests; distinguish legal research from binding judgment. No fabricated law and no sending confidential records outside approved local provider. Index only verified texts under applicable reuse terms.
5. Spark: distributed bounded concurrency exists; instrument queue pressure and duration, define interactive/background priority and tune with real hardware, not speculative concurrency increases.
6. Resilience: Compose restart policies already exist. Add a host-side health/recovery design with bounded backoff, maintenance lock, dependency checks and tested restore; never auto-restore an old backup or restart during migrations. External Spark host needs its own recovery policy.
7. Relations: component grouping, focused graph and readable overview; test large fictional dataset and measure browser performance.

Release 2.4.22 remains a draft until a substantial tested scope is ready. No new public release for this increment.
