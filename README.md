# What’s Coming? Carlsbad

Barebones address-first MVP for source-backed development and tenant signals in Carlsbad, California.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without Supabase environment variables, the app displays the six verified research seed records. With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, it reads the public `projects_public` view.

## Database

The initial Supabase schema is in `supabase/migrations/`. It enables RLS on every public table, grants read-only access to `anon` and `authenticated`, and creates no browser-writable policy. Seed data is in `supabase/seed.sql`.

For local Supabase development:

```bash
supabase start
supabase db reset
```

Docker is required for the local Supabase stack. Do not place a secret or `service_role` key in any `VITE_` variable.

## Research

The feasibility study and reproducible source collectors remain under `research/carlsbad-poc/`.
