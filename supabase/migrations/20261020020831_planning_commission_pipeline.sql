-- Private operational evidence, including failed discovery and unresolved candidates.
create table ingest.planning_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);
alter table ingest.planning_ingestion_runs enable row level security;
revoke all on ingest.planning_ingestion_runs from public, anon, authenticated;
grant select, insert on ingest.planning_ingestion_runs to service_role;

create function public.record_planning_ingestion_run(payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare run_id uuid;
begin
  insert into ingest.planning_ingestion_runs(started_at,finished_at,report)
  values ((payload->>'started_at')::timestamptz,(payload->>'finished_at')::timestamptz,payload)
  returning id into run_id;
  return run_id;
end $$;
revoke all on function public.record_planning_ingestion_run(jsonb) from public, anon, authenticated;
grant execute on function public.record_planning_ingestion_run(jsonb) to service_role;

-- Atomic per document. Never creates projects or overwrites catalog status/source fields.
create function public.ingest_reviewed_planning_document(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  project_row public.projects;
  document_row ingest.planning_documents;
  source_uuid uuid;
  claim jsonb;
  milestone jsonb;
  claims_added integer := 0;
  events_added integer := 0;
  affected integer;
  document_added boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(638261492);
  select * into strict project_row from public.projects where slug = payload->>'project_slug';
  if pg_catalog.regexp_replace(pg_catalog.lower(project_row.name),'[^a-z0-9]','','g') <>
     pg_catalog.regexp_replace(pg_catalog.lower(payload->>'project_name'),'[^a-z0-9]','','g') then
    raise exception 'Project identity changed; re-match required';
  end if;
  if payload->'review'->>'sha256' is distinct from payload->>'sha256' or
     payload->'review'->>'project_slug' is distinct from project_row.slug then
    raise exception 'Missing checksum-bound review';
  end if;
  select id into strict source_uuid from public.sources where slug = 'carlsbad-planning';
  select * into document_row from ingest.planning_documents where file_url = payload->>'file_url';
  if found and (document_row.sha256 <> payload->>'sha256' or document_row.project_id <> project_row.id) then
    raise exception 'Existing document content/identity differs; manual review required';
  end if;
  if document_row.id is null then
    insert into ingest.planning_documents(project_id,source_page_url,file_url,title,document_type,published_at,retrieved_at,sha256,page_count,extraction_method,review_status,evidence_note)
    values(project_row.id,payload->>'source_page_url',payload->>'file_url',payload->>'title',payload->>'document_type',
      (payload->>'published_at')::date,(payload->>'retrieved_at')::timestamptz,payload->>'sha256',(payload->>'page_count')::integer,
      'embedded_text','reviewed','Checksum-bound source manifest review; individual claims retain supporting page citations.')
    returning * into document_row;
    document_added := true;
  end if;
  for claim in select * from pg_catalog.jsonb_array_elements(payload->'review'->'claims') loop
    if (claim->>'page_number')::integer not between 1 and document_row.page_count or length(claim->>'evidence_text') < 3 then
      raise exception 'Invalid evidence page/text';
    end if;
    insert into ingest.planning_document_claims(document_id,claim_key,claim_label,claim_value,value_kind,page_number,evidence_text,extraction_method,confidence,reviewed_at)
    values(document_row.id,claim->>'claim_key',claim->>'claim_label',claim->>'claim_value',claim->>'value_kind',
      (claim->>'page_number')::integer,claim->>'evidence_text','manual',1,now())
    on conflict(document_id,claim_key) do nothing;
    get diagnostics affected = row_count;
    claims_added := claims_added + affected;
  end loop;
  for milestone in select * from pg_catalog.jsonb_array_elements(payload->'review'->'events') loop
    if milestone->>'event_type' not in ('hearing_scheduled','approved','continued','denied','ceqa_exemption_posted') or
       coalesce(length(milestone->>'review_note'),0) < 3 or
       (milestone->>'page_number')::integer not between 1 and document_row.page_count then
      raise exception 'Invalid reviewed milestone';
    end if;
    insert into public.project_events(project_id,event_type,event_date,summary,source_id,source_url,first_seen_at)
    values(project_row.id,milestone->>'event_type',(milestone->>'event_date')::date,
      (milestone->>'summary') || ' [PDF p. ' || (milestone->>'page_number') || '; ' || (milestone->>'review_note') || ']',
      source_uuid,payload->>'file_url',(payload->>'retrieved_at')::timestamptz)
    on conflict(project_id,event_type,event_date,source_url) do nothing;
    get diagnostics affected = row_count;
    events_added := events_added + affected;
  end loop;
  return pg_catalog.jsonb_build_object('project_slug',project_row.slug,'document_added',document_added,'claims_added',claims_added,'events_added',events_added);
end $$;
revoke all on function public.ingest_reviewed_planning_document(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_reviewed_planning_document(jsonb) to service_role;
