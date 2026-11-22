# CYRIS legal/judicial collaboration — implementation and acceptance

**Branch:** `feature/legal-workspace-reports-20261122` (PR #20), based on v2.2.0. No production deployment occurs from this branch.

## Assigning judicial roles

1. Open Admin → Events → select the exercise → **Teams** → **Doplnit týmy a role**. This adds missing templates without overwriting assignments or customized team names.
2. In Admin → Roles/Participants, assign a real user to the event and the relevant role; the seed process must **not** grant permissions automatically.
3. Available roles: **Státní zástupce** (prosecution: charges, filings, evidence/report requests, not verdicts), **Soudce / Soudkyně** (judicial hearings, exhibits, verdicts, not prosecution charges), **Znalec / spojka** (responses to formal evidence/document/report requests, no court decisions).
4. For targeted requests, assign the responder to the appropriate recipient organizational unit (such as the judicial panel, expert laboratory, or forensic team).

## Legal request workflow

- In a court case, open **Žádosti o podklady**; create EVIDENCE, DOCUMENT, FORENSIC_REPORT, LAB_REPORT, MEDICAL_REPORT, EXPERT_OPINION or OTHER request with an optional recipient team and deadline.
- Authorized recipients can review requests in **Právní spolupráce / Žádosti o důkazy a posudky**, filter and open the case, then reply with a reason and optionally link an existing document or evidence record.
- Revision checks prevent stale concurrent responses. Every accepted create/response is recorded with the user/event in audit.
- Server verifies that linked records belong to the same exercise and that the responder has rights to view that resource. Requests are not a mechanism for bypassing protected medical/evidence ACLs.
- The legal system is designed **only for simulation**. It is not an actual filing system, e-delivery service or court portal.

## Printing and reports

- Authenticated **Court case**, **Medical encounter**, **Laboratory analysis** and **Forensic analysis** pages expose printable read-only reports. Browser print also offers Save as PDF.
- Printing is based on already authorized API data; a print URL does not grant additional read permissions. Print sheets are visibly marked **SIMULACE / EXERCISE ONLY**.
- Platform administrators can use **Admin → Events → Report** to inspect the aggregate after-action report: membership counts, case/medical/task/support/legal-request status and audit categories. Print it or download structured JSON.
- Aggregates do not include individual patient names, clinical notes or secret evidence contents. A complete document archive / centralized PDF packaging of *every* resource type is **not yet complete**.

## Event cleanup

- Admin after-action page offers **purge impact preview** profiles for partial exercise-record removal vs full event removal, listing known count categories and explicit blockers.
- **Neither partial nor full DELETE is enabled**. Before allowing irreversible cleanup, see issue #21: verified encrypted off-host backup, dry-run dependency graph, immutable audit retention, DB/file/index/worker consistency, explicit double confirmation and staging restoration test.

## Required release checks

1. Exact commit CI succeeds (unit, typecheck, DB schema migration and isolated PostgreSQL tests, encrypted backup recovery).
2. Multi-role UI acceptance (prosecutor cannot issue decisions, judge cannot file charges, liaison can respond only where authorized; view-as read-only).
3. Cross-event and restrictive evidence permissions; print URLs cannot bypass API RBAC.
4. Responsive keyboard checks on desktop, tablet and mobile for legal request UI and A4 print CSS.
5. Admin after-action report reads only selected event and purge has no mutations.

Remaining security/design tasks: [issue #19](https://github.com/RandomUcet/CYRIS_v2/issues/19); [safe purge #21](https://github.com/RandomUcet/CYRIS_v2/issues/21).
