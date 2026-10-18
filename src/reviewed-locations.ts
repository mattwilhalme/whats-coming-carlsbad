export type ReviewedLocation = {
  businessName: string;
  streetAddress: string;
  apn: string;
  longitude: number;
  latitude: number;
  addressPointId: string | null;
  sourceUrl: string;
  confidence: number;
  matchRationale: string;
  reviewedAt: string;
};

const SANGIS_SOURCE = "https://gis-public.sandiegocounty.gov/arcgis/rest/services/sdep_warehouse/ADDRAPN/FeatureServer/0";

export const reviewedLocations: ReviewedLocation[] = [
  ["264 FRESCO", "264 CARLSBAD VILLAGE DR", "2032321600", -117.35167718387284, 33.15814050645088, "175096"],
  ["BLUE OCEAN PRIVATEERS LTD", "2609 SUTTER ST", "1675113100", -117.31331169152601, 33.16150620119606, null],
  ["BLUE OCEAN SUSHI", "2958 MADISON ST", "2033032400", -117.3468503768923, 33.16152347013818, null],
  ["DOZIER IMPORTS LLC", "2225 CAMINO VIDA ROBLE", "2130502400", -117.27276972545451, 33.11852833189627, "403339"],
  ["GRIMO", "2727 ROOSEVELT ST", "2031013400", -117.35008754023919, 33.16270483899926, "384292"],
  ["KURA REVOLVING SUSHI BAR", "5970 AVENIDA ENCINAS", "2101702200", -117.32415801274942, 33.12400155866187, null],
  ["L'ATELIER DE PARIS", "7150 AVENIDA ENCINAS", "2144302400", -117.31167530827456, 33.10038199772733, null],
  ["SUSHI KUCHI CARLSBAD", "7180 AVENIDA ENCINAS", "2144301900", -117.30959853091586, 33.10036265018028, null],
  ["VINO NORTE", "2225 CAMINO VIDA ROBLE", "2130502400", -117.27276972545451, 33.11852833189627, "403339"]
].map(([businessName, streetAddress, apn, longitude, latitude, addressPointId]) => ({
  businessName: businessName as string,
  streetAddress: streetAddress as string,
  apn: apn as string,
  longitude: longitude as number,
  latitude: latitude as number,
  addressPointId: addressPointId as string | null,
  sourceUrl: SANGIS_SOURCE,
  confidence: 1,
  matchRationale: "Exact normalized street-address match to one SanGIS address point and one APN. This verifies the point and parcel candidate, not the suite, building, tenant identity, or opening outcome.",
  reviewedAt: "2026-10-17"
}));

function normalizeStreet(value: string) {
  return value.toUpperCase()
    .replace(/,.*$/, "")
    .replace(/\b(?:STE|SUITE|UNIT)\s+[A-Z0-9& -]+$/i, "")
    .replace(/#[A-Z0-9& -]+$/i, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findReviewedLocation(businessName: string, address: string) {
  const normalizedName = businessName.trim().toUpperCase();
  const normalizedAddress = normalizeStreet(address);
  return reviewedLocations.find((location) =>
    location.businessName === normalizedName && location.streetAddress === normalizedAddress
  ) ?? null;
}
