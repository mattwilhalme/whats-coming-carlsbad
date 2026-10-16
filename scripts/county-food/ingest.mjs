#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { COUNTY_FOOD_PAGE_URL, COUNTY_FOOD_URL, collectCountyRows, downloadCountyRows, validateCountyCollection } from "./collector.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const dryRun = process.argv.includes("--dry-run");
const fixture = option("--fixture");
const city = option("--city") ?? "Carlsbad";
const sourceUrl = option("--source-url") ?? COUNTY_FOOD_URL;
const startedAt = new Date().toISOString();
const retrievedAt = new Date().toISOString();
const rows = fixture ? JSON.parse(await readFile(fixture, "utf8")) : (await downloadCountyRows(sourceUrl)).rows;
const result = collectCountyRows(rows, { city });
validateCountyCollection(result, fixture ? { minimumSourceRecords: 1, minimumFilteredRecords: 1 } : {});

const summary = { mode: dryRun ? "dry-run" : "write", source_url: sourceUrl, source_records: result.sourceRecordCount, filtered_records: result.records.length, warnings: result.warnings.length, retrieved_at: retrievedAt };
if (dryRun) {
  console.log(JSON.stringify(summary));
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for write mode");
const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const payload = { source_url: sourceUrl, source_page_url: COUNTY_FOOD_PAGE_URL, started_at: startedAt, retrieved_at: retrievedAt, source_record_count: result.sourceRecordCount, records: result.records };
const { data, error } = await client.rpc("ingest_county_food_snapshot", { payload });
if (error) throw error;
console.log(JSON.stringify({ ...summary, persistence: data }));
