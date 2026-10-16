# Next session handoff

Updated: 2026-10-16 (Pacific)

## Completed

- Added a San Diego County Food Facility Permits collector and Supabase ingestion model.
- Retained facility identity, permit state, address, and source dates; deliberately excluded owner/contact fields.
- Added conservative ABC-to-County address matching. A different facility name is labeled as an address-only match, not as confirmation of the incoming business.
- Added a weekly GitHub Actions freshness check for the County dataset.
- Added County corroboration to each business-signal card.
- Confirmed the County food-facility API does not return `record_open_date` for the Carlsbad records, so it cannot currently establish when an application began.
- Added a low-rate San Diego County DEHQ Citizen Access collector for food-facility plan-check records (FFPP and FAMD), including filing date and review status.
- Added conservative ABC-to-DEHQ matching and linked plan-check evidence on signal cards.
- Added a weekly DEHQ GitHub Actions ingestion workflow with optional manual date-range backfills.

## Start here next time

1. Review ABC-to-DEHQ address-only matches for prior tenants and multi-tenant false positives; add manual dispositions only if those matches are too noisy.
2. Add CEQAnet as the next automated government collector for development projects, keeping environmental review distinct from construction status.
3. Ask the City of Carlsbad for a stable current building/planning permit feed; the public ArcGIS layer is still stale (2022–2023 data, last edited in January 2024).
4. Add company research enrichment (official website, California business entity, and a clearly labeled newsroom source) without treating third-party descriptions as government confirmation.

## Verification commands

```sh
npm test
npm run build
npm run county:dry-run
npm run dehq:fixture
npm run dehq:dry-run
```

The public deployment is GitHub Pages. Pushing `main` triggers the Pages workflow. The County and DEHQ workflows use the existing `SUPABASE_URL` repository variable and `SUPABASE_SERVICE_ROLE_KEY` secret.
