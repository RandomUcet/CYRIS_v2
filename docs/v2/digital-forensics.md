# CYRIS v2 — Digital Forensics & Technical Operations

## 1. Architectural Separation

CYRIS v2 explicitly decouples Digital Forensics and Technical Operations from Chemical Laboratory Analysis:
- **Chemical Laboratory**: Handles biological, chemical, spectroscopic, and toxicological physical evidence.
- **Digital Forensics / Technical Operations**: Handles disk imaging, memory triage, network packet analysis, mobile device extraction, reverse engineering, and technical indicators (IOCs).
- **JSOC / Technical Operations Compatibility**: A unit can be configured dynamically with `digital_forensics`, `technical_operations`, `incident_operations`, and `evidence` capabilities without hardcoding JSOC as a special backend role or single analysis type.

---

## 2. Forensic Analysis Workflow

### Analysis Lifecycle
1. `REQUESTED`: Submitted by investigators or operational units.
2. `ACCEPTED`: Acknowledged by the digital forensics group/examiner.
3. `IN_PROGRESS`: Acquisition, extraction, and reverse engineering underway.
4. `COMPLETED`: Technical methodology and conclusion finalized.
5. `APPROVED`: Formal examiner opinion validated and signed off.
6. `REJECTED` / `CANCELLED`: Terminal states if requests are defective or revoked.

### Concurrency-Safe Identifiers
Analyses receive identifiers in the format `FOR-0001` allocated by the central concurrency-safe allocator.

---

## 3. Structured Artifacts & Technical Indicators

### Forensic Findings (`forensic_findings`)
Granular technical findings recorded by examiners:
- `findingType`: `FILE_SYSTEM`, `MEMORY_ARTIFACT`, `NETWORK_CONNECTION`, `PERSISTENCE_MECHANISM`, `USER_ACTIVITY`, `MALWARE_PAYLOAD`, `CONFIGURATION`, `OTHER`.
- `verificationState`: `UNVERIFIED`, `SUSPECTED`, `VERIFIED`, `REFUTED`.
- `confidence`: Integer 0-100%.

### Technical Indicators (`technical_indicators`)
Observable technical indicators with normalized value matching for global search:
- `indicatorType`: `IP`, `DOMAIN`, `HOSTNAME`, `EMAIL`, `USERNAME`, `FILE_HASH`, `URL`, `OTHER`.
- Exact indicator matches (e.g. `10.42.18.7`, `evil.example`, SHA-256 hashes) are projected with maximum search boost into the unified search index.

### Forensic Acquisitions (`forensic_acquisitions`)
Tracks acquisition metadata without loading multi-hundred-gigabyte forensic images directly through web forms:
- `acquisitionType`: `PHYSICAL`, `LOGICAL`, `TARGETED`, `MEMORY`.
- `hashAlgorithm`: `SHA256`, `SHA1`, `MD5`.
- `sourceHash`, `imageHash`: Verification hashes.
- `storageReference`: Pointer to local/secure network storage (e.g., `SAN-VOL1:/forensic_images/E-0001_raw.dd`).
- `toolName`, `toolVersion`: Acquisition tool provenance.
