ALTER TABLE integrations ADD COLUMN system_profile varchar(32),
  ADD CONSTRAINT integrations_system_profile_check CHECK (
    system_profile IS NULL OR
    (system_profile = 'DGX_SPARK' AND category = 'AI_PROVIDER' AND provider_type = 'OPENAI_COMPATIBLE')
  );
--> statement-breakpoint
CREATE UNIQUE INDEX integrations_system_profile_idx ON integrations (system_profile);
--> statement-breakpoint
-- Older concurrent writes could leave several rows enabled. Keep the provider the gateway used.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY updated_at DESC, id) AS priority
  FROM integrations WHERE category = 'AI_PROVIDER' AND enabled
)
UPDATE integrations SET enabled = false WHERE id IN (SELECT id FROM ranked WHERE priority > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX integrations_active_ai_idx ON integrations (category) WHERE category = 'AI_PROVIDER' AND enabled;
--> statement-breakpoint
-- Adopt the installed CYLAB runtime by its network destination. A matching display name on another
-- host is insufficient: credentials and historical runs must remain attached to their original host.
WITH profile AS (
  SELECT jsonb_build_object(
    'endpoint', 'http://10.15.69.2:8000/v1',
    'embeddingEndpoint', 'http://10.15.69.2:8001/v1',
    'chatModel', 'nvidia/Qwen3.8-27B-NVFP4',
    'embeddingModel', 'Qwen/Qwen3-Embedding-8B',
    'timeoutSeconds', 120, 'tlsVerify', true
  ) AS config
), legacy AS (
  SELECT i.id FROM integrations i CROSS JOIN profile p
  WHERE i.category = 'AI_PROVIDER' AND i.provider_type = 'OPENAI_COMPATIBLE'
    AND rtrim(i.config->>'endpoint', '/') = p.config->>'endpoint'
    AND (i.config->>'chatModel' = p.config->>'chatModel'
      OR lower(trim(i.name)) IN ('cyris dgx spark', 'nvidia dgx spark', 'dgx spark'))
  ORDER BY i.enabled DESC, i.updated_at DESC, i.id LIMIT 1
), adopted AS (
  UPDATE integrations i SET system_profile = 'DGX_SPARK', name = 'CYRIS DGX Spark',
    config = p.config, status = 'NOT_CONFIGURED', last_checked_at = NULL,
    last_error = NULL, updated_at = now()
  FROM profile p, legacy WHERE i.id = legacy.id RETURNING i.id
)
INSERT INTO integrations (id, name, category, provider_type, system_profile, enabled, status, config)
SELECT gen_random_uuid(), 'CYRIS DGX Spark', 'AI_PROVIDER', 'OPENAI_COMPATIBLE',
  'DGX_SPARK', false, 'NOT_CONFIGURED', p.config
FROM profile p WHERE NOT EXISTS (SELECT 1 FROM adopted);
