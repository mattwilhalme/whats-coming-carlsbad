# Reviewed location persistence proposal

Status: approved and implemented on October 17, 2026 (Pacific time).

## Why this is the next step

The explorer now has a reviewed nine-record SanGIS pilot, but those matches live in frontend source code. Persisting them would let ingestion jobs, public views, and future parcel/building workflows share one auditable location record without treating an address-point match as proof of a tenant, suite, building, or opening.

## Proposed model

Add a private `ingest.reviewed_location_matches` table keyed to the source address rather than directly to a business name:

| Column | Purpose |
| --- | --- |
| `id uuid` | Stable internal key |
| `address_id uuid` | Foreign key to `ingest.business_addresses` |
| `source_name text` | Human-readable geometry/address source |
| `source_url text` | Canonical evidence URL |
| `source_record_id text` | SanGIS address-point identifier when available |
| `apn text` | Parcel candidate, stored as text to retain leading zeroes |
| `longitude double precision` / `latitude double precision` | Reviewed WGS84 point |
| `match_method text` | Controlled value such as `exact_normalized_street` |
| `confidence numeric` | Machine-readable score, separate from the method |
| `review_note text` | Scope and uncertainty statement |
| `reviewed_at timestamptz` | When a human or approved workflow reviewed it |
| `reviewed_by text` | Workflow/reviewer identifier, not public personal data |
| `created_at` / `updated_at` | Audit timestamps |

Recommended constraints:

- one current reviewed match per address and source;
- latitude/longitude range checks;
- confidence constrained to `0..1`;
- an allow-list check for `match_method`;
- service-role-only writes and no direct anonymous access to the ingest table.

Extend `public.abc_business_signals_public` with only the fields the browser needs: `latitude`, `longitude`, `apn`, `location_source_url`, `location_match_method`, `location_confidence`, `location_review_note`, and `location_reviewed_at`. Keep the existing security-invoker view and anonymous read-only grant. Do not expose `reviewed_by`.

## Initial backfill

Backfill only the nine rows in `research/carlsbad-poc/raw/apn-match-results.json` that have one exact normalized street match, one address point, and one APN. The migration must reject or skip ambiguous rows. The remaining eight ABC address candidates and all six project locations stay explicitly unmatched.

## Rollout and rollback

1. Apply the table/view migration in a non-production environment.
2. Backfill the nine reviewed rows idempotently using the existing address keys.
3. Compare the public view output against the checked-in pilot fixture.
4. Switch the frontend adapter from `src/reviewed-locations.ts` to the public view fields.
5. Remove the frontend fixture only after production verification.

Rollback is additive and low risk: restore the prior public view definition, revert the frontend adapter, and drop the new table only if its backfill is no longer needed.

## Implementation result

Migration `20261018042541_persist_reviewed_locations.sql` created the ingest table, backfilled nine reviewed premise-address records, and appended the safe location fields to `public.abc_business_signals_public`. Anonymous clients can read the public fields required by the explorer but cannot read the internal `reviewed_by` column. The frontend now consumes the persisted view fields rather than a checked-in runtime fixture.
