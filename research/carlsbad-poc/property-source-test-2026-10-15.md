# Property source test — 2026-10-15

## Scope and method
Desk audit of the 17 distinct pending ABC file/address candidates already extracted in `research/carlsbad-poc/tenant-candidates.csv` (snapshot 2026-10-14). Cross-checks below reuse the POC's county food facility joins; this pass also checks current official public source documentation. This is **not** a fresh bulk retrieval, individual document download, APN geocoding, or confirmation of business openings.

## Results
- 23 pending ABC rows collapse to **17 distinct file/address candidates**.
- **2 of 17** have both a normalized street-address match and overlapping business name in county food-facility records: 264 Fresco (264 Carlsbad Village Dr) and Blue Ocean Sushi (2958 Madison St, Suite 100). These are identity candidates, **not confirmed new openings**.
- A third candidate, L'Atelier de Paris (7150 Avenida Encinas), has a county address match flagged in the CSV but lacks a name-overlap confirmation; keep separate from the two stronger links.
- **15 of 17** lack the stronger address-plus-name match.
- **Potential address/suite collision:** Dozier Imports LLC and Vino Norte each report 2225 Camino Vida Roble, unit 100 (rendered as `STE 100` vs `#100`). They have different ABC file numbers, legal names and DBAs. Treat as two operators/applications sharing a possible unit, not as one business and not as proof of tenant succession.
- None of the 17 candidates has a historical commercial permit match in the POC CSV. This is not evidence of no construction: the ArcGIS extract ends in 2023.
- No parcel-level ownership changes or confirmed tenant changes can be established from these inputs.

## Additional public sources verified
| Source | Access | Useful fields / artifacts | Limitation | Decision |
|---|---|---|---|---|
| SanGIS Address Points to APN (https://data.sandiego.gov/datasets/gis-address-points-apn/) | Public CSV, GeoJSON, REST; weekly updates (listed Oct 5, 2026) | Situs address and assessor parcel number | APN identifies parcel, not owner or suite | **Priority 1**: add address-to-APN matching |
| County Assessor Parcels ArcGIS (https://gis-public.sandiegocounty.gov/arcgis/rest/services/HCD/HCD_Map/FeatureServer/0) | Public queryable polygon feature layer | APN, parcel geometry | Not an ownership-history feed | **Priority 1**: parcel geometry and APN validation |
| Carlsbad Online Permit Services (https://www.carlsbadca.gov/departments/community-development/customer-self-service) | Web portal with registration; city says commercial tenant improvement and sign permits supported | Application/plan documents, statuses for authorized portal users | Public bulk access and document visibility unverified | **Manual pilot**: check 5 selected addresses; no login bypass |
| County Food Facility Permits (https://data.sandiegocounty.gov/widgets/c5ez-ufrd) | Public dataset | Facility name, address, permit status and record date | Existing facilities are not opening announcements | Continue automated matching |
| CEQAnet | Public project pages and attached PDFs | Project-level planning documents and milestones | Not all small tenant improvements appear | Pilot PDFs on a verified seeded development |
| County recorded deeds | Public index / records process, access varies | Evidence of title transfers | Not direct evidence of beneficial ownership or tenant changes | Separate manual ownership pilot |

## Five-address manual document pilot
1. 264 Carlsbad Village Dr — 264 Fresco; distinguish existing operation from transfer.
2. 2958 Madison St, Suite 100 — Blue Ocean Sushi; corroborate current operator.
3. 2225 Camino Vida Roble, Suite 100 — Dozier Imports / Vino Norte collision; verify suite identity and license types.
4. 6943 El Camino Real, Suites 101 & 103 — Slice House; seek tenant-improvement or signage records.
5. 5970 Avenida Encinas — Kura Revolving Sushi Bar; seek independent building/food records.

For each address, record APN, normalized building/unit identifiers, city permit search outcome, PDF availability, document page citations, owner evidence, tenant evidence, retrieval time, and uncertainty. Mark `not_accessible` rather than `not_found` if the portal requires authorization.

## Proposed property graph
- parcel (APN, geometry, effective dates)
- address (canonical street address, aliases, parcel relation)
- building (parcel relation)
- unit (building relation, normalized suite)
- legal_entity and business_brand (distinct)
- ownership_interest (entity, parcel, dates, deed evidence, confidence)
- occupancy (entity/business, unit, dates, evidence, confidence)
- license / permit / filing (source-native IDs, status, dates)
- document (source URL, checksum if downloaded, rights, page-level extracted claims)
- observation and event (source event date, first observed date, retrieval date, provenance)

Never infer ownership from a license applicant; never infer a new tenant from an ABC transfer alone. Do not merge distinct ABC file numbers solely because they share a street address or suite.

## Next executable work
1. Ingest SanGIS address-to-APN crosswalk and county parcel polygons, then measure match coverage on all 17 ABC candidates.
2. Manually inspect five addresses in the city portal; collect public permit IDs and PDF links where authorized.
3. Parse a publicly accessible CEQAnet PDF, recording page references and extracted fields.
4. Only after those tests, decide whether to automate city permit/document collection.

## Interpretation
This pass validates a promising parcel-data source and identifies a real suite-level collision that the current address-first model must handle. It **does not yet demonstrate** automated owner-change detection, tenant succession, PDF extraction, or five newly confirmed openings.
