# Carlsbad data feasibility study

## Executive summary

Carlsbad supports a useful address-first product, but not from the city building-permit layer alone. The public ArcGIS service is accessible and technically easy to ingest, yet its 9,886 records cover only 2022-01-01 through 2023-12-29 and the service reports a last data edit on 2024-01-14. It therefore returned **zero permits in the current 90-day window (2026-07-16 through 2026-10-14)**.

The fresher tenant sources are stronger. California ABC's daily export contained 501 Carlsbad rows, including 23 pending application rows that collapse to 17 address/file-level candidates. San Diego County's monthly food-facility dataset contained 602 Carlsbad facilities. Two pending ABC candidates also matched a County facility by normalized street address and overlapping business name; these are evidence-backed candidates, not opening announcements.

Across the 745 historical non-residential permits, 115 (15.4%) shared a normalized street address with at least one ABC DBA or County food-facility name. That percentage measures address-level candidates, not confirmed tenant identity; the denominator is all 745 non-residential permits in the 2022-2023 ArcGIS extract.

Three apartment projects have reproducible primary-source timelines in CEQAnet: Fairfield Apartments at Bressi Ranch (320 units), Salk Avenue Apartments (397 units), and Resort View Apartments (26 units). The records support environmental/planning milestones, not construction starts. Salt | Grass is supported by a developer page, so its January 2029 estimate must remain developer-attributed.

**Recommendation: conditional go.** Build a Carlsbad-only MVP around source-attributed project timelines and tenant-license signals. Do not advertise comprehensive or real-time city permit coverage until the city publishes a current feed or provides another accessible export.

## What worked

- Anonymous ArcGIS metadata, pagination, geometry, stable `OBJECTID`, permit number, address, descriptions, dates, class and status.
- Daily California ABC CSV export with applications, licenses, DBA/legal names, address/suite, type and status.
- Monthly San Diego County food-facility Socrata data with facility names, addresses, permit state and update date.
- CEQAnet pages for the three seeded apartment developments.
- A public Salt | Grass developer page.

## Important limits

- The ArcGIS permit data is stale and lacks parcel ID, valuation and a GlobalID. Its date fields are strings rather than ArcGIS date values.
- The city planning page returned HTTP 403 to automated requests in this study.
- The city business-license site exposes search and a published active-business list, but automated retrieval returned HTTP 403 here. It was not scraped.
- ABC pending records may be transfers or duplicate license types and may never issue.
- County food permits generally describe permitted facilities, not future openings.
- Exact street-address matches at shopping centers are not enough without suite and timing review.

## Seed CSV audit

The original six-row CSV is retained unchanged as `raw/seed-original.csv`. Headers were structurally valid; numeric fields were parseable where present and event dates were ISO `YYYY-MM-DD`. Three rows lacked a location, all commercial-notice rows lacked development quantities, and the seed mixed primary-government records with a developer page and a shared city listing URL. The cleaned output adds explicit project keys, source-verification state and status language. Primary sources supplied locations/APNs for Fairfield and Resort View, a second identifier for Fairfield, and planning/CEQA milestone dates. The Costco seed note contained `925 Palomar Airport Road` but explicitly warned it was a separate notice, so the cleaned record does not assign that address.

## Reproduce

Requires Node.js 20+ and network access to the public sources.

```bash
cd research/carlsbad-poc/ingestion-prototype
npm run fetch:arcgis
npm run build
```

`build` reads the retained ABC ZIP and County/CEQA extracts in `../raw/`. Re-download those inputs using the URLs in `raw/retrieval-metadata.json` before a fresh run. No production database, scheduled job or deployment is created.

## Outputs

- `normalized-projects.csv`: six cleaned seed records with corrected locations and explicit evidence limits.
- `commercial-permits.csv`: all 745 non-residential records in the stale ArcGIS feed, including current-window and address-match flags.
- `tenant-candidates.csv`: 17 deduplicated pending ABC candidates.
- `matching-report.md`: join counts, examples and false-positive analysis.
- `source-audit.md`: source-by-source feasibility assessment.
- `data-model.md`: proposed PostgreSQL/Supabase schema and idempotency design.
- `next-steps.md`: prioritized roadmap and cost estimate.

Research date: 2026-10-14 (America/Los_Angeles).
