import { createHash } from "node:crypto";
import { normalizeName, normalizeStreet, normalizeText } from "../abc/normalize.mjs";

export const COUNTY_FOOD_URL = "https://internal-sandiegocounty.data.socrata.com/resource/c5ez-ufrd.json?$limit=50000";
export const COUNTY_FOOD_PAGE_URL = "https://data.sandiegocounty.gov/widgets/c5ez-ufrd";

export function collectCountyRows(rows, { city = "Carlsbad" } = {}) {
  const selectedCity = normalizeName(city);
  const warnings = [];
  const records = [];
  for (const row of rows) {
    if (normalizeName(row.city) !== selectedCity) continue;
    const recordId = normalizeText(row.record_id);
    const recordName = normalizeText(row.record_name);
    const address = normalizeText(row.address);
    if (!recordId || !recordName || !address) {
      warnings.push({ record_id: recordId || null, reason: "missing stable identifier, facility name, or address" });
      continue;
    }
    records.push({
      record_id: recordId,
      source_row_id: normalizeText(row.id),
      record_name: recordName,
      record_name_normalized: normalizeName(recordName),
      permit_status: normalizeText(row.permit_status),
      active_permit: normalizeText(row.active_permit).toUpperCase(),
      business_type: normalizeText(row.business_type),
      address,
      address_normalized: normalizeStreet(address),
      city: normalizeText(row.city),
      state: normalizeText(row.state),
      zip: normalizeText(row.zip),
      source_updated_at: normalizeText(row.last_updated)
    });
  }
  const deduplicated = new Map(records.map((record) => [record.record_id, record]));
  return { sourceRecordCount: rows.length, records: [...deduplicated.values()].sort((a, b) => a.record_id.localeCompare(b.record_id)), warnings };
}

export function validateCountyCollection(result, { minimumSourceRecords = 1000, minimumFilteredRecords = 100 } = {}) {
  if (result.sourceRecordCount < minimumSourceRecords) throw new Error(`County export appears incomplete: ${result.sourceRecordCount} source records`);
  if (result.records.length < minimumFilteredRecords) throw new Error(`County export has too few records for the selected city: ${result.records.length}`);
  return true;
}

export async function downloadCountyRows(url = COUNTY_FOOD_URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`County download failed with HTTP ${response.status}`);
  const text = await response.text();
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("County response was not an array");
  return { rows, byteSize: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") };
}
