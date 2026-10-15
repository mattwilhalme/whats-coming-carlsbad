import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { parseCsv, rowsToObjects } from "./csv.mjs";
import { normalizeName, normalizeStreet, normalizeSuite, normalizeText, parseAbcDate } from "./normalize.mjs";

const execFileAsync = promisify(execFile);
export const ABC_EXPORT_URL = "https://www.abc.ca.gov/wp-content/uploads/DailyExport-CSV.zip";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function field(row, name) {
  const direct = row[name];
  if (direct !== undefined) return normalizeText(direct);
  const key = Object.keys(row).find((candidate) => candidate.trim() === name);
  return normalizeText(key ? row[key] : "");
}

export function collectFromCsvText(csvText, options = {}) {
  const city = normalizeName(options.city ?? "Carlsbad");
  const parsed = parseCsv(csvText.replace(/^\uFEFF/, ""));
  let sourceUpdatedLabel = null;
  if (parsed[0]?.length === 1 && /^Updated\s/i.test(parsed[0][0])) sourceUpdatedLabel = parsed.shift()[0];
  const objects = rowsToObjects(parsed);
  const warnings = [];
  const records = [];
  for (const row of objects) {
    if (normalizeName(field(row, "Prem City")) !== city) continue;
    const fileNumber = field(row, "File Number");
    const licenseType = field(row, "License Type");
    const address1 = field(row, "Prem Addr 1");
    if (!fileNumber || !licenseType || !address1) {
      warnings.push({ file_number: fileNumber || null, reason: "missing stable identifier or premise address" });
      continue;
    }
    const address2 = field(row, "Prem Addr 2");
    const streetNormalized = normalizeStreet(address1);
    const suiteNormalized = normalizeSuite(address2);
    const primaryName = field(row, "Primary Name");
    const dbaName = field(row, "DBA Name");
    const displayName = dbaName || primaryName || `ABC file ${fileNumber}`;
    const duplicateCount = field(row, "Dup Counts");
    const sourceKey = [fileNumber, licenseType, duplicateCount || "0"].join("|");
    const addressKey = [streetNormalized, suiteNormalized, city].join("|");
    const businessKey = [normalizeName(displayName), addressKey].join("|");
    const originalIssueDate = parseAbcDate(field(row, "Type Orig Iss Date"));
    const expirationDate = parseAbcDate(field(row, "Expir Date"));
    const record = {
      source_key: sourceKey,
      file_number: fileNumber,
      license_type: licenseType,
      duplicate_count: duplicateCount,
      license_or_application: field(row, "Lic or App").toUpperCase(),
      type_status: field(row, "Type Status").toUpperCase(),
      primary_name: primaryName,
      dba_name: dbaName,
      display_name: displayName,
      premise_address_1: address1,
      premise_address_2: address2,
      premise_city: field(row, "Prem City"),
      premise_state: field(row, "Prem State"),
      premise_zip: field(row, "Prem Zip"),
      street_normalized: streetNormalized,
      suite_normalized: suiteNormalized,
      address_key: addressKey,
      business_key: businessKey,
      original_issue_date: originalIssueDate ?? "",
      expiration_date: expirationDate ?? "",
      source_event_date: originalIssueDate ?? ""
    };
    record.content_hash = sha256(JSON.stringify(record));
    records.push(record);
  }
  const deduplicated = new Map();
  for (const record of records) {
    const existing = deduplicated.get(record.source_key);
    if (!existing) deduplicated.set(record.source_key, record);
    else if (existing.content_hash !== record.content_hash) warnings.push({ file_number: record.file_number, reason: "conflicting duplicate source record" });
  }
  const uniqueRecords = [...deduplicated.values()].sort((a, b) => a.source_key.localeCompare(b.source_key));
  return { sourceUpdatedLabel, sourceRecordCount: objects.length, records: uniqueRecords, warnings };
}

export function validateCollection(result, { minimumSourceRecords = 1, minimumFilteredRecords = 1 } = {}) {
  if (result.sourceRecordCount < minimumSourceRecords) throw new Error(`ABC export appears incomplete: ${result.sourceRecordCount} source records`);
  if (result.records.length < minimumFilteredRecords) throw new Error(`ABC export contains no usable records for the selected city`);
  return true;
}

export async function unzipCsv(zipPath) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath], { encoding: "utf8", maxBuffer: 100_000_000 });
  return stdout;
}

async function fetchWithRetry(url, init, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
      if (response.status === 304 || response.ok) return response;
      throw new Error(`ABC download failed with HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

export async function downloadExport({ url = ABC_EXPORT_URL, cacheDir = ".cache/abc" } = {}) {
  await mkdir(cacheDir, { recursive: true });
  const metadataPath = path.join(cacheDir, "metadata.json");
  const zipPath = path.join(cacheDir, "DailyExport-CSV.zip");
  let metadata = {};
  try { metadata = JSON.parse(await readFile(metadataPath, "utf8")); } catch {}
  const headers = {};
  if (metadata.etag) headers["if-none-match"] = metadata.etag;
  if (metadata.lastModified) headers["if-modified-since"] = metadata.lastModified;
  const response = await fetchWithRetry(url, { headers });
  if (response.status === 304) return { zipPath, unchanged: true, ...metadata };
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_000 || bytes.subarray(0, 2).toString() !== "PK") throw new Error("ABC response was not a valid ZIP archive");
  const temporaryPath = `${zipPath}.tmp`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, zipPath);
  metadata = {
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    retrievedAt: new Date().toISOString(),
    byteSize: bytes.length,
    sha256: sha256(bytes),
    sourceUrl: url
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { zipPath, unchanged: false, ...metadata };
}

export { sha256 };
