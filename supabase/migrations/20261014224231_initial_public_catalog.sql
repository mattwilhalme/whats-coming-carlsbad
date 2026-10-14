create extension if not exists pgcrypto;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  canonical_url text not null,
  owner_name text,
  update_cadence text,
  created_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  canonical_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  street_raw text not null,
  street_normalized text not null,
  city text not null default 'Carlsbad',
  state text not null default 'CA',
  postal_code text,
  suite_raw text,
  suite_normalized text,
  address_role text not null default 'primary' check (address_role in ('primary','alias','historical')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  slug text not null unique,
  name text not null,
  category text not null check (category in ('apartments','mixed-use','commercial')),
  location_text text not null,
  proposed_units integer check (proposed_units is null or proposed_units >= 0),
  affordable_units integer check (affordable_units is null or affordable_units >= 0),
  commercial_sqft integer check (commercial_sqft is null or commercial_sqft >= 0),
  current_status text not null,
  status_as_of date not null,
  source_id uuid not null references public.sources(id),
  source_label text not null,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_identifiers (
  project_id uuid not null references public.projects(id) on delete cascade,
  authority text not null,
  identifier text not null,
  identifier_type text not null,
  primary key (authority, identifier)
);

create table public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null,
  event_date date not null,
  summary text not null,
  source_id uuid not null references public.sources(id),
  source_url text not null,
  first_seen_at timestamptz not null default now(),
  unique (project_id, event_type, event_date, source_url)
);

create index addresses_property_id_idx on public.addresses(property_id);
create index addresses_normalized_idx on public.addresses(street_normalized, city, postal_code);
create index projects_status_as_of_idx on public.projects(status_as_of desc);
create index projects_category_idx on public.projects(category);
create index project_events_project_date_idx on public.project_events(project_id, event_date desc);

alter table public.sources enable row level security;
alter table public.properties enable row level security;
alter table public.addresses enable row level security;
alter table public.projects enable row level security;
alter table public.project_identifiers enable row level security;
alter table public.project_events enable row level security;

create policy "Public sources are readable" on public.sources for select to anon, authenticated using (true);
create policy "Public properties are readable" on public.properties for select to anon, authenticated using (true);
create policy "Public addresses are readable" on public.addresses for select to anon, authenticated using (true);
create policy "Public projects are readable" on public.projects for select to anon, authenticated using (true);
create policy "Public project identifiers are readable" on public.project_identifiers for select to anon, authenticated using (true);
create policy "Public project events are readable" on public.project_events for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.sources, public.properties, public.addresses, public.projects, public.project_identifiers, public.project_events to anon, authenticated;

create view public.projects_public
with (security_invoker = true)
as select id, slug, name, category, location_text, proposed_units, affordable_units,
  commercial_sqft, current_status, status_as_of, source_label, source_url
from public.projects;

grant select on public.projects_public to anon, authenticated;
