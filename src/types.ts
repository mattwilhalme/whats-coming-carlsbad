export type Project = {
  id: string;
  slug: string;
  name: string;
  category: "apartments" | "mixed-use" | "commercial";
  locationText: string;
  proposedUnits: number | null;
  affordableUnits: number | null;
  commercialSqft: number | null;
  status: string;
  statusAsOf: string;
  evidenceLabel: string;
  sourceUrl: string;
};

export type BusinessSignal = {
  id: string;
  displayName: string;
  address: string;
  suite: string | null;
  licenseTypes: string[];
  licenseOrApplication: string;
  status: string;
  sourceDate: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  signalKind: "newly_detected" | "pending_application" | "recently_changed" | "tracked_business";
  uncertaintyNote: string;
  sourceUrl: string;
};

export type IngestionHealth = {
  lastSuccessfulImportAt: string | null;
  dataRetrievedAt: string | null;
  trackedRecordCount: number;
};
