# Proposed data model

## Identity hierarchy

Use a property/building/suite hierarchy instead of using a formatted address as the permanent key.

```text
properties 1--n property_parcels n--1 parcels
properties 1--n addresses
properties 1--n spaces 1--n occupancies n--1 organizations
properties 1--n projects 1--n project_events
properties 1--n permits
organizations 1--n licenses
source_records 1--n record_links
```

## Core tables

### `properties`

- `id uuid primary key`
- `canonical_name text`
- `centroid geography(point,4326)`
- `created_at`, `updated_at timestamptz`

One physical site or coherent development. A multi-parcel project can point to one property while parcels remain separate.

### `parcels`

- `id uuid primary key`
- `jurisdiction text`, `apn_normalized text`
- `geometry geography(multipolygon,4326)` nullable
- unique index on `(jurisdiction, apn_normalized)`

### `property_parcels`

- `property_id`, `parcel_id`, `valid_from`, `valid_to`
- primary key `(property_id, parcel_id, valid_from)`

### `addresses`

- `id uuid primary key`, `property_id uuid`
- raw and normalized street/city/state/ZIP
- `address_role` (`primary`, `alias`, `historical`, `mailing_not_allowed`)
- `geocode_source`, `latitude`, `longitude`, `valid_from`, `valid_to`
- index on normalized street/city/ZIP; trigram index for review search

### `spaces`

- `id uuid primary key`, `property_id uuid`
- `suite_raw`, `suite_normalized`, `building_label`
- unique partial index on `(property_id, suite_normalized, building_label)`

### `organizations`

- `id uuid primary key`, `legal_name`, `trade_name`
- Do not store personal owner contact information unless essential and legally reviewed.

### `occupancies`

- `id uuid primary key`, `space_id`, `organization_id`
- `status` (`candidate`, `active`, `closed`, `unknown`)
- `valid_from`, `valid_to`, `confidence`, `reviewed_at`

### `projects`

- `id uuid primary key`, `property_id`, `canonical_name`, `category`
- current derived status plus `status_as_of`
- proposal metrics: units, affordable units, buildings, height, commercial square feet
- Never overwrite history when a proposal changes.

### `project_identifiers`

- `project_id`, `authority`, `identifier`, `identifier_type`
- unique `(authority, identifier)`; allows SDP/CDP/DEV/SCH numbers to link one project.

### `project_events`

- `id uuid primary key`, `project_id`, `event_type`, `event_date`
- `status_after`, structured `details jsonb`
- `source_record_id`, `observed_at`
- unique `(project_id, event_type, event_date, source_record_id)`

### `permits` and `licenses`

- source identifier, property/space/organization foreign keys when resolved
- raw status plus normalized status
- application/issue/completion/expiration dates
- description/type, observed timestamps and content hash
- unique `(source_id, source_identifier, source_subtype)`

### `sources`, `ingestion_runs`, `source_records`

- `sources`: canonical URL, owner, collector version, expected cadence, terms note.
- `ingestion_runs`: start/end, HTTP status, bytes, record count, high-water mark, success/error.
- `source_records`: source, external key, retrieved/first-seen/last-seen timestamps, source event date, content hash, raw JSON or retained-file pointer.
- unique `(source_id, external_key, content_hash)` preserves revisions without duplicate snapshots.

### `record_links`

- from/to entity and source record IDs
- `link_type`, deterministic rule/version, score, evidence JSON, review state
- Never turn an address-only candidate into a confirmed occupancy automatically.

## Change detection

1. Fetch into a run-scoped staging table.
2. Normalize stable keys without mutating raw values.
3. Hash the canonical source payload after removing retrieval-only metadata.
4. Insert a new source revision only when the hash changes.
5. Derive events by field-level comparison with the previous revision.
6. Set `first_seen_at` independently from the source's event date. A newly discovered 2023 permit in 2026 is historical discovery, not a 2026 event.
7. Close missing records only when the source semantics support deletion/closure; absence from a partial feed is not a cancellation.

Useful indexes: permits on `(applied_date desc)`, licenses on `(status, observed_at desc)`, events on `(project_id, event_date desc)`, source records on `(source_id, external_key, retrieved_at desc)`, addresses with normalized B-tree and trigram indexes, and GiST on geographies.
