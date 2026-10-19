# What’s Coming Carlsbad — data-source expansion discussion note

Prepared October 17, 2026 for continuation in a separate ChatGPT discussion.

## Implementation update — October 19, 2026

The first production vertical slice is now implemented. The database stores reviewed planning-document metadata and page-cited structured claims, while keeping verbatim supporting excerpts out of the anonymous public surface. The Salk Avenue Apartments Notice of Determination is the first reviewed document: its official CEQAnet PDF is checksummed, linked to the existing project, and represented by seven claims from page 2. The public project card exposes the decision, date, location, unit counts, CEQA document, and mitigation requirement with direct links to the PDF and CEQAnet record.

Direct automated requests to the city planning pages returned HTTP 403 during the source proof, so the build does not include a brittle city-page scraper. CEQAnet attachment retrieval is working. The next increment should add a bounded manual/source-manifest import for Planning Commission and public-notice PDFs, followed by meetings and agenda-item tables once stable discovery paths are confirmed.

## Current position

The product already has a sound evidence-oriented base:

- California ABC is ingested daily and supplies pending alcohol-license/application signals.
- San Diego County food-facility and DEHQ plan-check datasets provide independent restaurant corroboration.
- CEQAnet provides environmental-review milestones for selected development projects.
- Nine ABC premise records now have persisted, reviewed SanGIS address points and APNs.
- The public explorer distinguishes mapped records from unmatched records and does not equate an application with a confirmed opening.

The main weakness is not a lack of possible sources. It is that the current records are often thin: a source may show that an application or filing exists without telling us the project scope, decision body, hearing date, units, square footage, applicant, site plan, conditions, approval result, or relationship to later permits.

## Recommended direction

Build a document-centered planning pipeline next, with Planning Commission projects as the first priority. This should complement—rather than replace—the structured ABC, County, and CEQAnet collectors.

The most useful official sources currently visible are:

1. [Carlsbad Planning Commission](https://www.carlsbadca.gov/departments/community-development/planning/planning-commission): recent agendas and supporting materials; older materials move to the public-records portal. Meetings are generally held on the first and third Wednesday.
2. [Public Notices of Development Projects](https://www.carlsbadca.gov/departments/community-development/planning/agendas-minutes-notices): administrative decisions, CEQA notices, public-review documents, Planning Commission hearing notices, and attachments. The current page exposes identifiers and many linked studies/PDFs.
3. [Carlsbad Laserfiche public-records portal](https://records.carlsbadca.gov/WebLink/Welcome.aspx?cr=1): meeting packets, staff reports, minutes, applications, correspondence, exhibits, drawings, maps, recorded documents, reports/studies, project containers, and some permit records.
4. [City meeting list](https://www.carlsbadca.gov/city-hall/meeting-list): future and recent meeting dates, useful as a discovery/scheduling feed even when agenda attachments are not yet present.
5. [Planning Pending Applications](https://library.carlsbadca.gov/home/showpublisheddocument/18725/638635515302800000): a published PDF-style roster with application numbers, project names/descriptions, and staff contacts. Its stable/latest-link behavior must be tested before automation.
6. [CEQAnet](https://ceqanet.opr.ca.gov/): state project pages and attachments, valuable for environmental documents and decision milestones.
7. SanGIS address/APN and County parcel polygons: property identity and map geometry, not ownership or tenant proof.

The city’s customer self-service permit portal can be a useful manual research surface, but it requires registration for at least some functions. Do not automate login, bypass access controls, or treat inaccessible documents as “not found.”

## Can we download and search PDFs?

Yes. Publicly accessible agenda packets, staff reports, notices, plans, environmental studies, and minutes can be downloaded and processed. A defensible workflow should:

1. Save the original public URL, retrieval time, HTTP metadata, file size, MIME type, and SHA-256 checksum.
2. Keep the original PDF when redistribution is allowed; otherwise retain metadata/extracted facts and link to the official copy.
3. Extract embedded text first. Use OCR only for scanned pages, recording which pages required OCR and the OCR confidence/tool version.
4. Preserve page boundaries and page numbers.
5. Split documents by logical sections and identify attachments rather than treating a 500-page agenda packet as one record.
6. Extract candidate facts into structured fields, always with a document ID and page citation.
7. Validate identifiers, dates, addresses, APNs, units, square footage, and decision language with deterministic rules.
8. Queue low-confidence or contradictory claims for human review.

Search should work at two levels:

- Full-text retrieval: find every page mentioning an address, project/application number, APN, applicant, business, unit count, or phrase such as “approve,” “continue,” or “conditions of approval.”
- Structured extraction: create candidate facts such as `proposed_units = 320`, with the exact supporting page and quoted span kept internally for audit.

The public product should paraphrase and cite official documents. It should not publish large copyrighted excerpts or make an AI summary the evidence source.

## Planning Commission pipeline

### Discovery

Poll the Planning Commission page, meeting list, public notices page, and permitted Laserfiche indexes. Create a meeting record as soon as a date appears, then attach agenda/packet/minutes/video URLs as they become available.

### Packet parsing

For each agenda item, extract:

- meeting date, item number, hearing type, and decision body;
- project name and all city application numbers;
- address, APN, project location description, and planner;
- applicant/developer as explicitly identified by the document;
- requested entitlements and existing/proposed land use;
- residential units, affordable units, commercial square footage, building count/height, parking, and acreage;
- staff recommendation;
- CEQA determination and related SCH number;
- proposed conditions, notable community issues, and attachment list.

### Decision reconciliation

Agenda language is a proposal, not the result. Reconcile later minutes/resolutions against the agenda item and store the actual action: approved, denied, continued, recommended to City Council, withdrawn, or no action. Preserve vote, conditions, and appeal deadline when explicitly published.

### Project timeline

Join repeated documents using official identifiers first, then APN/address. A project timeline might include:

`application → public notice → CEQA review → staff report → Planning Commission hearing → City Council action → appeal window → building/grading permit → inspection/completion`

Do not infer a missing stage merely because a later stage exists.

## Data-model additions

The next schema should model documents and claims, not just projects:

- `meetings`: body, scheduled date, status, agenda/minutes/video URLs.
- `agenda_items`: meeting, item number, title, action type, recommendation, outcome.
- `documents`: canonical URL, source, document type, published/retrieved dates, checksum, page count, extraction status, rights/retention status.
- `document_pages`: page text/OCR metadata and search vector.
- `extracted_claims`: field, candidate value, source page/span, extraction method, confidence, review state.
- `project_identifiers`: application, permit, CEQA/SCH, APN, agenda item, resolution, and ordinance identifiers with authority/type.
- `project_parties`: applicant, developer, architect, owner-of-record, consultant, or operator with source and effective dates. Roles must remain distinct.
- `project_metrics`: units, affordable units, square footage, acreage, height, parking, etc., with effective dates and evidence.
- `project_events`: filed, noticed, heard, approved, denied, continued, appealed, permit issued, construction milestone, and completion.
- parcel/building/unit relationships for address and suite resolution.

Every fact should retain `source_event_date`, `published_at`, `first_observed_at`, `retrieved_at`, provenance, and review state. Conflicting values should coexist until reviewed rather than being overwritten silently.

## Highest-value source additions

### Tier 1 — build next

1. Planning Commission agendas, packets, staff reports, and minutes.
2. Public Notices of Development Projects and its linked PDFs/studies.
3. Laserfiche project files for a bounded list of known project identifiers.
4. CEQAnet attachment ingestion with page-level extraction.
5. County parcel polygons joined to the existing APNs.

### Tier 2 — investigate after the document pilot

1. City Council packets and minutes for projects forwarded by Planning Commission.
2. Pending planning applications roster, if a stable current document URL/index can be identified.
3. Building, grading, right-of-way, fire, sign, and tenant-improvement permits available through public records/portal surfaces.
4. Coastal Commission records for coastal-zone projects.
5. California Department of Housing and Community Development data for housing/affordability corroboration.
6. City business-license publications if the city supplies a stable permitted export.

### Lower value or higher risk

- Developer and commercial real-estate pages are useful leads but should remain attributed, secondary evidence.
- News/social posts can help discovery but should not establish approval or opening status.
- Ownership research is legally and semantically complex. Do not expose personal owner data or infer beneficial ownership from assessor, applicant, or license records.

## Proposed pilot

Run a ten-project, document-first pilot before building a broad crawler. Include different document shapes and decision paths:

- Fairfield Apartments at Bressi Ranch;
- Salk Avenue Apartments;
- Resort View Apartments;
- Carlsbad Village Square;
- Rincon CVD;
- Rincon Roosevelt;
- Salt | Grass;
- Costco fuel expansion;
- Next Med Center sign program;
- one restaurant/tenant-improvement candidate such as Slice House or Kura.

For each project, produce:

- a canonical project record and identifier set;
- a document inventory;
- page-cited structured facts;
- a chronological event timeline;
- parcel/address match status;
- unresolved contradictions and missing evidence;
- a final human-reviewed summary suitable for the public site.

Pilot success criteria:

- at least 90% of downloaded pages searchable;
- application IDs, dates, addresses/APNs, recommendation, and outcome extracted correctly on at least 9 of 10 projects;
- all published facts traceable to a specific document page;
- no agenda recommendation presented as a final approval;
- reruns are idempotent and detect changed/replaced documents by checksum;
- inaccessible sources are reported as inaccessible, not absent.

## Suggested sequence

### Phase A — source inventory and PDF proof (roughly 2–4 days)

- Enumerate recent Planning Commission meetings and packet links.
- Download one packet, one staff report, one scanned document, one CEQAnet attachment, and one Laserfiche project file.
- Measure text extraction/OCR quality and document stability.
- Define document types and page-citation format.

### Phase B — ten-project extraction pilot (roughly 1 week)

- Implement the document/claim tables privately.
- Parse the ten pilot projects.
- Add a human review queue and a comparison report against current project cards.
- Identify fields that are reliable enough for public display.

### Phase C — production planning feed

- Schedule discovery around meeting cadence.
- Publish a “Planning & Development” timeline with explicit evidence labels.
- Notify only on meaningful events: a new application, hearing scheduled, staff recommendation published, final action, material scope change, or permit milestone.

### Phase D — deeper property/permit coverage

- Add parcel polygons and reviewed building/unit relationships.
- Work through public building/grading/sign/tenant-improvement permit availability.
- Seek a supported city export/API if portal-only access prevents responsible automation.

## Product improvements enabled by this work

- Project pages with official timeline, metrics, maps, documents, and decision history.
- “Upcoming hearings” and “recent decisions” views.
- Search by address, APN, application number, developer/applicant, or document text.
- Change detection when unit count, square footage, recommendation, hearing date, or status changes.
- Evidence-strength badges such as `application filed`, `staff recommends approval`, `commission approved`, `City Council approved`, `permit issued`, and `construction verified`.
- Better explanations of uncertainty and the difference between proposal, recommendation, entitlement, permit, construction, and opening.

## Questions for the next discussion

1. Should the product prioritize major developments only, or include every noticed planning application?
2. What qualifies as “coming”: filed application, scheduled hearing, approval, permit issuance, construction, or opening?
3. Should residential ADUs and small coastal permits be excluded or placed in a separate layer?
4. How much manual review is acceptable before a document-derived fact becomes public?
5. Should original PDFs be retained, or only checksums/extracted text/links when redistribution rights are unclear?
6. Do we want alerts for hearing dates and decisions, or only a searchable catalog?
7. Is the first public expansion a Planning Commission feed, deeper restaurant/tenant verification, or both?

## Bottom-line recommendation

Start with Planning Commission and public-notice documents. They offer the largest increase in record quality because they contain the scope, identifiers, analysis, recommendation, attachments, and eventual decision that the existing signal feeds lack. Build the PDF pipeline around immutable source files, checksums, page-level citations, structured claims, and human review. In parallel, add parcel polygons so documents, applications, addresses, and existing activity signals can converge on the same property graph.
