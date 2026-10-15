# Pre-publication security and redistribution audit

Audit date: October 15, 2026

## Scope

- All tracked files in the working tree.
- Every object reachable from the repository’s three existing commits.
- Environment examples, ignore rules, Supabase configuration/migrations, research exports, dependencies, and deployment workflows.

## Findings

- No live API token, password, database URL with credentials, service-role key, access token, or refresh token was found in tracked files or Git history.
- `.env.local` is ignored and has never been tracked. `.env.example` contains placeholders only.
- The frontend uses a browser-safe Supabase publishable key. No privileged key is referenced by any `VITE_` variable.
- The ABC workflow reads the service-role key only from GitHub Actions secrets.
- `npm audit --omit=dev` reported zero known production dependency vulnerabilities on the audit date.
- Operational ABC tables are in the non-exposed `ingest` schema. Public clients receive only curated current-signal and ingestion-health views.
- Public datasets contain business/public-record fields. They do not contain customer accounts, private contact lists, authentication data, payment data, or government identifiers for individuals.

## Redistribution

California ABC publishes the daily ZIP/CSV from its official licensing reports page as a downloadable raw-data report. The repository stores small derived Carlsbad research outputs with attribution, not the bulk daily archive. Bulk ZIP downloads and other raw captures are ignored.

The City/County research outputs are factual government-record derivatives with source attribution. Raw HTML and large raw source captures remain ignored. Any future source with explicit redistribution restrictions must be linked rather than copied until its terms are reviewed.

## Result

No serious unresolved security or redistribution blocker was identified. The repository can be made public. A service-role credential must never be committed and should be configured only as the `SUPABASE_SERVICE_ROLE_KEY` repository secret.
