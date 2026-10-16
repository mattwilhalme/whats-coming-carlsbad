create table ingest.county_food_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  status text not null check (status in ('succeeded','failed')),
  retrieved_at timestamptz not null,
  source_record_count integer not null check (source_record_count >= 0),
  filtered_record_count integer not null check (filtered_record_count >= 0),
  upserted_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table ingest.county_food_facilities (
  record_id text primary key,
  source_row_id text,
  record_name text not null,
  record_name_normalized text not null,
  permit_status text,
  active_permit text,
  business_type text,
  address_raw text not null,
  address_normalized text not null,
  city text not null,
  state text,
  postal_code text,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index county_food_runs_retrieved_idx on ingest.county_food_ingestion_runs (retrieved_at desc);
create index county_food_facilities_address_idx on ingest.county_food_facilities (address_normalized, city);
create index county_food_facilities_name_idx on ingest.county_food_facilities (record_name_normalized);

create or replace function public.ingest_county_food_snapshot(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ingest, pg_temp
as $$
declare
  item jsonb;
  observed_at timestamptz := (payload->>'retrieved_at')::timestamptz;
  upserted_total integer := 0;
begin
  for item in select value from jsonb_array_elements(payload->'records') loop
    insert into ingest.county_food_facilities (
      record_id, source_row_id, record_name, record_name_normalized, permit_status,
      active_permit, business_type, address_raw, address_normalized, city, state,
      postal_code, source_updated_at, first_seen_at, last_seen_at, source_url
    ) values (
      item->>'record_id', nullif(item->>'source_row_id',''), item->>'record_name',
      item->>'record_name_normalized', nullif(item->>'permit_status',''),
      nullif(item->>'active_permit',''), nullif(item->>'business_type',''),
      item->>'address', item->>'address_normalized', item->>'city',
      nullif(item->>'state',''), nullif(item->>'zip',''),
      nullif(item->>'source_updated_at','')::timestamptz, observed_at, observed_at,
      payload->>'source_url'
    ) on conflict (record_id) do update set
      source_row_id = excluded.source_row_id,
      record_name = excluded.record_name,
      record_name_normalized = excluded.record_name_normalized,
      permit_status = excluded.permit_status,
      active_permit = excluded.active_permit,
      business_type = excluded.business_type,
      address_raw = excluded.address_raw,
      address_normalized = excluded.address_normalized,
      city = excluded.city,
      state = excluded.state,
      postal_code = excluded.postal_code,
      source_updated_at = excluded.source_updated_at,
      last_seen_at = excluded.last_seen_at,
      source_url = excluded.source_url,
      updated_at = now();
    upserted_total := upserted_total + 1;
  end loop;

  insert into ingest.county_food_ingestion_runs (
    source_url, started_at, status, retrieved_at, source_record_count,
    filtered_record_count, upserted_count
  ) values (
    payload->>'source_url', (payload->>'started_at')::timestamptz, 'succeeded',
    observed_at, (payload->>'source_record_count')::integer,
    jsonb_array_length(payload->'records'), upserted_total
  );

  return jsonb_build_object('records', upserted_total, 'retrieved_at', observed_at);
end;
$$;

revoke all on function public.ingest_county_food_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_county_food_snapshot(jsonb) to service_role;

alter table ingest.county_food_ingestion_runs enable row level security;
alter table ingest.county_food_facilities enable row level security;

revoke all on ingest.county_food_ingestion_runs, ingest.county_food_facilities from public, anon, authenticated;
grant all on ingest.county_food_ingestion_runs, ingest.county_food_facilities to service_role;

create or replace view public.abc_business_signals_public
with (security_invoker = true)
as
with snapshot_bounds as (
  select
    min(retrieved_at) filter (where status in ('succeeded','unchanged')) as baseline_retrieved_at,
    max(retrieved_at) filter (where status in ('succeeded','unchanged')) as latest_retrieved_at
  from ingest.abc_ingestion_runs
), county_bounds as (
  select max(retrieved_at) as latest_retrieved_at
  from ingest.county_food_ingestion_runs
  where status = 'succeeded'
)
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
    when r.last_status_change_at >= now() - interval '90 days'
      then 'ABC status changed recently; opening or development activity still requires independent confirmation.'
    when r.first_seen_at > bounds.baseline_retrieved_at
      then 'Newly observed APP/PEND record in the current ABC export; not a confirmed opening.'
    else 'APP/PEND record present in the initial baseline; its original filing date is unknown and it may be longstanding.'
  end as uncertainty_note,
  case
    when r.last_status_change_at >= now() - interval '90 days' then 'recently_changed'
    else 'pending_application'
  end as signal_kind,
  (r.first_seen_at <= bounds.baseline_retrieved_at) as is_baseline,
  case
    when r.last_status_change_at >= now() - interval '90 days' then 'changed'
    when r.first_seen_at > bounds.baseline_retrieved_at then 'new_pending'
    else 'baseline_pending'
  end as evidence_level,
  nullif(trim(b.legal_name), '') as legal_applicant,
  a.city,
  a.state,
  a.postal_code,
  concat_ws(', ',
    concat_ws(' ', nullif(trim(a.street_raw), ''), nullif(trim(a.suite_raw), '')),
    nullif(trim(a.city), ''),
    concat_ws(' ', nullif(trim(a.state), ''), nullif(trim(a.postal_code), ''))
  ) as full_address,
  county.record_id as county_record_id,
  county.record_name as county_facility_name,
  county.permit_status as county_permit_status,
  county.active_permit as county_active_permit,
  county.source_updated_at as county_source_updated_at,
  county.source_url as county_source_url,
  case
    when county.record_id is null then null
    when regexp_replace(county.record_name_normalized, '[^A-Z0-9]', '', 'g') in (
      regexp_replace(upper(b.display_name), '[^A-Z0-9]', '', 'g'),
      regexp_replace(upper(coalesce(b.legal_name,'')), '[^A-Z0-9]', '', 'g')
    ) then 'name_and_address'
    else 'address_only'
  end as county_match_level
from ingest.abc_license_records r
join ingest.business_identities b on b.id = r.business_id
join ingest.business_addresses a on a.id = r.address_id
cross join snapshot_bounds bounds
cross join county_bounds
left join lateral (
  select f.*
  from ingest.county_food_facilities f
  where f.last_seen_at = county_bounds.latest_retrieved_at
    and f.address_normalized = a.street_normalized
    and upper(f.city) = upper(a.city)
  order by
    case when regexp_replace(f.record_name_normalized, '[^A-Z0-9]', '', 'g') in (
      regexp_replace(upper(b.display_name), '[^A-Z0-9]', '', 'g'),
      regexp_replace(upper(coalesce(b.legal_name,'')), '[^A-Z0-9]', '', 'g')
    ) then 0 else 1 end,
    case when f.active_permit = 'A' then 0 else 1 end,
    f.source_updated_at desc nulls last
  limit 1
) county on true
where
  r.last_seen_at = bounds.latest_retrieved_at
  and r.license_or_application = 'APP'
  and r.type_status = 'PEND';

grant select on public.abc_business_signals_public to anon, authenticated;
