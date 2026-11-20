import { randomUUID } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import { previewTeams, previewTeamEmail } from '@cyris/contracts';
import {
  type CyrisDatabase, eq, events, eventMemberships, membershipUnitAssignments,
  previewTeamAccounts, evidence, operationalTasks, outboxEvents, resources, roleAssignments, rolePermissions, roles, sql, userIdentities, userPreferences, users,
} from '@cyris/db';
import { Permissions as P } from '@cyris/shared';
import { bootstrapSystem, crisisCommandPermissions } from './system-bootstrap.js';

const eventSlug = 'cyris-team-preview';
type TeamLogin = typeof previewTeams[number]['login'];

const profiles = {
  bps: {
    rights: [P.INCIDENT_READ, P.CASE_READ, P.CASE_CREATE, P.EVIDENCE_READ, P.COURT_READ, P.COURT_FILING_READ],
    title: 'Založit cvičný spis',
    instruction: 'Založte spis k modelovému nálezu zavazadla na stanovišti A. Do výsledku úkolu uveďte číslo spisu.',
  },
  levandule: {
    rights: [P.EVIDENCE_READ],
    title: 'Převzít modelový vzorek oleje',
    instruction: 'Porovnejte štítek L-01 s předávacím listem L-01. Do výsledku zapište, zda označení souhlasí.',
  },
  kyber: {
    rights: [P.FORENSICS_READ, P.FORENSICS_REQUEST, P.INDICATOR_READ, P.EVIDENCE_READ],
    title: 'Sestavit časovou osu záznamu',
    instruction: 'Terminál ve cvičném výpisu hlásí výpadek v 09:12 a obnovení v 09:19. Zapište délku výpadku a označte zdroj údaje.',
  },
  zpravodajci: {
    rights: [P.INTELLIGENCE_USE, P.INCIDENT_READ, P.DOCUMENT_READ],
    title: 'Ověřit dvě terénní hlášení',
    instruction: 'Hlídka A uvádí odjezd v 09:20, hlídka B v 09:25. Sepište, co oba zdroje potvrzují a kterou informaci potřebujete ověřit.',
  },
  stab: {
    rights: [],
    title: 'Připravit hlášení pro poradu štábu',
    instruction: 'Cvičná hlídka hlásí uzavření vstupu A. Do výsledku uveďte dopad, tým odpovědný za ověření a čas další aktualizace.',
  },
  chemie: {
    rights: [P.EVIDENCE_READ, P.EVIDENCE_CREATE],
    title: 'Zkontrolovat předání vzorku CH-02',
    instruction: 'Na cvičné předávce CH-02 je čas 10:05 a chybí podpis příjemce. Zapište nesrovnalost a komu ji vracíte k doplnění.',
  },
  zdravotnici: {
    rights: [P.MEDICAL_READ, P.MEDICAL_CREATE, P.MEDICAL_OBSERVE],
    title: 'Připravit předání cvičného pacienta',
    instruction: 'Pro figuranta Z-03 připravte předání ze stanoviště B na shromaždiště. Zapište identifikátor, výchozí místo a místo předání.',
  },
} satisfies Record<TeamLogin, { rights: string[]; title: string; instruction: string }>;

export interface PreviewCredentials {
  eventId: string;
  accounts: Record<string, { id: string; password: string }>;
}

export async function provisionTeamPreview(db: Pick<CyrisDatabase, 'transaction'>, { eventId, accounts }: PreviewCredentials) {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cyris-team-preview'))`);
    const [existing] = await tx.select().from(events).where(eq(events.slug, eventSlug));
    if (existing) {
      if (existing.id !== eventId) throw new Error('Toto cvičení už má vlastní přístupové údaje. Použijte jeho původní .cyris-preview/teams.json.');
      return; // Keep participant progress and organizer edits on subsequent starts.
    }
    await tx.insert(events).values({ id: eventId, slug: eventSlug, name: 'CzechCybertron · Zkouška týmů', status: 'ACTIVE', defaultLocale: 'cs', defaultTimezone: 'Europe/Prague' });
    await bootstrapSystem(tx, { eventId });
    for (const team of previewTeams) {
      const account = accounts[team.login]!;
      const email = previewTeamEmail(team.login);
      const profile = profiles[team.login];
      const [unit] = await tx.execute(sql`SELECT id FROM organizational_units WHERE event_id = ${eventId} AND slug = ${team.slug}`);
      const unitId = unit!.id as string;
      const userId = account.id;
      // A conflicting email fails the entire transaction. Existing users are never enrolled.
      await tx.insert(users).values({ id: userId, email, displayName: team.name, status: 'ACTIVE' });
      await tx.insert(userIdentities).values({ userId, providerType: 'LOCAL', providerSubject: email, passwordHash: await hash(account.password, { type: argon2id }) });
      await tx.insert(previewTeamAccounts).values({ userId });
      await tx.insert(userPreferences).values({ userId, locale: 'cs', timezone: 'Europe/Prague' });
      const membershipId = randomUUID();
      await tx.insert(eventMemberships).values({ id: membershipId, eventId, userId, status: 'ACTIVE' });
      await tx.insert(membershipUnitAssignments).values({ membershipId, unitId });
      const roleId = randomUUID();
      await tx.insert(roles).values({ id: roleId, eventId, slug: team.slug, name: team.name });
      const grants = team.login === 'stab' ? crisisCommandPermissions : profile.rights.map(key => ({ key, scope: 'EVENT' }));
      await tx.insert(rolePermissions).values(grants.map(({key, scope}) => ({ roleId, permissionKey: key, scope })));
      await tx.insert(roleAssignments).values({ roleId, membershipId });
      const roleSlugs = team.login === 'stab' ? [] : ['team-member'];
      if (team.login === 'levandule' || team.login === 'chemie') roleSlugs.push('laboratory-worker');
      if (team.login === 'bps') roleSlugs.push('laboratory-requester');
      for (const slug of roleSlugs) {
        const [role] = await tx.execute(sql`SELECT id FROM roles WHERE event_id = ${eventId} AND slug = ${slug}`);
        await tx.insert(roleAssignments).values({ roleId: role!.id as string, membershipId });
      }
      if (team.login === 'bps') {
        const id = randomUUID();
        await tx.insert(resources).values({ id, eventId, resourceType: 'evidence', visibility: 'EVENT', owningUnitId: unitId, ownerUserId: userId });
        await tx.insert(evidence).values({ id, evidenceNumber: 'CV-L01', title: 'Modelový vzorek levandulového oleje L-01', evidenceType: 'SAMPLE', description: 'Zkušební vzorek pro předání mezi týmy.', currentHolderType: 'UNIT', currentHolderId: unitId, owningUnitId: unitId });
        await tx.insert(outboxEvents).values({ eventType: 'search.upsert', payload: { type: 'evidence', id } });
      }
      const taskId = randomUUID();
      await tx.insert(resources).values({ id: taskId, eventId, resourceType: 'operational_task', visibility: 'UNIT', owningUnitId: unitId, ownerUserId: userId });
      await tx.insert(operationalTasks).values({ id: taskId, eventId, taskNumber: `CV-${team.login.toUpperCase()}`, title: profile.title, description: profile.instruction, owningUnitId: unitId, assignedUnitId: unitId, assignedUserId: userId, createdByUserId: userId });
    }
  });
}
