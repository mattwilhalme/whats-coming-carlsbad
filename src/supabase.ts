import { createClient } from "@supabase/supabase-js";
import type { Project } from "./types";

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
