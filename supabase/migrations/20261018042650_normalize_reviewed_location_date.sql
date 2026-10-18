update ingest.reviewed_location_matches
set reviewed_at = '2026-10-17 12:00:00+00',
    updated_at = now()
where source_name = 'SanGIS ADDRAPN'
  and reviewed_at = '2026-10-17 00:00:00+00';

do $$
begin
  if (select count(*) from ingest.reviewed_location_matches
      where source_name = 'SanGIS ADDRAPN'
        and reviewed_at = '2026-10-17 12:00:00+00') <> 9 then
    raise exception 'Expected exactly 9 reviewed SanGIS premise matches dated October 17';
  end if;
end
$$;
