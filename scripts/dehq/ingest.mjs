#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { collectDehqSearch, DEHQ_SEARCH_URL, normalizeDehqRows, validateDehqCollection } from "./collector.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function formatUsDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

const dryRun = process.argv.includes("--dry-run");
const fixture = option("--fixture");
const now = new Date();
const defaultStart = new Date(now);
defaultStart.setDate(defaultStart.getDate() - 45);
const startDate = option("--start-date") ?? formatUsDate(defaultStart);
const endDate = option("--end-date") ?? formatUsDate(now);
const startedAt = new Date().toISOString();
const retrievedAt = new Date().toISOString();
const fixtureRows = fixture ? JSON.parse(await readFile(fixture, "utf8")) : null;
const result = fixtureRows
  ? { sourceRecordCount: fixtureRows.length, pages: 1, ...normalizeDehqRows(fixtureRows) }
  : await collectDehqSearch({ startDate, endDate });
validateDehqCollection(result);

const summary = { mode: dryRun ? "dry-run" : "write", source_url: DEHQ_SEARCH_URL, start_date: startDate, end_date: endDate, source_records: result.sourceRecordCount, filtered_records: result.records.length, warnings: result.warnings.length, pages: result.pages, retrieved_at: retrievedAt };
if (dryRun) {
  console.log(JSON.stringify(summary));
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for write mode");
const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const payload = { source_url: DEHQ_SEARCH_URL, started_at: startedAt, retrieved_at: retrievedAt, start_date: startDate, end_date: endDate, source_record_count: result.sourceRecordCount, records: result.records };
const { data, error } = await client.rpc("ingest_dehq_snapshot", { payload });
if (error) throw error;
console.log(JSON.stringify({ ...summary, persistence: data }));
