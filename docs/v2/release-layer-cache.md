# Release layer caching – controlled first rollout

The stable GitHub Release workflow stays serialized and still validates the exact source revision, restores an encrypted backup in isolated CI, builds amd64+arm64 images and records **digests**, not mutable tags, in the release manifest.

## Change
Three docker/build-push-action@v5 steps now use the GitHub Actions cache backend with distinct scopes (cyris-api-stable, cyris-worker-stable, cyris-web-stable) and mode=max. Only builds on the stable Release workflow update these caches. Cache-export outages use ignore-error=true: cache problems should not prevent publishing otherwise valid images.

The first release after this change may be cold and see **no speedup**. Subsequent releases can reuse costly apt, pnpm and compilation layers when inputs are unchanged; changed version strings across all package manifests can still invalidate the dependency step. QEMU arm64 builds remain potentially slow.

## Guardrails
- No reduction in supported platforms (linux/amd64,linux/arm64).
- No caching of runtime secrets (Dockerfiles use no secret build arguments); release tokens stay outside Docker build contexts.
- No alteration to the immutable image digest manifest or installer artifacts.
- No relaxation of stable release single-publisher lock, full CI or restore gate.
- This is a build cache optimization, not parallelism. Image build steps still run sequentially.

## Verify after publication
Compare actual GitHub Actions publish step durations over at least one cold and one warm release: API, Worker, Web build+push separately, total publish time, cache export failures and cache quota. If a large Next.js or arm64 build remains a bottleneck, consider a native multi-architecture build matrix before further changes. Keep issue #35 open until measurements confirm meaningful improvement and full release integrity.
