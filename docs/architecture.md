# Architecture

```text
California ABC daily ZIP/CSV
          │
          ▼
bounded downloader + completeness checks
          │
          ▼
CSV parser → address/name normalization → stable source keys
          │
          ▼
Supabase private ingest schema
  ├─ snapshots and ingestion runs
  ├─ business identities and premise addresses
  ├─ individual ABC license records and immutable revisions
  └─ evidence-backed change events
          │
          ▼
curated public views (no mailing address or privileged fields)
          │
          ▼
React frontend: Restaurant & Business Signals + ingestion health
```

The source event date, first-observed date, and retrieval timestamp remain separate. Each license type is retained as an individual source record; the frontend groups related types for readability. Repeating an identical snapshot updates observation time but does not create another revision or event.

The operational tables live in the non-exposed `ingest` schema. Browser clients can only read the two curated public views. Writes use a service-role credential inside GitHub Actions and call a service-role-only RPC. No privileged credential is compiled into the Vite application.

Absence from an export never closes a record. Terminal states are represented only when ABC explicitly publishes them in a source record.
