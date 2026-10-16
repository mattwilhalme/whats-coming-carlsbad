import { createClient } from "@supabase/supabase-js";
import type { BusinessSignal, IngestionHealth, Project } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(url && key);
const client = isSupabaseConfigured ? createClient(url!, key!) : null;

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  category: Project["category"];
  location_text: string;
  proposed_units: number | null;
  affordable_units: number | null;
  commercial_sqft: number | null;
  current_status: string;
  status_as_of: string;
  source_label: string;
  source_url: string;
};

export async function loadProjects(): Promise<Project[] | null> {
  if (!client) return null;
  const { data, error } = await client.from("projects_public").select("*").order("status_as_of", { ascending: false }).limit(100);
  if (error) throw error;
  return (data as ProjectRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    locationText: row.location_text,
    proposedUnits: row.proposed_units,
    affordableUnits: row.affordable_units,
    commercialSqft: row.commercial_sqft,
    status: row.current_status,
    statusAsOf: row.status_as_of,
    evidenceLabel: row.source_label,
    sourceUrl: row.source_url
  }));
}

type SignalRow = {
  id: string;
  display_name: string;
  legal_applicant: string | null;
  address: string;
  suite: string | null;
  full_address: string;
  license_type: string;
  license_or_application: string;
  status: string;
  source_date: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source_url: string;
  uncertainty_note: string;
  signal_kind: BusinessSignal["signalKind"];
  evidence_level: BusinessSignal["evidenceLevel"];
  is_baseline: boolean;
  county_record_id: string | null;
  county_facility_name: string | null;
  county_permit_status: string | null;
  county_active_permit: string | null;
  county_source_updated_at: string | null;
  county_source_url: string | null;
  county_match_level: "name_and_address" | "address_only" | null;
  dehq_record_number: string | null;
  dehq_project_name: string | null;
  dehq_record_type: string | null;
  dehq_status: string | null;
  dehq_opened_date: string | null;
  dehq_source_url: string | null;
  dehq_match_level: "name_and_address" | "address_only" | null;
};

export async function loadBusinessSignals(): Promise<BusinessSignal[]> {
  if (!client) return [];
  const { data, error } = await client.from("abc_business_signals_public").select("*").order("first_seen_at", { ascending: false }).limit(500);
  if (error) throw error;
  const grouped = new Map<string, BusinessSignal>();
  for (const row of data as SignalRow[]) {
    const key = `${row.display_name}|${row.legal_applicant ?? ""}|${row.address}|${row.suite ?? ""}|${row.status}`;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.licenseTypes.includes(row.license_type)) existing.licenseTypes.push(row.license_type);
      continue;
    }
    grouped.set(key, {
      id: row.id,
      displayName: row.display_name,
      legalApplicant: row.legal_applicant,
      address: row.address,
      suite: row.suite,
      fullAddress: row.full_address,
      licenseTypes: [row.license_type],
      licenseOrApplication: row.license_or_application,
      status: row.status,
      sourceDate: row.source_date,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      signalKind: row.signal_kind,
      evidenceLevel: row.evidence_level,
      isBaseline: row.is_baseline,
      uncertaintyNote: row.uncertainty_note,
      sourceUrl: row.source_url,
      countyCheck: row.county_record_id && row.county_facility_name && row.county_source_url && row.county_match_level ? {
        recordId: row.county_record_id,
        facilityName: row.county_facility_name,
        permitStatus: row.county_permit_status,
        activePermit: row.county_active_permit,
        sourceUpdatedAt: row.county_source_updated_at,
        sourceUrl: row.county_source_url,
        matchLevel: row.county_match_level
      } : null,
      dehqCheck: row.dehq_record_number && row.dehq_project_name && row.dehq_record_type && row.dehq_status && row.dehq_opened_date && row.dehq_source_url && row.dehq_match_level ? {
        recordNumber: row.dehq_record_number,
        projectName: row.dehq_project_name,
        recordType: row.dehq_record_type,
        status: row.dehq_status,
        openedDate: row.dehq_opened_date,
        sourceUrl: row.dehq_source_url,
        matchLevel: row.dehq_match_level
      } : null
    });
  }
  return [...grouped.values()];
}

export async function loadIngestionHealth(): Promise<IngestionHealth | null> {
  if (!client) return null;
  const { data, error } = await client.from("abc_ingestion_health_public").select("*").maybeSingle();
  if (error) throw error;
  return data ? {
    lastSuccessfulImportAt: data.last_successful_import_at,
    dataRetrievedAt: data.data_retrieved_at,
    trackedRecordCount: data.tracked_record_count ?? 0
  } : null;
}
