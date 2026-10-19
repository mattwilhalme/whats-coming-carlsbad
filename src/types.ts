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
  latitude?: number | null;
  longitude?: number | null;
  matchConfidence?: number | null;
  geometryVerified?: boolean;
};

export type PlanningDocumentClaim = {
  key: string;
  label: string;
  value: string;
  valueKind: "text" | "integer" | "date" | "boolean";
  pageNumber: number;
  confidence: number;
};

export type PlanningDocumentEvidence = {
  documentId: string;
  title: string;
  documentType: string;
  publishedAt: string | null;
  sourcePageUrl: string;
  fileUrl: string;
  pageCount: number;
  evidenceNote: string;
  reviewedAt: string;
  claims: PlanningDocumentClaim[];
};

export type BusinessSignal = {
  id: string;
  displayName: string;
  legalApplicant: string | null;
  address: string;
  suite: string | null;
  fullAddress: string;
  licenseTypes: string[];
  licenseOrApplication: string;
  status: string;
  sourceDate: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  signalKind: "newly_detected" | "pending_application" | "recently_changed" | "tracked_business";
  evidenceLevel: "baseline_pending" | "new_pending" | "changed";
  isBaseline: boolean;
  uncertaintyNote: string;
  sourceUrl: string;
  countyCheck: {
    recordId: string;
    facilityName: string;
    permitStatus: string | null;
    activePermit: string | null;
    sourceUpdatedAt: string | null;
    sourceUrl: string;
    matchLevel: "name_and_address" | "address_only";
  } | null;
  dehqCheck: {
    recordNumber: string;
    projectName: string;
    recordType: string;
    status: string;
    openedDate: string;
    sourceUrl: string;
    matchLevel: "name_and_address" | "address_only";
  } | null;
  latitude?: number | null;
  longitude?: number | null;
  matchConfidence?: number | null;
  geometryVerified?: boolean;
  apn?: string | null;
  locationSourceUrl?: string | null;
  locationMatchMethod?: string | null;
  locationReviewNote?: string | null;
  locationReviewedAt?: string | null;
};

export type IngestionHealth = {
  lastSuccessfulImportAt: string | null;
  dataRetrievedAt: string | null;
  trackedRecordCount: number;
};
