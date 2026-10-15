#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { ABC_EXPORT_URL, collectFromCsvText, downloadExport, sha256, unzipCsv, validateCollection } from "./collector.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const dryRun = process.argv.includes("--dry-run");
const fixture = option("--fixture");
const city = option("--city") ?? "Carlsbad";
const sourceUrl = option("--source-url") ?? ABC_EXPORT_URL;
const startedAt = new Date().toISOString();

let csvText;
let retrievedAt = new Date().toISOString();
let sourceUpdatedAt = "";
let snapshotSha256;
let byteSize;
let inputStatus = "downloaded";

if (fixture) {
  const bytes = await readFile(fixture);
  csvText = fixture.endsWith(".zip") ? await unzipCsv(fixture) : bytes.toString("utf8");
  snapshotSha256 = sha256(bytes);
  byteSize = bytes.length;
  inputStatus = "fixture";
} else {
  const download = await downloadExport({ url: sourceUrl });
  csvText = await unzipCsv(download.zipPath);
  const details = await stat(download.zipPath);
  snapshotSha256 = download.sha256 ?? sha256(await readFile(download.zipPath));
  byteSize = download.byteSize ?? details.size;
  retrievedAt = download.retrievedAt ?? retrievedAt;
  sourceUpdatedAt = download.lastModified ?? "";
  inputStatus = download.unchanged ? "cached-unchanged" : "downloaded";
}

const result = collectFromCsvText(csvText, { city });
validateCollection(result, fixture ? {} : { minimumSourceRecords: 10_000, minimumFilteredRecords: 1 });
const payload = {
  source_url: sourceUrl,
  city,
  started_at: startedAt,
  retrieved_at: retrievedAt,
  source_updated_at: sourceUpdatedAt,
  snapshot_sha256: snapshotSha256,
  byte_size: byteSize,
  source_record_count: result.sourceRecordCount,
  records: result.records
};

const summary = {
  mode: dryRun ? "dry-run" : "write",
  input: inputStatus,
  source_url: sourceUrl,
  city,
  source_records: result.sourceRecordCount,
  filtered_records: result.records.length,
  malformed_filtered_records: result.warnings.length,
  snapshot_sha256: snapshotSha256,
  retrieved_at: retrievedAt
};

if (dryRun) {
  console.log(JSON.stringify(summary));
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for write mode");
const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.rpc("ingest_abc_snapshot", { payload });
if (error) throw error;
console.log(JSON.stringify({ ...summary, persistence: data }));
