CREATE TABLE preview_team_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  generation uuid NOT NULL DEFAULT gen_random_uuid()
);
--> statement-breakpoint
INSERT INTO preview_team_accounts (user_id)
SELECT DISTINCT u.id FROM users u
JOIN user_identities i ON i.user_id = u.id AND i.provider_type = 'LOCAL' AND i.provider_subject = u.email
JOIN event_memberships m ON m.user_id = u.id
JOIN events e ON e.id = m.event_id AND e.slug = 'cyris-team-preview'
WHERE u.email IN ('bps@teams.cyris.test','levandule@teams.cyris.test','kyber@teams.cyris.test',
  'zpravodajci@teams.cyris.test','stab@teams.cyris.test','chemie@teams.cyris.test','zdravotnici@teams.cyris.test');
--> statement-breakpoint
ALTER TABLE command_defcon_states
  ADD COLUMN public_message text,
  ADD COLUMN public_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN public_updated_at timestamptz;
--> statement-breakpoint
UPDATE command_defcon_states SET public_revision = revision, public_updated_at = updated_at;
--> statement-breakpoint
-- Provide the named role to organizers of existing exercises using the canonical crisis team.
-- Assignments remain explicit, as with every other live exercise role.
WITH command_roles AS (
  INSERT INTO roles (id, event_id, name, slug, description)
  SELECT gen_random_uuid(), e.id, 'Krizový štáb', 'exercise-command', 'Řízení připravenosti, úkolů a situačních zpráv cvičení'
  FROM events e
  WHERE EXISTS (SELECT 1 FROM organizational_units u WHERE u.event_id=e.id AND u.slug='juniorsky-krizovy-stab')
    AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.event_id=e.id AND r.slug='exercise-command')
  RETURNING id
)
INSERT INTO role_permissions (id, role_id, permission_key, scope)
SELECT gen_random_uuid(), r.id, p.key, p.scope FROM command_roles r CROSS JOIN (VALUES
  ('command.read','EVENT'), ('command.defcon.change','EVENT'), ('document.read','EVENT'), ('document.create','EVENT'),
  ('incident.read','EVENT'), ('task.create','EVENT'), ('task.assign','EVENT'), ('task.read','EVENT'),
  ('event.read','EVENT'), ('unit.read','EVENT'), ('timeline.read','EVENT'), ('briefing.read','EVENT'),
  ('briefing.acknowledge','EVENT'), ('task.work','ASSIGNED'), ('task.complete','ASSIGNED'), ('task.acknowledge','ASSIGNED')
) AS p(key,scope);
--> statement-breakpoint
-- Upgrade the generated command profile in the old preview without replacing accounts, tasks or custom roles.
INSERT INTO role_permissions (id, role_id, permission_key, scope)
SELECT gen_random_uuid(), r.id, p.key, p.scope
FROM roles r JOIN events e ON e.id = r.event_id
CROSS JOIN (VALUES ('command.defcon.change','EVENT'),('document.create','EVENT'),('task.create','EVENT'),
  ('task.assign','EVENT'),('task.read','EVENT'),('event.read','EVENT'),('unit.read','EVENT'),('timeline.read','EVENT'),
  ('briefing.read','EVENT'),('briefing.acknowledge','EVENT'),('task.work','ASSIGNED'),('task.complete','ASSIGNED'),
  ('task.acknowledge','ASSIGNED')) AS p(key,scope)
WHERE e.slug = 'cyris-team-preview' AND r.slug = 'juniorsky-krizovy-stab'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM role_assignments a USING roles r, event_memberships m, events e, users u, preview_team_accounts p
WHERE a.role_id=r.id AND a.membership_id=m.id AND r.event_id=m.event_id AND e.id=m.event_id
  AND e.slug='cyris-team-preview' AND r.slug='team-member' AND u.id=m.user_id AND p.user_id=u.id
  AND u.email='stab@teams.cyris.test' AND EXISTS (
    SELECT 1 FROM role_assignments b JOIN roles command ON b.role_id=command.id
    WHERE b.membership_id=m.id AND command.event_id=e.id AND command.slug='juniorsky-krizovy-stab'
  );
