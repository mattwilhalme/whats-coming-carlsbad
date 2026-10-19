create table ingest.planning_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_page_url text not null,
  file_url text not null unique,
  title text not null,
  document_type text not null check (document_type in (
    'agenda_packet', 'staff_report', 'public_notice', 'notice_of_determination',
    'notice_of_exemption', 'environmental_document', 'minutes', 'resolution', 'other'
  )),
  published_at date,
  retrieved_at timestamptz not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer not null check (page_count > 0),
  extraction_method text not null check (extraction_method in ('embedded_text', 'ocr', 'mixed')),
  review_status text not null check (review_status in ('pending', 'reviewed', 'rejected')),
  evidence_note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingest.planning_document_claims (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references ingest.planning_documents(id) on delete cascade,
  claim_key text not null,
  claim_label text not null,
  claim_value text not null,
  value_kind text not null check (value_kind in ('text', 'integer', 'date', 'boolean')),
  page_number integer not null check (page_number > 0),
  evidence_text text not null,
  extraction_method text not null check (extraction_method in ('embedded_text', 'ocr', 'manual')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, claim_key)
);

create index planning_documents_project_id_idx on ingest.planning_documents(project_id);
create index planning_document_claims_document_id_idx on ingest.planning_document_claims(document_id);

alter table ingest.planning_documents enable row level security;
alter table ingest.planning_document_claims enable row level security;

grant usage on schema ingest to anon, authenticated, service_role;

create policy "Public can read reviewed planning document metadata"
on ingest.planning_documents for select
to anon, authenticated
using (review_status = 'reviewed');

create policy "Public can read reviewed planning document claims"
on ingest.planning_document_claims for select
to anon, authenticated
using (reviewed_at is not null);

revoke all on ingest.planning_documents, ingest.planning_document_claims from public, anon, authenticated;
grant select (
  id, project_id, source_page_url, file_url, title, document_type, published_at,
  retrieved_at, sha256, page_count, extraction_method, review_status, evidence_note
) on ingest.planning_documents to anon, authenticated;
grant select (
  id, document_id, claim_key, claim_label, claim_value, value_kind,
  page_number, extraction_method, confidence, reviewed_at
) on ingest.planning_document_claims to anon, authenticated;
grant all on ingest.planning_documents, ingest.planning_document_claims to service_role;

insert into ingest.planning_documents (
  project_id, source_page_url, file_url, title, document_type, published_at,
  retrieved_at, sha256, page_count, extraction_method, review_status, evidence_note
)
select
  p.id,
  'https://ceqanet.lci.ca.gov/2026030432/3',
  'https://ceqanet.lci.ca.gov/2026030432/3/Attachment/-Yz6ar',
  'Salk Avenue Apartments Notice of Determination',
  'notice_of_determination',
  '2026-06-05',
  '2026-10-19 15:33:00+00',
  '2785fee5ad8c24d7aa71b33e0bfc3388e1538df5e61e08d1eb7380a8d370b518',
  2,
  'mixed',
  'reviewed',
  'Downloaded from the official CEQAnet attachment endpoint. Both pages were rendered and reviewed; public claims below cite the supporting page.'
from public.projects p
where p.slug = 'salk-avenue-apartments'
on conflict (file_url) do update set
  project_id = excluded.project_id,
  source_page_url = excluded.source_page_url,
  title = excluded.title,
  document_type = excluded.document_type,
  published_at = excluded.published_at,
  retrieved_at = excluded.retrieved_at,
  sha256 = excluded.sha256,
  page_count = excluded.page_count,
  extraction_method = excluded.extraction_method,
  review_status = excluded.review_status,
  evidence_note = excluded.evidence_note,
  updated_at = now();

with document as (
  select id from ingest.planning_documents
  where file_url = 'https://ceqanet.lci.ca.gov/2026030432/3/Attachment/-Yz6ar'
), claims (claim_key, claim_label, claim_value, value_kind, page_number, evidence_text) as (values
  ('decision_outcome', 'Decision', 'City of Carlsbad approved the project', 'text', 2, 'The City of Carlsbad (Lead Agency) has approved the above described project on June 3, 2026.'),
  ('decision_date', 'Decision date', '2026-06-03', 'date', 2, 'The City of Carlsbad (Lead Agency) has approved the above described project on June 3, 2026.'),
  ('project_location', 'Location', 'South of Salk Avenue between College Boulevard and El Camino Real', 'text', 2, 'Project Location: South of Salk Avenue between College Boulevard and El Camino Real, in the City of Carlsbad.'),
  ('proposed_units', 'Homes', '397', 'integer', 2, 'The Project proposes to develop 397 multifamily residential dwelling units.'),
  ('affordable_units', 'Low-income homes', '59', 'integer', 2, '59 of which are noted as being restricted to Low-Income households.'),
  ('ceqa_document', 'CEQA document', 'Negative Declaration', 'text', 2, 'A Negative Declaration was prepared for this project pursuant to the provisions of CEQA.'),
  ('mitigation_required', 'Mitigation', 'Required as a condition of approval', 'text', 2, 'Mitigation measures were made a condition of the approval of the project.')
)
insert into ingest.planning_document_claims (
  document_id, claim_key, claim_label, claim_value, value_kind, page_number,
  evidence_text, extraction_method, confidence, reviewed_at
)
select
  document.id, claims.claim_key, claims.claim_label, claims.claim_value,
  claims.value_kind, claims.page_number, claims.evidence_text,
  'manual', 1, '2026-10-19 15:33:00+00'
from document cross join claims
on conflict (document_id, claim_key) do update set
  claim_label = excluded.claim_label,
  claim_value = excluded.claim_value,
  value_kind = excluded.value_kind,
  page_number = excluded.page_number,
  evidence_text = excluded.evidence_text,
  extraction_method = excluded.extraction_method,
  confidence = excluded.confidence,
  reviewed_at = excluded.reviewed_at;

do $$
begin
  if (select count(*) from ingest.planning_documents where review_status = 'reviewed') < 1 then
    raise exception 'Expected at least one reviewed planning document';
  end if;
  if (select count(*) from ingest.planning_document_claims where reviewed_at is not null) < 7 then
    raise exception 'Expected seven reviewed Salk Avenue claims';
  end if;
end
$$;

create view public.project_document_evidence_public
with (security_invoker = true)
as
select
  p.id as project_id,
  p.slug as project_slug,
  d.id as document_id,
  d.title as document_title,
  d.document_type,
  d.published_at,
  d.source_page_url,
  d.file_url,
  d.page_count,
  d.evidence_note,
  c.claim_key,
  c.claim_label,
  c.claim_value,
  c.value_kind,
  c.page_number,
  c.confidence,
  c.reviewed_at
from public.projects p
join ingest.planning_documents d on d.project_id = p.id and d.review_status = 'reviewed'
join ingest.planning_document_claims c on c.document_id = d.id and c.reviewed_at is not null;

grant select on public.project_document_evidence_public to anon, authenticated;
