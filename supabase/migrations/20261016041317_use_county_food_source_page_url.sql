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
      coalesce(nullif(payload->>'source_page_url',''), payload->>'source_url')
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
