import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectCountyRows, validateCountyCollection } from "../scripts/county-food/collector.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/county-food-sample.json", import.meta.url), "utf8"));

test("filters County facilities to Carlsbad and normalizes addresses", () => {
  const result = collectCountyRows(fixture);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].address_normalized, "5970 AVENIDA ENCINAS");
});

test("does not retain County owner names or phone numbers", () => {
  const [record] = collectCountyRows(fixture).records;
  assert.equal("permit_owner" in record, false);
  assert.equal("permit_owner_full" in record, false);
});

test("rejects incomplete County collections", () => {
  assert.throws(() => validateCountyCollection({ sourceRecordCount: 0, records: [] }), /incomplete/);
});
