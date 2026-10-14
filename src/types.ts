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
