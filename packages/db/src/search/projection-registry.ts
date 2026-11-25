import type { SearchDocument } from '@cyris/contracts';
import type { CyrisDb, SearchProjectionProvider } from './projection.interface.js';
import { EventSearchProjectionProvider } from './projections/event.projection.js';
import { UnitSearchProjectionProvider } from './projections/unit.projection.js';
import { RoleSearchProjectionProvider } from './projections/role.projection.js';
import {
  PersonSearchProjectionProvider,
  OrganisationSearchProjectionProvider,
  LocationSearchProjectionProvider,
  VehicleSearchProjectionProvider,
  DeviceSearchProjectionProvider,
  WeaponSearchProjectionProvider,
  LicenceSearchProjectionProvider,
} from './projections/registry.projection.js';
import {
  IncidentSearchProjectionProvider,
  CaseSearchProjectionProvider,
} from './projections/investigation.projection.js';
import { EvidenceSearchProjectionProvider } from './projections/evidence.projection.js';
import { LabAnalysisSearchProjectionProvider } from './projections/laboratory.projection.js';
import { DocumentSearchProjectionProvider } from './projections/document.projection.js';
import { ForensicAnalysisSearchProjectionProvider } from './projections/forensics.projection.js';
import { TechnicalIndicatorSearchProjectionProvider } from './projections/indicator.projection.js';
import { CourtCaseSearchProjectionProvider } from './projections/court.projection.js';
import { TaskSearchProjectionProvider } from './projections/task.projection.js';
import { MedicalSearchProjectionProvider } from './projections/medical.projection.js';

export class SearchProjectionRegistry {
  private readonly providers = new Map<string, SearchProjectionProvider>();

  constructor() {
    // Foundation providers
    this.register(new EventSearchProjectionProvider());
    this.register(new UnitSearchProjectionProvider());
    this.register(new RoleSearchProjectionProvider());

    // Domain providers
    this.register(new PersonSearchProjectionProvider());
    this.register(new OrganisationSearchProjectionProvider());
    this.register(new LocationSearchProjectionProvider());
    this.register(new VehicleSearchProjectionProvider());
    this.register(new DeviceSearchProjectionProvider());
    this.register(new WeaponSearchProjectionProvider());
    this.register(new LicenceSearchProjectionProvider());
    this.register(new IncidentSearchProjectionProvider());
    this.register(new CaseSearchProjectionProvider());
    this.register(new EvidenceSearchProjectionProvider());
    this.register(new LabAnalysisSearchProjectionProvider());

    // Phase 2 Step 3 providers
    this.register(new DocumentSearchProjectionProvider());
    this.register(new ForensicAnalysisSearchProjectionProvider());
    this.register(new TechnicalIndicatorSearchProjectionProvider());
    this.register(new CourtCaseSearchProjectionProvider());

    // Phase 2 Step 4 providers
    this.register(new TaskSearchProjectionProvider());
    this.register(new MedicalSearchProjectionProvider());
  }

  /**
   * Registers a search projection provider.
   * Future domain modules (STEP 6: Evidence, Case, Person, etc.) register their providers here.
   */
  register(provider: SearchProjectionProvider): void {
    for (const type of provider.getSupportedTypes()) {
      this.providers.set(type.toLowerCase(), provider);
    }
  }

  getProvider(type: string): SearchProjectionProvider | undefined {
    return this.providers.get(type.toLowerCase());
  }

  getAllProviders(): SearchProjectionProvider[] {
    return Array.from(new Set(this.providers.values()));
  }

  getSupportedTypes(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Builds a projected SearchDocument for an entity by type and ID.
   */
  async buildDocument(db: CyrisDb, type: string, id: string): Promise<SearchDocument | null> {
    const provider = this.getProvider(type);
    if (!provider) {
      return null;
    }
    return provider.buildDocument(db, type, id);
  }

  /**
   * Builds all documents across all registered providers, optionally filtered by eventId.
   */
  async listAllDocuments(db: CyrisDb, eventId?: string): Promise<SearchDocument[]> {
    const providers = this.getAllProviders();
    const allDocs: SearchDocument[] = [];

    for (const provider of providers) {
      for (const type of provider.getSupportedTypes()) {
        const docs = await provider.listAllDocuments(db, type, eventId);
        allDocs.push(...docs);
      }
    }

    return allDocs;
  }
}

// Global default registry instance
export const defaultSearchProjectionRegistry = new SearchProjectionRegistry();
