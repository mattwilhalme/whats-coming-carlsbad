create table ingest.reviewed_location_matches (
  id uuid primary key default gen_random_uuid(),
  address_id uuid not null references ingest.business_addresses(id) on delete cascade,
  source_name text not null,
  source_url text not null,
  source_record_id text,
  apn text not null check (apn ~ '^[0-9]+$'),
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  match_method text not null check (match_method in ('exact_normalized_street')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  review_note text not null,
  reviewed_at timestamptz not null,
  reviewed_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (address_id, source_name)
);

create index reviewed_location_matches_address_id_idx
  on ingest.reviewed_location_matches(address_id);

alter table ingest.reviewed_location_matches enable row level security;

create policy "Public can read reviewed location evidence"
on ingest.reviewed_location_matches for select
to anon, authenticated
using (true);

revoke all on ingest.reviewed_location_matches from public, anon, authenticated;
grant select (
  address_id, source_name, source_url, source_record_id, apn,
  longitude, latitude, match_method, confidence, review_note, reviewed_at
) on ingest.reviewed_location_matches to anon, authenticated;
grant all on ingest.reviewed_location_matches to service_role;

with location_seed (
  address_key, source_record_id, apn, longitude, latitude
) as (values
  ('264 CARLSBAD VILLAGE DR||CARLSBAD', '175096', '2032321600', -117.35167718387284, 33.15814050645088),
  ('2609 SUTTER ST||CARLSBAD', null, '1675113100', -117.31331169152601, 33.16150620119606),
  ('2958 MADISON ST|STE 100|CARLSBAD', null, '2033032400', -117.3468503768923, 33.16152347013818),
  ('2225 CAMINO VIDA ROBLE|STE 100|CARLSBAD', '403339', '2130502400', -117.27276972545451, 33.11852833189627),
  ('2727 ROOSEVELT ST|A|CARLSBAD', '384292', '2031013400', -117.35008754023919, 33.16270483899926),
  ('5970 AVENIDA ENCINAS||CARLSBAD', null, '2101702200', -117.32415801274942, 33.12400155866187),
  ('7150 AVENIDA ENCINAS||CARLSBAD', null, '2144302400', -117.31167530827456, 33.10038199772733),
  ('7180 AVENIDA ENCINAS|STE 100|CARLSBAD', null, '2144301900', -117.30959853091586, 33.10036265018028),
  ('2225 CAMINO VIDA ROBLE|100|CARLSBAD', '403339', '2130502400', -117.27276972545451, 33.11852833189627)
)
insert into ingest.reviewed_location_matches (
  address_id, source_name, source_url, source_record_id, apn,
  longitude, latitude, match_method, confidence, review_note, reviewed_at, reviewed_by
)
select
  a.id,
  'SanGIS ADDRAPN',
  'https://gis-public.sandiegocounty.gov/arcgis/rest/services/sdep_warehouse/ADDRAPN/FeatureServer/0',
  s.source_record_id,
  s.apn,
  s.longitude,
  s.latitude,
  'exact_normalized_street',
  1,
  'Exact normalized street-address match to one SanGIS address point and one APN. This verifies the point and parcel candidate, not the suite, building, tenant identity, or opening outcome.',
  '2026-10-17 00:00:00+00',
  'reviewed-sangis-pilot-2026-10-17'
from location_seed s
join ingest.business_addresses a on a.address_key = s.address_key
on conflict (address_id, source_name) do update set
  source_url = excluded.source_url,
  source_record_id = excluded.source_record_id,
  apn = excluded.apn,
  longitude = excluded.longitude,
  latitude = excluded.latitude,
  match_method = excluded.match_method,
  confidence = excluded.confidence,
  review_note = excluded.review_note,
  reviewed_at = excluded.reviewed_at,
  reviewed_by = excluded.reviewed_by,
  updated_at = now();

do $$
begin
  if (select count(*) from ingest.reviewed_location_matches where source_name = 'SanGIS ADDRAPN') <> 9 then
    raise exception 'Expected exactly 9 reviewed SanGIS premise matches';
  end if;
end
$$;

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
  end as dehq_match_level,
  location.latitude,
  location.longitude,
  location.apn,
  location.source_url as location_source_url,
  location.match_method as location_match_method,
  location.confidence as location_confidence,
  location.review_note as location_review_note,
  location.reviewed_at as location_reviewed_at
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
left join ingest.reviewed_location_matches location on location.address_id = a.id
where r.last_seen_at = bounds.latest_retrieved_at
  and r.license_or_application = 'APP'
  and r.type_status = 'PEND';

grant select on public.abc_business_signals_public to anon, authenticated;
