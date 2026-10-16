create policy "Public can read County food run health"
on ingest.county_food_ingestion_runs for select
to anon, authenticated
using (true);

create policy "Public can read cleaned County food facilities"
on ingest.county_food_facilities for select
to anon, authenticated
using (true);

grant select on ingest.county_food_ingestion_runs, ingest.county_food_facilities to anon, authenticated;
