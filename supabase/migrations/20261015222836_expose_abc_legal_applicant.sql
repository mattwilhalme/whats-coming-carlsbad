-- Publish the legal entity named on the ABC application so the public UI can
-- distinguish the customer-facing DBA from the applicant behind the filing.
create or replace view public.abc_business_signals_public
with (security_invoker = true)
as
with snapshot_bounds as (
  select
    min(retrieved_at) filter (where status in ('succeeded','unchanged')) as baseline_retrieved_at,
    max(retrieved_at) filter (where status in ('succeeded','unchanged')) as latest_retrieved_at
  from ingest.abc_ingestion_runs
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
  nullif(trim(b.legal_name), '') as legal_applicant
from ingest.abc_license_records r
join ingest.business_identities b on b.id = r.business_id
join ingest.business_addresses a on a.id = r.address_id
cross join snapshot_bounds bounds
where
  r.last_seen_at = bounds.latest_retrieved_at
  and r.license_or_application = 'APP'
  and r.type_status = 'PEND';

grant select on public.abc_business_signals_public to anon, authenticated;
