# Source audit

Research date: 2026-10-14.

| Source | Access and fields | Freshness and depth | Automation | Reliability and limits |
|---|---|---|---|---|
| Carlsbad BuildingPermits ArcGIS FeatureServer | Anonymous JSON/GeoJSON query. One point layer. Fields: `OBJECTID`, permit number, description, applied/issued/completed string dates, current status, address/city/state/ZIP, class, mapped class, coordinates, tract and district. | 9,886 records from 2022-01-01 through 2023-12-29. Service `dataLastEditDate`: 2024-01-14. | High technically: 2,000-row pages, pagination, statistics/order support and deterministic `OBJECTID` ordering. | Low operational value until refreshed. No parcel ID, suite field, valuation, applicant/contractor or GlobalID. Coordinates exist as geometry and projected `POINT_X/Y`. Public service advertises Query capability. |
| Carlsbad planning agendas/minutes/notices | Human-facing page. | Current notices are expected, but automated request returned HTTP 403. | Low without city cooperation or a stable document index. | Browser/manual review remains possible. Do not bypass the 403. Seeded Next Med and Costco records remain unverified in this run. |
| CEQAnet | Public project/document HTML and attached PDFs. Project title, SCH number, lead agency, document type, dates, description, location and decisions. | Historical and current filings; event-based, not a construction-status feed. | Medium. Stable public pages worked; attachments and document variants require careful linkage. | Strong for environmental-review milestones. A Notice of Determination or Exemption does not prove a building permit or construction start. |
| California ABC licensing reports | Daily statewide ZIP/CSV. Fields include license type, file number, application/license flag, status, issue/expiration, legal/DBA name, premise address/suite/city/ZIP and county. | Refreshed each business day at 7 a.m. PT according to ABC. This download was timestamped 2026-10-14. | High. Download, parse, filter, group duplicate license types, compare snapshots. | Strong direct evidence of an ABC record. Pending does not mean a new business or future opening. Multiple rows per file/address are common. The output excludes mailing addresses and does not expose personal phone/email data. |
| San Diego County Food Facility Permits | Public Socrata dataset `c5ez-ufrd`. Facility record ID/name, permit status, active flag, business type, address, city/state/ZIP, update date and optional coordinates. | Metadata says monthly; 602 Carlsbad rows in the current extract. | High for full-download plus local filtering. A server-side `$where` query returned HTTP 400, while `$limit` retrieval worked. | Strong for permitted facility identity, weak for future-opening timing. Owner phone/email and unnecessary personal names were omitted from normalized outputs. |
| Carlsbad business licenses | City page offers an active-business search and published active-business list. | Search result located an “Active Businesses as of May 01, 2026” publication; the live path returned HTTP 403 to automation. | Low to medium if the city provides a stable download or allows scheduled access. | Business licenses can include businesses located outside Carlsbad and multiple licenses per business; the city notes home-based businesses are excluded from public search. |
| Salt \| Grass developer page | Public project page with address, application IDs/date, 15 apartments, two affordable units, about 8,240 square feet and a January 2029 estimate. | Developer-maintained; change schedule unknown. | Medium via monitored HTML snapshot. | Useful lead and direct statement from developer, but not authoritative for approval, tenant identity or completion. |
| Parcel/geocoding | Not implemented in this time-boxed POC. CEQAnet supplied APNs for Fairfield and Resort View; ArcGIS supplies coordinates. | Source-dependent. | Medium with a public county parcel service or city GIS layer. | Avoid owner-person data. Use APNs as property keys only after verifying formatting and parcel splits/merges. |

## Terms, retention and rate considerations

This POC used public government endpoints at low request volume. No endpoint exposed a specific rate-limit response. Collectors should identify themselves, use conditional requests where supported, keep retries bounded and poll no faster than the source changes. Retain raw responses with retrieval timestamps and source URLs only where redistribution is permitted. Link to official records when document redistribution terms are unclear. Before production, review each site's current terms, ArcGIS item terms, County open-data terms and ABC reuse conditions with counsel or the data owner.

## Recommended polling

- ABC export: weekdays after 8 a.m. PT; diff by file number + license type + application/license flag.
- County food facilities: weekly check, monthly full snapshot, because metadata says monthly.
- CEQAnet: daily or twice weekly query for Carlsbad lead-agency postings; treat filing dates as source events.
- City planning notices: weekly manual or permitted monitor after obtaining a supported endpoint.
- ArcGIS permits: weekly metadata check only while stale; resume daily incremental collection if `dataLastEditDate` advances.
- Business licenses: monthly if a stable city download becomes available.
