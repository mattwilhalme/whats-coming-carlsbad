create schema if not exists ingest;

revoke all on schema ingest from public, anon, authenticated;
grant usage on schema ingest to service_role;

create table ingest.abc_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  city text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('running','succeeded','failed','unchanged')),
  snapshot_sha256 text,
  retrieved_at timestamptz not null,
  source_updated_at timestamptz,
  source_record_count integer not null default 0,
  filtered_record_count integer not null default 0,
  inserted_count integer not null default 0,
  changed_count integer not null default 0,
  unchanged_count integer not null default 0,
  event_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create table ingest.abc_source_snapshots (
  sha256 text primary key,
  source_url text not null,
  retrieved_at timestamptz not null,
  source_updated_at timestamptz,
  byte_size bigint not null check (byte_size >= 0),
  record_count integer not null check (record_count >= 0),
  filtered_record_count integer not null check (filtered_record_count >= 0),
  successful boolean not null default true
);

create table ingest.business_identities (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  display_name text not null,
  legal_name text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingest.business_addresses (
  id uuid primary key default gen_random_uuid(),
  address_key text not null unique,
  street_raw text not null,
  street_normalized text not null,
  suite_raw text,
  suite_normalized text,
  city text not null,
  state text,
  postal_code text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingest.abc_license_records (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  file_number text not null,
  license_type text not null,
  duplicate_count text not null default '',
  license_or_application text not null,
  type_status text not null,
  business_id uuid not null references ingest.business_identities(id),
  address_id uuid not null references ingest.business_addresses(id),
  primary_name_raw text,
  dba_name_raw text,
  premise_address_1_raw text not null,
  premise_address_2_raw text,
  premise_city_raw text not null,
  premise_state_raw text,
  premise_zip_raw text,
  original_issue_date date,
  expiration_date date,
  last_status_change_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  source_url text not null,
  source_retrieved_at timestamptz not null,
  current_content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingest.abc_license_revisions (
  id uuid primary key default gen_random_uuid(),
  license_record_id uuid not null references ingest.abc_license_records(id) on delete cascade,
  snapshot_sha256 text not null references ingest.abc_source_snapshots(sha256),
  content_hash text not null,
  observed_at timestamptz not null,
  source_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (license_record_id, content_hash)
);

create table ingest.abc_events (
  id uuid primary key default gen_random_uuid(),
  license_record_id uuid not null references ingest.abc_license_records(id) on delete cascade,
  event_type text not null check (event_type in ('newly_observed','new_application','status_change','name_change','address_change','potential_incoming_business')),
  event_at timestamptz not null,
  source_event_date date,
  summary text not null,
  evidence jsonb not null,
  evidence_hash text not null,
  created_at timestamptz not null default now(),
  unique (license_record_id, event_type, evidence_hash)
);

create table ingest.abc_property_candidates (
  id uuid primary key default gen_random_uuid(),
  license_record_id uuid not null references ingest.abc_license_records(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  match_type text not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  rationale text not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (license_record_id, property_id, match_type)
);

create index abc_ingestion_runs_completed_idx on ingest.abc_ingestion_runs (completed_at desc);
create index abc_license_records_status_idx on ingest.abc_license_records (type_status, last_seen_at desc);
create index abc_license_records_business_idx on ingest.abc_license_records (business_id);
create index abc_license_records_address_idx on ingest.abc_license_records (address_id);
create index abc_events_event_at_idx on ingest.abc_events (event_at desc);

create or replace function public.ingest_abc_snapshot(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ingest, pg_temp
as $$
declare
  item jsonb;
  run_id uuid;
  business_uuid uuid;
  address_uuid uuid;
  record_uuid uuid;
  previous ingest.abc_license_records%rowtype;
  was_inserted boolean;
  inserted_total integer := 0;
  changed_total integer := 0;
  unchanged_total integer := 0;
  event_total integer := 0;
  observed_at timestamptz := (payload->>'retrieved_at')::timestamptz;
  source_sha text := payload->>'snapshot_sha256';
begin
  insert into ingest.abc_source_snapshots (
    sha256, source_url, retrieved_at, source_updated_at, byte_size, record_count, filtered_record_count
  ) values (
    source_sha, payload->>'source_url', observed_at, nullif(payload->>'source_updated_at','')::timestamptz,
    (payload->>'byte_size')::bigint, (payload->>'source_record_count')::integer,
    jsonb_array_length(payload->'records')
  ) on conflict (sha256) do nothing;

  insert into ingest.abc_ingestion_runs (
    source_url, city, started_at, completed_at, status, snapshot_sha256, retrieved_at,
    source_updated_at, source_record_count, filtered_record_count
  ) values (
    payload->>'source_url', payload->>'city', (payload->>'started_at')::timestamptz, now(),
    'succeeded', source_sha, observed_at, nullif(payload->>'source_updated_at','')::timestamptz,
    (payload->>'source_record_count')::integer, jsonb_array_length(payload->'records')
  ) returning id into run_id;

  for item in select value from jsonb_array_elements(payload->'records') loop
    insert into ingest.business_identities (identity_key, display_name, legal_name, first_seen_at, last_seen_at)
    values (item->>'business_key', item->>'display_name', nullif(item->>'primary_name',''), observed_at, observed_at)
    on conflict (identity_key) do update set
      display_name = excluded.display_name,
      legal_name = excluded.legal_name,
      last_seen_at = excluded.last_seen_at,
      updated_at = now()
    returning id into business_uuid;

    insert into ingest.business_addresses (
      address_key, street_raw, street_normalized, suite_raw, suite_normalized, city, state,
      postal_code, first_seen_at, last_seen_at
    ) values (
      item->>'address_key', item->>'premise_address_1', item->>'street_normalized',
      nullif(item->>'premise_address_2',''), nullif(item->>'suite_normalized',''), item->>'premise_city',
      nullif(item->>'premise_state',''), nullif(item->>'premise_zip',''), observed_at, observed_at
    ) on conflict (address_key) do update set
      street_raw = excluded.street_raw,
      suite_raw = excluded.suite_raw,
      postal_code = excluded.postal_code,
      last_seen_at = excluded.last_seen_at,
      updated_at = now()
    returning id into address_uuid;

    select * into previous from ingest.abc_license_records where source_key = item->>'source_key';
    was_inserted := not found;

    insert into ingest.abc_license_records (
      source_key, file_number, license_type, duplicate_count, license_or_application, type_status,
      business_id, address_id, primary_name_raw, dba_name_raw, premise_address_1_raw,
      premise_address_2_raw, premise_city_raw, premise_state_raw, premise_zip_raw,
      original_issue_date, expiration_date, first_seen_at, last_seen_at, source_url,
      source_retrieved_at, current_content_hash
    ) values (
      item->>'source_key', item->>'file_number', item->>'license_type', coalesce(item->>'duplicate_count',''),
      item->>'license_or_application', item->>'type_status', business_uuid, address_uuid,
      nullif(item->>'primary_name',''), nullif(item->>'dba_name',''), item->>'premise_address_1',
      nullif(item->>'premise_address_2',''), item->>'premise_city', nullif(item->>'premise_state',''),
      nullif(item->>'premise_zip',''), nullif(item->>'original_issue_date','')::date,
      nullif(item->>'expiration_date','')::date, observed_at, observed_at, payload->>'source_url',
      observed_at, item->>'content_hash'
    ) on conflict (source_key) do update set
      license_or_application = excluded.license_or_application,
      type_status = excluded.type_status,
      business_id = excluded.business_id,
      address_id = excluded.address_id,
      primary_name_raw = excluded.primary_name_raw,
      dba_name_raw = excluded.dba_name_raw,
      premise_address_1_raw = excluded.premise_address_1_raw,
      premise_address_2_raw = excluded.premise_address_2_raw,
      premise_city_raw = excluded.premise_city_raw,
      premise_state_raw = excluded.premise_state_raw,
      premise_zip_raw = excluded.premise_zip_raw,
      original_issue_date = excluded.original_issue_date,
      expiration_date = excluded.expiration_date,
      last_status_change_at = case when ingest.abc_license_records.type_status is distinct from excluded.type_status then observed_at else ingest.abc_license_records.last_status_change_at end,
      last_seen_at = observed_at,
      source_retrieved_at = observed_at,
      current_content_hash = excluded.current_content_hash,
      updated_at = now()
    returning id into record_uuid;

    insert into ingest.abc_license_revisions (license_record_id, snapshot_sha256, content_hash, observed_at, source_payload)
    values (record_uuid, source_sha, item->>'content_hash', observed_at, item)
    on conflict (license_record_id, content_hash) do nothing;

    if was_inserted then
      inserted_total := inserted_total + 1;
      insert into ingest.abc_events (license_record_id, event_type, event_at, source_event_date, summary, evidence, evidence_hash)
      values (record_uuid, 'newly_observed', observed_at, nullif(item->>'source_event_date','')::date,
        'ABC record first observed by What''s Coming?', item, item->>'content_hash')
      on conflict do nothing;
      event_total := event_total + 1;
      if item->>'license_or_application' = 'APP' then
        insert into ingest.abc_events (license_record_id, event_type, event_at, source_event_date, summary, evidence, evidence_hash)
        values (record_uuid, 'new_application', observed_at, nullif(item->>'source_event_date','')::date,
          'ABC application observed; this is not confirmation of an opening.', item, item->>'content_hash')
        on conflict do nothing;
        event_total := event_total + 1;
      end if;
    elsif previous.current_content_hash is distinct from item->>'content_hash' then
      changed_total := changed_total + 1;
      if previous.type_status is distinct from item->>'type_status' then
        insert into ingest.abc_events (license_record_id, event_type, event_at, source_event_date, summary, evidence, evidence_hash)
        values (record_uuid, 'status_change', observed_at, nullif(item->>'source_event_date','')::date,
          format('ABC status changed from %s to %s.', previous.type_status, item->>'type_status'), item, item->>'content_hash')
        on conflict do nothing;
        event_total := event_total + 1;
      end if;
      if coalesce(previous.dba_name_raw,'') is distinct from coalesce(item->>'dba_name','') or coalesce(previous.primary_name_raw,'') is distinct from coalesce(item->>'primary_name','') then
        insert into ingest.abc_events (license_record_id, event_type, event_at, source_event_date, summary, evidence, evidence_hash)
        values (record_uuid, 'name_change', observed_at, nullif(item->>'source_event_date','')::date,
          'ABC business or DBA name changed.', item, item->>'content_hash') on conflict do nothing;
        event_total := event_total + 1;
      end if;
      if previous.address_id is distinct from address_uuid then
        insert into ingest.abc_events (license_record_id, event_type, event_at, source_event_date, summary, evidence, evidence_hash)
        values (record_uuid, 'address_change', observed_at, nullif(item->>'source_event_date','')::date,
          'ABC premise address or suite changed.', item, item->>'content_hash') on conflict do nothing;
        event_total := event_total + 1;
      end if;
    else
      unchanged_total := unchanged_total + 1;
    end if;
  end loop;

  update ingest.abc_ingestion_runs set
    inserted_count = inserted_total,
    changed_count = changed_total,
    unchanged_count = unchanged_total,
    event_count = event_total
  where id = run_id;

  return jsonb_build_object(
    'run_id', run_id, 'records', jsonb_array_length(payload->'records'), 'inserted', inserted_total,
    'changed', changed_total, 'unchanged', unchanged_total, 'events', event_total
  );
end;
$$;

revoke all on function public.ingest_abc_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_abc_snapshot(jsonb) to service_role;

alter table ingest.abc_ingestion_runs enable row level security;
alter table ingest.abc_source_snapshots enable row level security;
alter table ingest.business_identities enable row level security;
alter table ingest.business_addresses enable row level security;
alter table ingest.abc_license_records enable row level security;
alter table ingest.abc_license_revisions enable row level security;
alter table ingest.abc_events enable row level security;
alter table ingest.abc_property_candidates enable row level security;

create policy "Public can read ABC run health" on ingest.abc_ingestion_runs for select to anon, authenticated using (true);
create policy "Public can read ABC business names" on ingest.business_identities for select to anon, authenticated using (true);
create policy "Public can read ABC premise addresses" on ingest.business_addresses for select to anon, authenticated using (true);
create policy "Public can read current ABC records" on ingest.abc_license_records for select to anon, authenticated using (true);

create or replace view public.abc_business_signals_public
with (security_invoker = true)
as
select
  r.id,
  r.source_key,
  b.display_name,
  a.street_raw as address,
  a.suite_raw as suite,
  r.license_type,
  r.license_or_application,
  r.type_status as status,
  coalesce(r.original_issue_date, r.expiration_date) as source_date,
  r.first_seen_at,
  r.last_seen_at,
  r.last_status_change_at,
  r.source_url,
  case
    when r.license_or_application = 'APP' then 'Pending ABC application — not a confirmed opening.'
    else 'ABC license record — business activity and opening status require independent confirmation.'
  end as uncertainty_note,
  case
    when r.last_status_change_at is not null then 'recently_changed'
    when r.license_or_application = 'APP' then 'pending_application'
    else 'tracked_business'
  end as signal_kind
from ingest.abc_license_records r
join ingest.business_identities b on b.id = r.business_id
join ingest.business_addresses a on a.id = r.address_id;

create or replace view public.abc_ingestion_health_public
with (security_invoker = true)
as
select
  max(completed_at) filter (where status in ('succeeded','unchanged')) as last_successful_import_at,
  max(retrieved_at) filter (where status in ('succeeded','unchanged')) as data_retrieved_at,
  (select count(*)::integer from ingest.abc_license_records) as tracked_record_count
from ingest.abc_ingestion_runs;

grant select on public.abc_business_signals_public, public.abc_ingestion_health_public to anon, authenticated;
revoke all on all tables in schema ingest from public, anon, authenticated;
grant usage on schema ingest to anon, authenticated;
grant select on ingest.abc_ingestion_runs, ingest.business_identities, ingest.business_addresses, ingest.abc_license_records to anon, authenticated;
grant all on all tables in schema ingest to service_role;
