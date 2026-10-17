import test from "node:test";
import assert from "node:assert/strict";
import { businessSignalToMapActivity, distanceMiles, filterMapActivities, hasVerifiedPoint, projectToMapActivity } from "../src/map-data.ts";

const signal = {
  id: "abc-1", displayName: "Example Kitchen", legalApplicant: null, address: "100 Main St", suite: null,
  fullAddress: "100 Main St, Carlsbad, CA 92008", licenseTypes: ["41"], licenseOrApplication: "APP", status: "PEND",
  sourceDate: null, firstSeenAt: "2026-10-15T00:00:00Z", lastSeenAt: "2026-10-17T00:00:00Z", signalKind: "pending_application",
  evidenceLevel: "new_pending", isBaseline: false, uncertaintyNote: "Not a confirmed opening.", sourceUrl: "https://example.gov/record",
  countyCheck: null, dehqCheck: null
};

test("adapts ABC evidence without inventing a location or opening status", () => {
  const row = businessSignalToMapActivity(signal);
  assert.equal(row.category, "restaurants");
  assert.equal(row.status, "Application pending");
  assert.equal(row.latitude, null);
  assert.equal(row.geometryVerified, false);
  assert.equal(hasVerifiedPoint(row), false);
});

test("maps supported project categories and leaves unmatched projects unlocated", () => {
  const row = projectToMapActivity({ id: "p1", slug: "homes", name: "Homes", category: "apartments", locationText: "Carlsbad", proposedUnits: 10, affordableUnits: null, commercialSqft: null, status: "Proposed", statusAsOf: "2026-10-01", evidenceLabel: "Notice", sourceUrl: "https://example.gov/notice" });
  assert.equal(row.category, "housing");
  assert.equal(hasVerifiedPoint(row), false);
});

test("filters by supported category and text", () => {
  const restaurant = businessSignalToMapActivity(signal);
  const housing = { ...restaurant, id: "housing", category: "housing", name: "Village Homes" };
  assert.deepEqual(filterMapActivities([restaurant, housing], "restaurants", "main").map((row) => row.id), ["signal:abc-1"]);
  assert.deepEqual(filterMapActivities([restaurant, housing], "housing", "village").map((row) => row.id), ["housing"]);
});

test("calculates geographic distance in miles", () => {
  const miles = distanceMiles([-117.3506, 33.1581], [-117.3406, 33.1581]);
  assert.ok(miles > 0.55 && miles < 0.65);
});
