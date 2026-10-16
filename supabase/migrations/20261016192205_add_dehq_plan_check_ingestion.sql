create table ingest.dehq_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  status text not null check (status in ('succeeded','failed')),
  retrieved_at timestamptz not null,
  search_start_date date not null,
  search_end_date date not null,
  source_record_count integer not null check (source_record_count >= 0),
  filtered_record_count integer not null check (filtered_record_count >= 0),
  upserted_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table ingest.dehq_plan_records (
  record_number text primary key,
  opened_date date not null,
  record_type text not null,
  project_name text not null,
  project_name_normalized text not null,
  status text not null,
  detail_url text not null,
  address_raw text not null,
  street_raw text not null,
  suite_raw text,
  street_normalized text not null,
  suite_normalized text,
  city text not null,
  state text not null,
  postal_code text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dehq_runs_retrieved_idx on ingest.dehq_ingestion_runs (retrieved_at desc);
create index dehq_records_address_idx on ingest.dehq_plan_records (street_normalized, city, opened_date desc);
create index dehq_records_name_idx on ingest.dehq_plan_records (project_name_normalized);

create or replace function public.ingest_dehq_snapshot(payload jsonb)
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
    insert into ingest.dehq_plan_records (
      record_number, opened_date, record_type, project_name, project_name_normalized,
      status, detail_url, address_raw, street_raw, suite_raw, street_normalized,
      suite_normalized, city, state, postal_code, first_seen_at, last_seen_at
    ) values (
      item->>'record_number', (item->>'opened_date')::date, item->>'record_type',
      item->>'project_name', item->>'project_name_normalized', item->>'status',
      item->>'detail_url', item->>'address_raw', item->>'street', nullif(item->>'suite',''),
      item->>'street_normalized', nullif(item->>'suite_normalized',''), item->>'city',
      item->>'state', nullif(item->>'postal_code',''), observed_at, observed_at
    ) on conflict (record_number) do update set
      opened_date = excluded.opened_date,
      record_type = excluded.record_type,
      project_name = excluded.project_name,
      project_name_normalized = excluded.project_name_normalized,
      status = excluded.status,
      detail_url = excluded.detail_url,
      address_raw = excluded.address_raw,
      street_raw = excluded.street_raw,
      suite_raw = excluded.suite_raw,
      street_normalized = excluded.street_normalized,
      suite_normalized = excluded.suite_normalized,
      city = excluded.city,
      state = excluded.state,
      postal_code = excluded.postal_code,
      last_seen_at = excluded.last_seen_at,
      updated_at = now();
    upserted_total := upserted_total + 1;
  end loop;

  insert into ingest.dehq_ingestion_runs (
    source_url, started_at, status, retrieved_at, search_start_date, search_end_date,
    source_record_count, filtered_record_count, upserted_count
  ) values (
    payload->>'source_url', (payload->>'started_at')::timestamptz, 'succeeded', observed_at,
    (payload->>'start_date')::date, (payload->>'end_date')::date,
    (payload->>'source_record_count')::integer, jsonb_array_length(payload->'records'), upserted_total
  );

  return jsonb_build_object('records', upserted_total, 'retrieved_at', observed_at);
end;
$$;

revoke all on function public.ingest_dehq_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_dehq_snapshot(jsonb) to service_role;

alter table ingest.dehq_ingestion_runs enable row level security;
alter table ingest.dehq_plan_records enable row level security;

create policy "Public can read cleaned DEHQ plan records"
on ingest.dehq_plan_records for select
to anon, authenticated
using (true);

revoke all on ingest.dehq_ingestion_runs, ingest.dehq_plan_records from public, anon, authenticated;
grant select on ingest.dehq_plan_records to anon, authenticated;
grant all on ingest.dehq_ingestion_runs, ingest.dehq_plan_records to service_role;

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
  case when r.last_status_change_at >= now() - interval '90 days' then 'recently_changed' else 'pending_application' end as signal_kind,
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
    nullif(trim(a.city), ''), concat_ws(' ', nullif(trim(a.state), ''), nullif(trim(a.postal_code), ''))
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
  end as county_match_level,
  dehq.record_number as dehq_record_number,
  dehq.project_name as dehq_project_name,
  dehq.record_type as dehq_record_type,
  dehq.status as dehq_status,
  dehq.opened_date as dehq_opened_date,
  dehq.detail_url as dehq_source_url,
  case
    when dehq.record_number is null then null
    when regexp_replace(dehq.project_name_normalized, '[^A-Z0-9]', '', 'g') in (
      regexp_replace(upper(b.display_name), '[^A-Z0-9]', '', 'g'),
      regexp_replace(upper(coalesce(b.legal_name,'')), '[^A-Z0-9]', '', 'g')
    ) then 'name_and_address'
    else 'address_only'
  end as dehq_match_level
from ingest.abc_license_records r
join ingest.business_identities b on b.id = r.business_id
join ingest.business_addresses a on a.id = r.address_id
cross join snapshot_bounds bounds
cross join county_bounds
left join lateral (
  select f.* from ingest.county_food_facilities f
  where f.last_seen_at = county_bounds.latest_retrieved_at
    and f.address_normalized = a.street_normalized and upper(f.city) = upper(a.city)
  order by
    case when regexp_replace(f.record_name_normalized, '[^A-Z0-9]', '', 'g') in (
      regexp_replace(upper(b.display_name), '[^A-Z0-9]', '', 'g'),
      regexp_replace(upper(coalesce(b.legal_name,'')), '[^A-Z0-9]', '', 'g')
    ) then 0 else 1 end,
    case when f.active_permit = 'A' then 0 else 1 end,
    f.source_updated_at desc nulls last
  limit 1
) county on true
left join lateral (
  select d.* from ingest.dehq_plan_records d
  where d.street_normalized = a.street_normalized and upper(d.city) = upper(a.city)
  order by
    case when regexp_replace(d.project_name_normalized, '[^A-Z0-9]', '', 'g') in (
      regexp_replace(upper(b.display_name), '[^A-Z0-9]', '', 'g'),
      regexp_replace(upper(coalesce(b.legal_name,'')), '[^A-Z0-9]', '', 'g')
    ) then 0 else 1 end,
    case when coalesce(d.suite_normalized,'') = coalesce(a.suite_normalized,'') then 0 else 1 end,
    d.opened_date desc
  limit 1
) dehq on true
where r.last_seen_at = bounds.latest_retrieved_at
  and r.license_or_application = 'APP'
  and r.type_status = 'PEND';

grant select on public.abc_business_signals_public to anon, authenticated;
