# What’s Coming? Carlsbad

A public tracker for proposed developments, restaurants, and business activity in Carlsbad, California. It combines public records and source links to surface early signals—not confirmed openings.

**Live site:** https://mattwilhalme.github.io/whats-coming-carlsbad/

## How it works

- **California ABC licensing data:** A scheduled importer checks license applications and changes for Carlsbad businesses.
- **Development signals:** Public planning notices, CEQAnet records, and verified project sources provide context.
- **Public dashboard:** A React/Vite site reads curated Supabase views. Records retain their sources and uncertainty.

An ABC application is a licensing signal, not proof that a business will open. Property matches and development plans may also change.

See [architecture](docs/architecture.md) for technical details.

## Run locally

Requires Node.js 22+.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to load live public data. Without them, the site uses labeled demonstration data. Never expose a service-role key in a `VITE_` variable.

## Development

```bash
npm run abc:fixture   # Validate the sample ABC data
npm run abc:dry-run   # Check the live ABC export without writing
npm test
npm run typecheck
npm run build
```

Database migrations are in `supabase/migrations/`. The scheduled ABC importer uses a server-side `SUPABASE_SERVICE_ROLE_KEY` secret; setup and implementation details are in the repository workflows and source code.
