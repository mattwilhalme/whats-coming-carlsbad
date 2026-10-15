import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectFromCsvText, validateCollection } from "../scripts/abc/collector.mjs";
import { normalizeStreet, normalizeSuite, parseAbcDate } from "../scripts/abc/normalize.mjs";

const fixture = await readFile(new URL("./fixtures/abc-sample.csv", import.meta.url), "utf8");

test("normalizes streets, suites, and supported ABC dates", () => {
  assert.equal(normalizeStreet("500 Grand Avenue"), "500 GRAND AVE");
  assert.equal(normalizeSuite("Suite A"), "STE A");
  assert.equal(parseAbcDate("01-JAN-2025"), "2025-01-01");
  assert.equal(parseAbcDate("12/31/2026"), "2026-12-31");
  assert.equal(parseAbcDate("malformed"), null);
});

test("filters to Carlsbad and preserves individual license types", () => {
  const result = collectFromCsvText(fixture);
  assert.equal(result.sourceRecordCount, 10);
  assert.equal(result.records.length, 7);
  assert.equal(result.records.filter((record) => record.file_number === "00669412").length, 2);
  assert.ok(result.records.some((record) => record.display_name === "CARLSBAD MARKET LLC"));
});

test("same street with different suites produces distinct address identities", () => {
  const result = collectFromCsvText(fixture);
  const records = result.records.filter((record) => record.premise_address_1 === "500 GRAND AVENUE");
  assert.equal(records.length, 2);
  assert.notEqual(records[0].address_key, records[1].address_key);
});

test("duplicate rows are idempotently collapsed and malformed rows are reported", () => {
  const result = collectFromCsvText(fixture);
  assert.equal(result.records.filter((record) => record.file_number === "00670005").length, 1);
  assert.ok(result.warnings.some((warning) => warning.reason.includes("missing stable identifier")));
});

test("reordered input produces identical normalized records", () => {
  const lines = fixture.trimEnd().split("\n");
  const reordered = [...lines.slice(0, 2), ...lines.slice(2).reverse()].join("\n") + "\n";
  assert.deepEqual(collectFromCsvText(reordered).records, collectFromCsvText(fixture).records);
});

test("incomplete or failed collections are rejected", () => {
  assert.throws(() => validateCollection({ sourceRecordCount: 0, records: [] }), /incomplete/);
  assert.throws(() => validateCollection({ sourceRecordCount: 1, records: [] }), /no usable records/);
});
