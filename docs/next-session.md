# Next session handoff

Updated: 2026-10-15 (Pacific)

## Completed tonight

- Added a San Diego County Food Facility Permits collector and Supabase ingestion model.
- Retained facility identity, permit state, address, and source dates; deliberately excluded owner/contact fields.
- Added conservative ABC-to-County address matching. A different facility name is labeled as an address-only match, not as confirmation of the incoming business.
- Added a weekly GitHub Actions freshness check for the County dataset.
- Added County corroboration to each business-signal card.

## Start here next time

1. Review the current ABC-to-County matches for false positives, especially multi-tenant addresses and suite differences. Add manual dispositions only if address-only matches are too noisy.
2. Add County `record_open_date` when it is consistently present. It may offer a better timing signal than `last_updated`, but first measure completeness and meaning.
3. Run a supported-endpoint feasibility check for San Diego County DEHQ plan-check records. Do not automate around a 403 or unsupported browser workflow.
4. Add CEQAnet as the next automated government collector for development projects, keeping environmental review distinct from construction status.
5. Ask the City of Carlsbad for a stable current building/planning permit feed; the public ArcGIS layer is still stale (2022–2023 data, last edited in January 2024).

## Verification commands

```sh
npm test
npm run build
npm run county:dry-run
```

The public deployment is GitHub Pages. Pushing `main` triggers the Pages workflow. The County workflow uses the existing `SUPABASE_URL` repository variable and `SUPABASE_SERVICE_ROLE_KEY` secret.
