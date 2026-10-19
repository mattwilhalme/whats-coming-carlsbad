import type { BusinessSignal, Project } from "./types";

export type MapCategory = "restaurants" | "retail" | "housing" | "commercial";

export type MapActivity = {
  id: string;
  category: MapCategory;
  name: string;
  address: string;
  suite: string | null;
  status: string;
  firstDetected: string | null;
  latestUpdate: string;
  sourceLabel: string;
  sourceUrl: string;
  uncertaintyNote: string;
  latitude: number | null;
  longitude: number | null;
  matchConfidence: number | null;
  geometryVerified: boolean;
  apn: string | null;
  locationSourceUrl: string | null;
  locationMatchRationale: string | null;
  locationReviewedAt: string | null;
};

export type MapFilter = "all" | MapCategory;

export function businessSignalToMapActivity(signal: BusinessSignal): MapActivity {
  return {
    id: `signal:${signal.id}`,
    category: "restaurants",
    name: signal.displayName,
    address: signal.fullAddress,
    suite: signal.suite,
    status: signal.status === "PEND" ? "Application pending" : signal.status,
    firstDetected: signal.firstSeenAt,
    latestUpdate: signal.lastSeenAt,
    sourceLabel: "California ABC record",
    sourceUrl: signal.sourceUrl,
    uncertaintyNote: signal.uncertaintyNote,
    latitude: signal.latitude ?? null,
    longitude: signal.longitude ?? null,
    matchConfidence: signal.matchConfidence ?? null,
    geometryVerified: Boolean(signal.geometryVerified),
    apn: signal.apn ?? null,
    locationSourceUrl: signal.locationSourceUrl ?? null,
    locationMatchRationale: signal.locationReviewNote ?? null,
    locationReviewedAt: signal.locationReviewedAt ?? null
  };
}

export function projectToMapActivity(project: Project): MapActivity {
  return {
    id: `project:${project.id}`,
    category: project.category === "apartments" ? "housing" : "commercial",
    name: project.name,
    address: project.locationText,
    suite: null,
    status: project.status,
    firstDetected: null,
    latestUpdate: project.statusAsOf,
    sourceLabel: project.evidenceLabel,
    sourceUrl: project.sourceUrl,
    uncertaintyNote: "Project location has not yet been matched to a reviewed parcel or building footprint.",
    latitude: project.latitude ?? null,
    longitude: project.longitude ?? null,
    matchConfidence: project.matchConfidence ?? null,
    geometryVerified: Boolean(project.geometryVerified),
    apn: null,
    locationSourceUrl: null,
    locationMatchRationale: null,
    locationReviewedAt: null
  };
}

export function filterMapActivities(activities: MapActivity[], filter: MapFilter, query = "") {
  const needle = query.trim().toLowerCase();
  return activities.filter((activity) =>
    (filter === "all" || activity.category === filter) &&
    (!needle || `${activity.name} ${activity.address} ${activity.status}`.toLowerCase().includes(needle))
  );
}

export function hasVerifiedPoint(activity: MapActivity) {
  return Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude);
}

export function hasUsableAddress(activity: MapActivity) {
  const address = activity.address.trim();
  return /^\d+(?:\s|[-–])/.test(address) && !/address not yet verified/i.test(address);
}

export function explorerHref(activity: MapActivity) {
  return `./explore.html?focus=${encodeURIComponent(activity.id)}`;
}

export function geocodingQuery(address: string) {
  const [street, ...locality] = address.split(",");
  const withoutSuite = street
    .replace(/\s+(?:#|STE\.?|SUITE|UNIT)\s*[A-Z0-9][A-Z0-9& -]*$/i, "")
    .trim();
  const suffix = locality.join(",").trim();
  return suffix ? `${withoutSuite}, ${suffix}` : `${withoutSuite}, Carlsbad, California`;
}

export function distanceMiles(a: [number, number], b: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b[1] - a[1]);
  const dLon = radians(b[0] - a[0]);
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
