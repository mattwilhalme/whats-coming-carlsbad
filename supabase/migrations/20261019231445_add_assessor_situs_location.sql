alter table ingest.reviewed_location_matches
  drop constraint reviewed_location_matches_match_method_check;

alter table ingest.reviewed_location_matches
  add constraint reviewed_location_matches_match_method_check
  check (match_method in ('exact_normalized_street', 'exact_assessor_situs'));

insert into ingest.reviewed_location_matches (
  address_id, source_name, source_url, source_record_id, apn,
  longitude, latitude, match_method, confidence, review_note, reviewed_at, reviewed_by
)
select
  a.id,
  'San Diego County Assessor Parcels',
  'https://gis-public.sandiegocounty.gov/arcgis/rest/services/WorkflowLayers/FeatureServer/0',
  '22360',
  '2032971000',
  -117.3477100170132,
  33.158870570449892,
  'exact_assessor_situs',
  1,
  'Exact assessor situs match for 3088 State Street. Coordinates are the parcel centroid; this verifies the parcel candidate, not the suite, tenant identity, or opening outcome.',
  '2026-10-19 23:12:56+00',
  'reviewed-assessor-situs-2026-10-19'
from ingest.business_addresses a
where a.address_key = '3088 STATE ST|STE 100|CARLSBAD'
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
  if not exists (
    select 1 from ingest.reviewed_location_matches
    where apn = '2032971000' and match_method = 'exact_assessor_situs'
  ) then
    raise exception 'Expected reviewed 3088 State Street assessor situs match';
  end if;
end
$$;
