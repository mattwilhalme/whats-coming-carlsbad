import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDehqRows, parseDehqAddress, parseUsDate, validateDehqCollection } from "../scripts/dehq/collector.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/dehq-sample.json", import.meta.url), "utf8"));

test("parses DEHQ dates and Carlsbad addresses", () => {
  assert.equal(parseUsDate("10/08/2026"), "2026-10-08");
  assert.deepEqual(parseDehqAddress("3427 VIA MONTEBELLO, SUITE 174, CARLSBAD CA 92009"), {
    address_raw: "3427 VIA MONTEBELLO, SUITE 174, CARLSBAD CA 92009",
    street: "3427 VIA MONTEBELLO",
    suite: "STE 174",
    street_normalized: "3427 VIA MONTEBELLO",
    suite_normalized: "STE 174",
    city: "CARLSBAD",
    state: "CA",
    postal_code: "92009"
  });
});

test("retains food plan and amendment records but excludes temporary events", () => {
  const result = normalizeDehqRows(fixture);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.record_number), ["DEH2026-FAMD-013478", "DEH2026-FFPP-022836"]);
  assert.equal(result.records[0].postal_code, "92009-4523");
});

test("rejects empty DEHQ collections", () => {
  assert.throws(() => validateDehqCollection({ sourceRecordCount: 0, records: [] }), /incomplete/);
});
