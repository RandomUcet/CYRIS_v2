import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq, and, inArray, or, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  events,
  eventMemberships,
  organizationalUnits,
  membershipUnitAssignments,
  unitCapabilities,
  scenarioDeliveries,
  scenarioBriefingReceipts,
  MembershipStatus,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import {
  UnitCapabilityKeys,
  type WorkspaceResolutionResponse,
  type WorkspaceNavSection,
  type WorkspaceNavItem,
} from '@cyris/contracts';
import type { AuthenticatedUser } from '../auth/session.service.js';

@Injectable()
export class WorkspaceResolverService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authzService: AuthorizationService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Resolves the operational workspace navigation and active capabilities for an authenticated user.
   *
   * Concept:
   * User -> Event Membership -> Unit assignments + Roles/Permissions + Unit capabilities
   * -> Available Workspace Navigation
   *
   * NOTE: Navigation reflects workspace relevance.
   * Backend authorization remains authoritative for all mutations and resource queries.
   */
  async resolveWorkspace(
    user: AuthenticatedUser,
    eventId: string
  ): Promise<WorkspaceResolutionResponse> {
    const [event] = await this.db
      .select({ id: events.id, name: events.name })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new NotFoundException(`Event '${eventId}' not found`);
    }

    // 0. Check Platform Admin Status
    const isPlatformAdmin = await this.authzService.authorize({
      user,
      permission: Permissions.PLATFORM_MANAGE,
    });

    // 1. Resolve Event Membership
    const [membership] = await this.db
      .select()
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.eventId, eventId),
          eq(eventMemberships.userId, user.id),
          eq(eventMemberships.status, MembershipStatus.ACTIVE)
        )
      )
      .limit(1);

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException('User is not an active member of this event');
    }

    // 2. Resolve Unit Assignments for this user in this event
    const unitAssignments = membership
      ? await this.db
          .select({
            unitId: organizationalUnits.id,
            unitName: organizationalUnits.name,
            unitSlug: organizationalUnits.slug,
          })
          .from(membershipUnitAssignments)
          .innerJoin(
            organizationalUnits,
            eq(membershipUnitAssignments.unitId, organizationalUnits.id)
          )
          .where(
            and(
              eq(membershipUnitAssignments.membershipId, membership.id),
              eq(organizationalUnits.eventId, eventId),
              isNull(organizationalUnits.archivedAt)
            )
          )
      : [];

    const unitIds = unitAssignments.map((u) => u.unitId);
    const unitNames = unitAssignments.map((u) => u.unitName);

    // 3. Resolve Capabilities from assigned units
    let capabilities: string[] = [];
    if (unitIds.length > 0) {
      const capRows = await this.db
        .select({
          capabilityKey: unitCapabilities.capabilityKey,
        })
        .from(unitCapabilities)
        .where(inArray(unitCapabilities.unitId, unitIds));

      capabilities = Array.from(new Set(capRows.map((c) => c.capabilityKey)));
    }

    // If platform admin, they have all capabilities for comprehensive exercise supervision
    if (isPlatformAdmin) {
      capabilities = Array.from(
        new Set([
          ...capabilities,
          UnitCapabilityKeys.INVESTIGATION,
          UnitCapabilityKeys.INCIDENT_OPERATIONS,
          UnitCapabilityKeys.EVIDENCE,
          UnitCapabilityKeys.CHEMICAL_ANALYSIS,
          UnitCapabilityKeys.DIGITAL_FORENSICS,
          UnitCapabilityKeys.TECHNICAL_OPERATIONS,
          UnitCapabilityKeys.CRISIS_MANAGEMENT,
          UnitCapabilityKeys.SCENARIO_CONTROL,
          UnitCapabilityKeys.MEDICAL_OPERATIONS,
          UnitCapabilityKeys.EVALUATION,
        ])
      );
    }

    // 4. Resolve Authorizations in event context
    const [
      canReadCases,
      canReadIncidents,
      canReadEvidence,
      canReadRegistry,
      canManageUnits,
      canReadAudit,
      canReadScenario,
      canReadBriefings,
      canReadForensics,
      canReadCourt,
      canReadDocuments,
      canReadTasks,
      canReadMedical,
      canReadEvaluation,
      canUseLab,
    ] = await Promise.all([
      this.authzService.authorize({
        user,
        permission: Permissions.CASE_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.INCIDENT_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.EVIDENCE_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.REGISTRY_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.UNIT_MANAGE,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.AUDIT_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.SCENARIO_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.BRIEFING_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.FORENSICS_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.COURT_READ,
        context: { eventId },
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.DOCUMENT_READ,
        context: { eventId },
      }),
      isPlatformAdmin || this.authzService.hasEventCapability({
        user, permission: Permissions.TASK_READ, eventId, resourceScopes: ['OWN', 'ASSIGNED'],
      }),
      isPlatformAdmin || this.authzService.hasEventCapability({
        user, permission: Permissions.MEDICAL_READ, eventId, resourceScopes: ['OWN', 'ASSIGNED'],
      }),
      this.authzService.authorize({
        user,
        permission: Permissions.EVALUATION_READ,
        context: { eventId },
      }),
      isPlatformAdmin || this.authzService.hasEventCapability({
        user, permission: Permissions.LAB_READ, eventId, resourceScopes: ['OWN', 'ASSIGNED'],
      }),
    ]);

    // Personal judicial roles must work even before a unit capability is assigned.
    const [canFileCharges, canIssueJudicialDecisions] = await Promise.all([
      this.authzService.authorize({ user, permission: Permissions.COURT_CHARGE_MANAGE, context: { eventId } }),
      this.authzService.authorize({ user, permission: Permissions.COURT_DECISION_CREATE, context: { eventId } }),
    ]);
    const canReadLegalRequests = await this.authzService.authorize({
      user, permission: Permissions.COURT_REQUEST_READ, context: { eventId },
    });
    const canManageMembers = await this.authzService.authorize({ user, permission: Permissions.MEMBERSHIP_MANAGE, context: { eventId } });
    const canManageRoles = await this.authzService.authorize({ user, permission: Permissions.ROLE_MANAGE, context: { eventId } });
    const canAdmin = isPlatformAdmin || canManageUnits || canReadAudit || canManageMembers || canManageRoles;

    // 5. Compose Navigation Structure (Deduplicated union)
    const seenHrefs = new Set<string>();
    const sections: WorkspaceNavSection[] = [];

    const addItem = (section: WorkspaceNavSection, item: WorkspaceNavItem) => {
      if (seenHrefs.has(item.href)) return;
      seenHrefs.add(item.href);
      section.items.push(item);
    };

    // Helper to fetch unread briefings count
    const getUnreadBriefingsCount = async (): Promise<number> => {
      if (!canReadBriefings) return 0;
      const audienceFilters = [
        eq(scenarioDeliveries.recipientUserId, user.id),
        and(isNull(scenarioDeliveries.recipientUserId), isNull(scenarioDeliveries.targetUnitId)),
      ];
      if (unitIds.length > 0) {
        audienceFilters.push(and(isNull(scenarioDeliveries.recipientUserId), inArray(scenarioDeliveries.targetUnitId, unitIds))!);
      }
      const [unreadRow] = await this.db
        .select({ count: sql<number>`count(DISTINCT ${scenarioDeliveries.releaseId})::int` })
        .from(scenarioDeliveries)
        .leftJoin(scenarioBriefingReceipts, and(
          eq(scenarioBriefingReceipts.releaseId, scenarioDeliveries.releaseId),
          eq(scenarioBriefingReceipts.userId, user.id),
        ))
        .where(and(
          eq(scenarioDeliveries.eventId, eventId),
          isNull(scenarioBriefingReceipts.readAt),
          // Platform administrators can inspect the exercise without joining a unit.
          isPlatformAdmin ? undefined : or(...audienceFilters),
        ));
      return Number(unreadRow?.count ?? 0);
    };

    const unreadBriefingsCount = await getUnreadBriefingsCount();

    // Check capability flags
    const hasScenarioControl =
      capabilities.includes(UnitCapabilityKeys.SCENARIO_CONTROL) || isPlatformAdmin;
    const hasChemical = capabilities.includes(UnitCapabilityKeys.CHEMICAL_ANALYSIS);
    const hasForensics =
      capabilities.includes(UnitCapabilityKeys.DIGITAL_FORENSICS) ||
      capabilities.includes(UnitCapabilityKeys.TECHNICAL_OPERATIONS);
    const hasProsecution = capabilities.includes(UnitCapabilityKeys.PROSECUTION);
    const hasDefence = capabilities.includes(UnitCapabilityKeys.DEFENCE);
    const hasCourt = capabilities.includes(UnitCapabilityKeys.COURT_PROCEEDINGS);
    const hasInvestigation = capabilities.includes(UnitCapabilityKeys.INVESTIGATION);
    const hasMedical = capabilities.includes(UnitCapabilityKeys.MEDICAL_OPERATIONS);
    const hasCrisisManagement = capabilities.includes(UnitCapabilityKeys.CRISIS_MANAGEMENT);
    const hasEvaluation = capabilities.includes(UnitCapabilityKeys.EVALUATION);
    const hasTactical = capabilities.includes(UnitCapabilityKeys.TACTICAL_OPERATIONS);
    const hasIncidentOps = capabilities.includes(UnitCapabilityKeys.INCIDENT_OPERATIONS);
    const hasEvidence =
      capabilities.includes(UnitCapabilityKeys.EVIDENCE) ||
      hasInvestigation ||
      hasChemical ||
      hasForensics ||
      hasProsecution ||
      hasDefence ||
      hasCourt ||
      isPlatformAdmin;

    // Dedicated capability profiles (to provide clean, tailored workspace compositions)
    const isDedicatedCommand = hasCrisisManagement && !isPlatformAdmin && !hasInvestigation;
    const isDedicatedMedical = hasMedical && !isPlatformAdmin && !hasInvestigation && !hasCrisisManagement;
    const isDedicatedEvaluation = hasEvaluation && !isPlatformAdmin && !hasInvestigation && !hasCrisisManagement && !hasMedical;
    const isDedicatedTactical = hasTactical && !isPlatformAdmin && !hasInvestigation && !hasCrisisManagement && !hasMedical && !hasEvaluation;

    if (isDedicatedCommand) {
      // COMMAND WORKSPACE: Operational Picture, Incidents, Tasking, Briefings, Timeline
      const commandSection: WorkspaceNavSection = {
        id: 'command-section',
        title: 'Command',
        items: [],
      };
      addItem(commandSection, {
        id: 'nav-command-picture',
        label: 'Operational Picture',
        href: `/events/${eventId}/command`,
        iconKey: 'radio',
      });
      if (canReadIncidents) {
        addItem(commandSection, {
          id: 'nav-command-incidents',
          label: 'Incidents',
          href: `/events/${eventId}/incidents`,
          iconKey: 'alert-octagon',
        });
      }
      if (canReadTasks) {
        addItem(commandSection, {
          id: 'nav-command-tasking',
          label: 'Tasking',
          href: `/events/${eventId}/tasks`,
          iconKey: 'check-square',
        });
      }
      if (canReadBriefings) {
        addItem(commandSection, {
          id: 'nav-command-briefings',
          label: 'Briefings',
          href: `/events/${eventId}/briefings`,
          iconKey: 'mail',
          badge: unreadBriefingsCount > 0 ? String(unreadBriefingsCount) : undefined,
        });
      }
      addItem(commandSection, {
        id: 'nav-command-timeline',
        label: 'Timeline',
        href: `/events/${eventId}/timeline`,
        iconKey: 'clock',
      });
      if (canReadDocuments) {
        addItem(commandSection, {
          id: 'nav-command-documents',
          label: 'Documents',
          href: `/events/${eventId}/documents`,
          iconKey: 'file-text',
        });
      }
      sections.push(commandSection);
    } else if (isDedicatedMedical) {
      // MEDICAL WORKSPACE: Active Cases, Triage, Transfers; Evidence; Operations (Tasks, Briefings, Timeline)
      if (canReadMedical) {
        const medicalSection: WorkspaceNavSection = {
          id: 'medical-section',
          title: 'Medical',
          items: [],
        };
        addItem(medicalSection, {
          id: 'nav-medical-active',
          label: 'Active Cases',
          href: `/events/${eventId}/medical`,
          iconKey: 'heart',
        });
        addItem(medicalSection, {
          id: 'nav-medical-triage',
          label: 'Triage',
          href: `/events/${eventId}/medical?view=triage`,
          iconKey: 'tag',
        });
        addItem(medicalSection, {
          id: 'nav-medical-transfers',
          label: 'Transfers',
          href: `/events/${eventId}/medical?view=transfers`,
          iconKey: 'truck',
        });
        sections.push(medicalSection);
      }

      if (hasEvidence && canReadEvidence) {
        const evidenceSection: WorkspaceNavSection = {
          id: 'evidence-section',
          title: 'Evidence',
          items: [],
        };
        addItem(evidenceSection, {
          id: 'nav-evidence',
          label: 'Evidence',
          href: `/events/${eventId}/evidence`,
          iconKey: 'folder',
        });
        sections.push(evidenceSection);
      }

      const opsSection: WorkspaceNavSection = {
        id: 'operations-section',
        title: 'Operations',
        items: [],
      };
      if (canReadTasks) {
        addItem(opsSection, {
          id: 'nav-ops-tasks',
          label: 'Tasks',
          href: `/events/${eventId}/tasks`,
          iconKey: 'check-square',
        });
      }
      if (canReadBriefings) {
        addItem(opsSection, {
          id: 'nav-ops-briefings',
          label: 'Briefings',
          href: `/events/${eventId}/briefings`,
          iconKey: 'mail',
          badge: unreadBriefingsCount > 0 ? String(unreadBriefingsCount) : undefined,
        });
      }
      addItem(opsSection, {
        id: 'nav-ops-timeline',
        label: 'Timeline',
        href: `/events/${eventId}/timeline`,
        iconKey: 'clock',
      });
      if (canReadDocuments) {
        addItem(opsSection, {
          id: 'nav-ops-documents',
          label: 'Documents',
          href: `/events/${eventId}/documents`,
          iconKey: 'file-text',
        });
      }
      sections.push(opsSection);
    } else if (isDedicatedEvaluation) {
      // EVALUATION WORKSPACE: Objectives, Live Observation, After Action
      if (canReadEvaluation) {
        const evalSection: WorkspaceNavSection = {
          id: 'evaluation-section',
          title: 'Evaluation',
          items: [],
        };
        addItem(evalSection, {
          id: 'nav-evaluation-objectives',
          label: 'Objectives',
          href: `/events/${eventId}/evaluation`,
          iconKey: 'target',
        });
        addItem(evalSection, {
          id: 'nav-evaluation-observations',
          label: 'Live Observation',
          href: `/events/${eventId}/evaluation/observations`,
          iconKey: 'eye',
        });
        addItem(evalSection, {
          id: 'nav-evaluation-after-action',
          label: 'After Action',
          href: `/events/${eventId}/evaluation/after-action`,
          iconKey: 'award',
        });
        sections.push(evalSection);
      }
      if (canReadDocuments) {
        const docSection: WorkspaceNavSection = {
          id: 'docs-section',
          title: 'Documents',
          items: [],
        };
        addItem(docSection, {
          id: 'nav-eval-documents',
          label: 'Documents',
          href: `/events/${eventId}/documents`,
          iconKey: 'file-text',
        });
        sections.push(docSection);
      }
    } else if (isDedicatedTactical) {
      // TACTICAL WORKSPACE: Tasks, Incidents, Evidence, Briefings, Timeline
      const tacticalSection: WorkspaceNavSection = {
        id: 'operations-section',
        title: 'Operations',
        items: [],
      };
      if (canReadTasks) {
        addItem(tacticalSection, {
          id: 'nav-tactical-tasks',
          label: 'Tasks',
          href: `/events/${eventId}/tasks`,
          iconKey: 'check-square',
        });
      }
      if (canReadIncidents) {
        addItem(tacticalSection, {
          id: 'nav-tactical-incidents',
          label: 'Incidents',
          href: `/events/${eventId}/incidents`,
          iconKey: 'alert-octagon',
        });
      }
      if (hasEvidence && canReadEvidence) {
        addItem(tacticalSection, {
          id: 'nav-tactical-evidence',
          label: 'Evidence',
          href: `/events/${eventId}/evidence`,
          iconKey: 'folder',
        });
      }
      if (canReadBriefings) {
        addItem(tacticalSection, {
          id: 'nav-tactical-briefings',
          label: 'Briefings',
          href: `/events/${eventId}/briefings`,
          iconKey: 'mail',
          badge: unreadBriefingsCount > 0 ? String(unreadBriefingsCount) : undefined,
        });
      }
      addItem(tacticalSection, {
        id: 'nav-tactical-timeline',
        label: 'Timeline',
        href: `/events/${eventId}/timeline`,
        iconKey: 'clock',
      });
      sections.push(tacticalSection);
    } else {
      // GENERAL / INVESTIGATIVE / SUPERVISOR WORKSPACE
      const overviewSection: WorkspaceNavSection = {
        id: 'overview-section',
        title: 'Overview',
        items: [],
      };
      addItem(overviewSection, {
        id: 'nav-overview',
        label: 'Overview',
        href: `/events/${eventId}/overview`,
        iconKey: 'activity',
      });
      addItem(overviewSection, {
        id: 'nav-timeline',
        label: 'Timeline',
        href: `/events/${eventId}/timeline`,
        iconKey: 'clock',
      });

      if (canReadBriefings) {
        addItem(overviewSection, {
          id: 'nav-briefings',
          label: 'Briefings',
          href: `/events/${eventId}/briefings`,
          iconKey: 'mail',
          badge: unreadBriefingsCount > 0 ? String(unreadBriefingsCount) : undefined,
        });
      }

      if (canReadTasks) {
        addItem(overviewSection, {
          id: 'nav-tasks',
          label: 'Tasks',
          href: `/events/${eventId}/tasks`,
          iconKey: 'check-square',
        });
      }

      if (canReadDocuments) {
        addItem(overviewSection, {
          id: 'nav-documents',
          label: 'Documents',
          href: `/events/${eventId}/documents`,
          iconKey: 'file-text',
        });
      }

      sections.push(overviewSection);

      // --- COMMAND SECTION ---
      if (hasCrisisManagement || isPlatformAdmin) {
        const commandSection: WorkspaceNavSection = {
          id: 'command-section',
          title: 'Command',
          items: [],
        };
        addItem(commandSection, {
          id: 'nav-command-picture',
          label: 'Operational Picture',
          href: `/events/${eventId}/command`,
          iconKey: 'radio',
        });
        sections.push(commandSection);
      }

      // --- SCENARIO CONTROL SECTION ---
      if (hasScenarioControl && canReadScenario) {
        const scenarioSection: WorkspaceNavSection = {
          id: 'scenario-section',
          title: 'Scenario',
          items: [],
        };
        addItem(scenarioSection, {
          id: 'nav-scenario-control',
          label: 'Control',
          href: `/events/${eventId}/scenario/control`,
          iconKey: 'sliders',
        });
        if (isPlatformAdmin || capabilities.includes(UnitCapabilityKeys.SCENARIO_CONTROL)) {
          addItem(scenarioSection, {
            id: 'nav-scenario-data',
            label: 'Scenario Data',
            href: `/events/${eventId}/scenario-data`,
            iconKey: 'database',
          });
        }
        sections.push(scenarioSection);
      }

      // --- SPECIALIST CHEMICAL ANALYSIS ---
      if (canUseLab) {
        const analysisSection: WorkspaceNavSection = {
          id: 'analysis-section',
          title: 'Analysis',
          items: [],
        };
        addItem(analysisSection, {
          id: 'nav-lab-queue',
          label: 'Work Queue',
          href: `/events/${eventId}/lab`,
          iconKey: 'flask',
        });
        sections.push(analysisSection);
      }

      // --- FORENSICS / TECHNICAL OPERATIONS ---
      if ((hasForensics || isPlatformAdmin) && canReadForensics) {
        const forensicsSection: WorkspaceNavSection = {
          id: 'forensics-section',
          title: 'Forensics / Technical',
          items: [],
        };
        addItem(forensicsSection, {
          id: 'nav-forensics-queue',
          label: 'Work Queue',
          href: `/events/${eventId}/forensics`,
          iconKey: 'cpu',
        });
        addItem(forensicsSection, {
          id: 'nav-forensics-analyses',
          label: 'Analyses',
          href: `/events/${eventId}/forensics`,
          iconKey: 'activity',
        });
        addItem(forensicsSection, {
          id: 'nav-forensics-indicators',
          label: 'Indicators',
          href: `/events/${eventId}/forensics/indicators`,
          iconKey: 'hash',
        });
        sections.push(forensicsSection);
      }

      // --- MEDICAL RESPONSE SECTION ---
      if ((hasMedical || isPlatformAdmin) && canReadMedical) {
        const medicalSection: WorkspaceNavSection = {
          id: 'medical-section',
          title: 'Medical',
          items: [],
        };
        addItem(medicalSection, {
          id: 'nav-medical-active',
          label: 'Active Cases',
          href: `/events/${eventId}/medical`,
          iconKey: 'heart',
        });
        addItem(medicalSection, {
          id: 'nav-medical-triage',
          label: 'Triage',
          href: `/events/${eventId}/medical?view=triage`,
          iconKey: 'tag',
        });
        addItem(medicalSection, {
          id: 'nav-medical-transfers',
          label: 'Transfers',
          href: `/events/${eventId}/medical?view=transfers`,
          iconKey: 'truck',
        });
        sections.push(medicalSection);
      }

      // --- PROSECUTION & DEFENCE LEGAL SECTIONS ---
      if ((hasProsecution || canFileCharges || isPlatformAdmin) && canReadCourt) {
        const legalSection: WorkspaceNavSection = {
          id: 'prosecution-section',
          title: 'Legal',
          items: [],
        };
        if (canReadCases) {
          addItem(legalSection, {
            id: 'nav-prosecution-prep',
            label: 'Case Preparation',
            href: `/events/${eventId}/cases`,
            iconKey: 'briefcase',
          });
        }
        addItem(legalSection, {
          id: 'nav-prosecution-court-cases',
          label: 'Court Cases',
          href: `/events/${eventId}/court`,
          iconKey: 'award',
        });
        addItem(legalSection, {
          id: 'nav-prosecution-filings',
          label: 'Filings',
          href: `/events/${eventId}/court/filings`,
          iconKey: 'file-text',
        });
        sections.push(legalSection);
      } else if (hasDefence && canReadCourt) {
        const defenceSection: WorkspaceNavSection = {
          id: 'defence-section',
          title: 'Legal',
          items: [],
        };
        addItem(defenceSection, {
          id: 'nav-defence-cases',
          label: 'Assigned Cases',
          href: `/events/${eventId}/court`,
          iconKey: 'briefcase',
        });
        if (canReadEvidence) {
          addItem(defenceSection, {
            id: 'nav-defence-evidence',
            label: 'Evidence Access',
            href: `/events/${eventId}/evidence`,
            iconKey: 'folder',
          });
        }
        addItem(defenceSection, {
          id: 'nav-defence-filings',
          label: 'Filings',
          href: `/events/${eventId}/court/filings`,
          iconKey: 'file-text',
        });
        sections.push(defenceSection);
      }

      // --- COURT / JUDICIAL PROCEEDINGS SECTION ---
      if ((hasCourt || canIssueJudicialDecisions || isPlatformAdmin) && canReadCourt) {
        const courtSection: WorkspaceNavSection = {
          id: 'court-section',
          title: 'Court',
          items: [],
        };
        addItem(courtSection, {
          id: 'nav-court-docket',
          label: 'Docket',
          href: `/events/${eventId}/court`,
          iconKey: 'book-open',
        });
        addItem(courtSection, {
          id: 'nav-court-hearings',
          label: 'Hearings',
          href: `/events/${eventId}/court/hearings`,
          iconKey: 'clock',
        });
        addItem(courtSection, {
          id: 'nav-court-exhibits',
          label: 'Exhibits',
          href: `/events/${eventId}/court/exhibits`,
          iconKey: 'folder',
        });
        addItem(courtSection, {
          id: 'nav-court-decisions',
          label: 'Decisions',
          href: `/events/${eventId}/court/decisions`,
          iconKey: 'check-circle',
        });
        sections.push(courtSection);
      }

      // --- INVESTIGATION SECTION ---
      if (hasInvestigation || isPlatformAdmin) {
        const investigationSection: WorkspaceNavSection = {
          id: 'investigation-section',
          title: 'Investigation',
          items: [],
        };
        if (canReadCases) {
          addItem(investigationSection, {
            id: 'nav-cases',
            label: 'Cases',
            href: `/events/${eventId}/cases`,
            iconKey: 'briefcase',
          });
        }
        if (canReadIncidents) {
          addItem(investigationSection, {
            id: 'nav-incidents',
            label: 'Incidents',
            href: `/events/${eventId}/incidents`,
            iconKey: 'alert-octagon',
          });
        }
        if (canReadRegistry) {
          addItem(investigationSection, {
            id: 'nav-registry',
            label: 'Registry',
            href: `/events/${eventId}/registry`,
            iconKey: 'building',
          });
          addItem(investigationSection, {
            id: 'nav-relationships',
            label: 'Relationships',
            href: `/events/${eventId}/relationships`,
            iconKey: 'share',
          });
        }
        if (investigationSection.items.length > 0) {
          sections.push(investigationSection);
        }
      }

      // --- EVALUATION SECTION (EXERCISE CONTROL / OBSERVER) ---
      if ((hasEvaluation || isPlatformAdmin) && canReadEvaluation) {
        const evalSection: WorkspaceNavSection = {
          id: 'evaluation-section',
          title: 'Evaluation',
          items: [],
        };
        addItem(evalSection, {
          id: 'nav-evaluation-objectives',
          label: 'Objectives',
          href: `/events/${eventId}/evaluation`,
          iconKey: 'target',
        });
        addItem(evalSection, {
          id: 'nav-evaluation-observations',
          label: 'Live Observation',
          href: `/events/${eventId}/evaluation/observations`,
          iconKey: 'eye',
        });
        addItem(evalSection, {
          id: 'nav-evaluation-after-action',
          label: 'After Action',
          href: `/events/${eventId}/evaluation/after-action`,
          iconKey: 'award',
        });
        sections.push(evalSection);
      }

      // --- EVIDENCE SECTION ---
      if (hasEvidence && canReadEvidence) {
        const evidenceSection: WorkspaceNavSection = {
          id: 'evidence-section',
          title: 'Evidence',
          items: [],
        };
        addItem(evidenceSection, {
          id: 'nav-evidence',
          label: 'Evidence',
          href: `/events/${eventId}/evidence`,
          iconKey: 'folder',
        });
        sections.push(evidenceSection);
      }
    }

    // JSOC visibility is derived from both capability and permission, not just a team name.
    // EXCON can also inspect and generate the exercise-only telemetry.
    const canGenerateJsoc=await this.authzService.authorize({
      user,permission:Permissions.SCENARIO_MANAGE,context:{eventId},
    });
    if(canGenerateJsoc||(capabilities.includes(UnitCapabilityKeys.TECHNICAL_OPERATIONS)&&canReadForensics)){
      sections.push({
        id:'jsoc-section',title:'Technical Simulation',
        items:[{id:'nav-jsoc-logs',label:'JSOC simulated logs',href:`/events/${eventId}/jsoc`,iconKey:'cpu'}],
      });
    }

    // --- ADMINISTRATION SECTION ---
    if (canAdmin) {
      const adminSection: WorkspaceNavSection = {
        id: 'admin-section',
        title: 'Administration',
        items: [],
      };
      addItem(adminSection, {
        id: 'nav-admin-events',
        label: 'Events',
        href: '/admin/events',
        iconKey: 'calendar',
      });
      if (canManageUnits) addItem(adminSection, {
        id: 'nav-admin-units',
        label: 'Units & Teams',
        href: '/admin/units',
        iconKey: 'building',
      });
      if (canManageMembers) addItem(adminSection, {
        id: 'nav-admin-users',
        label: 'Users & Access',
        href: '/admin/users',
        iconKey: 'users',
      });
      if (canManageRoles) addItem(adminSection, {
        id: 'nav-admin-roles',
        label: 'Roles & Perms',
        href: '/admin/roles',
        iconKey: 'key',
      });
      if (canReadAudit) addItem(adminSection, {
        id: 'nav-admin-audit',
        label: 'Audit Log',
        href: '/admin/audit',
        iconKey: 'shield',
      });
      if (isPlatformAdmin) addItem(adminSection, {
        id: 'nav-admin-integrations',
        label: 'Integrations & AI',
        href: '/admin/settings/integrations/ai',
        iconKey: 'sliders',
      });
      sections.push(adminSection);
    }

    // Legal requests are also relevant to specialist liaisons without the
    // Prosecution/Court unit capability. Permission remains server-authoritative.
    if (canReadLegalRequests) {
      const legalInbox: WorkspaceNavSection = {
        id: 'legal-request-inbox', title: 'Právní spolupráce', items: [],
      };
      addItem(legalInbox, {
        id: 'nav-legal-requests', label: 'Žádosti o důkazy a posudky',
        href: '/events/' + eventId + '/legal-requests', iconKey: 'file-text',
      });
      sections.push(legalInbox);
    }

    return {
      eventId: event.id,
      eventName: event.name,
      unitIds,
      unitNames,
      capabilities,
      sections,
    };
  }
}
