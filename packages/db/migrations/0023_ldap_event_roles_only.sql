-- A directory can restore only the membership it deactivated. Existing inactive
-- memberships retain their suspension until an organizer explicitly reactivates them.
ALTER TABLE event_memberships ADD COLUMN ldap_deactivated_by uuid
  REFERENCES user_identities(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Previous versions permitted a directory rule to name a platform role. Revoke
-- only records tagged as grants of that exact LDAP identity by the old sync.
DELETE FROM role_assignments a
USING roles r, user_identities i,
  LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(i.metadata #> '{ldapGrants,roles}') = 'array'
      THEN i.metadata #> '{ldapGrants,roles}' ELSE '[]'::jsonb END
  ) g
WHERE i.provider_type = 'LDAP' AND i.metadata #>> '{ldapGrants,version}' = '1'
  AND r.id = a.role_id AND r.event_id IS NULL
  AND a.user_id = i.user_id AND a.membership_id IS NULL AND a.unit_id IS NULL
  AND g->>'id' = a.id::text AND g->>'roleId' = r.id::text
  AND g->>'membershipId' IS NULL AND g->>'unitId' IS NULL;
