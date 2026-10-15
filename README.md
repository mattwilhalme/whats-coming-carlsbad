# What’s Coming? Carlsbad

Address-first public intelligence for proposed development and restaurant/business signals in Carlsbad, California. Every record retains its source and uncertainty: an ABC application is a licensing signal, not a confirmed opening.

## Public sites

- GitHub Pages: <https://mattwilhalme.github.io/whats-coming-carlsbad/>
- Owner-private working deployment: <https://whats-coming-carlsbad.expertmaple6.chatgpt.site/>

## Architecture

The React/Vite frontend reads curated Supabase views. A weekday GitHub Actions job downloads California ABC’s official daily CSV export, filters it to Carlsbad, normalizes names and premise addresses, and calls a service-role-only database function. Operational tables live in the non-exposed `ingest` schema.

See [docs/architecture.md](docs/architecture.md) for the end-to-end data flow.

## Data sources

- [California ABC licensing reports](https://www.abc.ca.gov/licensing/licensing-reports/) — official daily export of pending and active licenses, refreshed each business day at 7 a.m. Pacific.
- CEQAnet — environmental and planning milestones for the verified development seed.
- City of Carlsbad public planning notices — manually verified project signals.
- A developer page for Salt | Grass, explicitly labeled as developer-stated.

The research exports in `research/carlsbad-poc/` contain public business, licensing, facility, and permit fields. Raw bulk downloads are ignored and are not redistributed in Git.

## Local setup

Requires Node.js 22+.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Without Supabase environment variables, the UI clearly labels itself as demonstration data and shows the six verified development seed records. With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, it loads the live public views.

Never put a secret/service-role key in a `VITE_` variable. Vite values are browser-visible.

## ABC ingestion

```bash
# Test the parser with the committed fixture; never writes.
npm run abc:fixture

# Download the official export, validate it, and report Carlsbad statistics.
npm run abc:dry-run

# Persist a successful import (server-side environment only).
SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run abc:ingest
```

Options:

- `--dry-run`: parse and report without database writes.
- `--fixture path.csv`: reprocess a saved CSV or ZIP fixture.
- `--city "City Name"`: reuse the collector for another city.
- `--source-url URL`: override the official export endpoint for testing.

The downloader uses timeouts, three bounded attempts, conditional requests, atomic cache replacement, ZIP validation, and minimum-record completeness checks. Identical source records share stable keys and content hashes, so repeated imports do not create duplicate revisions or events.

## Database

Migrations are in `supabase/migrations/`. The ABC migration adds:

- ingestion runs and source snapshots;
- normalized business identities and premise addresses;
- individual ABC license records and immutable revisions;
- structured change events and property-link candidates;
- a service-role-only ingestion RPC;
- curated public signal and health views.

For local development:

```bash
supabase start
supabase db reset
```

Docker is required for the local stack. Production migrations should be reviewed and applied to the intended project before enabling scheduled writes.

## GitHub configuration

Repository variables:

- `SUPABASE_URL` — public project URL.
- `SUPABASE_PUBLISHABLE_KEY` — public browser-safe publishable key.

Repository secret:

- `SUPABASE_SERVICE_ROLE_KEY` — privileged server-side key used only by the ABC ingestion workflow.

The Pages workflow builds and deploys every push to `main`. The ingestion workflow runs at approximately 9:15 a.m. Pacific on weekdays using paired UTC schedules plus a Pacific-time guard, so daylight saving time is handled without duplicate imports. Manual runs default to dry-run and can use the committed fixture. Concurrency prevents overlapping imports.

## Tests and validation

```bash
npm test
npm run typecheck
npm run build
```

The fixture suite covers multiple license types, different suites at one address, missing DBA, existing-business/transfer-shaped records, status fields, repeated duplicates, row reordering, malformed dates, incomplete exports, and stable normalization.

## Troubleshooting

- **The UI says demonstration data:** check the two `VITE_SUPABASE_*` build variables.
- **The first live ABC section is empty:** apply the ABC migration, then run a successful ingestion.
- **Scheduled ingestion fails immediately:** verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured in GitHub.
- **The export is unchanged:** this is normal; the run should not create duplicate revisions or events.
- **ABC is unavailable or incomplete:** the job fails without marking absent records closed; the site continues showing the last successful retrieval timestamp.

## Current limitations

- ABC applications may be transfers, extra license types, or plans that never open.
- The collector does not call a protected lookup page or infer confirmed openings.
- Property links are candidates until corroborated.
- City permit coverage in the feasibility study is historical and not comprehensive.
- Automatic failure notification currently relies on GitHub Actions’ native failed-workflow notifications.
