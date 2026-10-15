const MONTHS = new Map([["JAN","01"],["FEB","02"],["MAR","03"],["APR","04"],["MAY","05"],["JUN","06"],["JUL","07"],["AUG","08"],["SEP","09"],["OCT","10"],["NOV","11"],["DEC","12"]]);

export function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeName(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeStreet(value) {
  return normalizeName(value)
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bSUITE\b/g, "STE");
}

export function normalizeSuite(value) {
  const suite = normalizeName(value).replace(/^(SUITE|UNIT)\s+/, "STE ").replace(/^#\s*/, "STE ");
  return suite === " " ? "" : suite;
}

export function parseAbcDate(value) {
  const clean = normalizeText(value);
  if (!clean) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  let match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? Number(match[3]) + (Number(match[3]) > 60 ? 1900 : 2000) : Number(match[3]);
    return `${year}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`;
  }
  match = clean.toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})$/);
  if (match && MONTHS.has(match[2])) {
    const yearNumber = Number(match[3]);
    const year = match[3].length <= 3 ? yearNumber + (yearNumber > 60 ? 1900 : 2000) : yearNumber;
    return `${year}-${MONTHS.get(match[2])}-${match[1].padStart(2,"0")}`;
  }
  return null;
}
