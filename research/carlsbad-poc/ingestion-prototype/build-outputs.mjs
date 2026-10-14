import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const raw = path.join(root, "raw");
const q = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const csv = (rows, columns) => `${columns.map(q).join(",")}\n${rows.map(r => columns.map(c => q(r[c])).join(",")).join("\n")}\n`;
function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] || ""])));
}
const norm = (s) => String(s || "").toUpperCase().replace(/\bSTREET\b/g,"ST").replace(/\bAVENUE\b/g,"AVE").replace(/\bBOULEVARD\b/g,"BLVD").replace(/\bDRIVE\b/g,"DR").replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
const addressKey = (a, suite="") => `${norm(a)}|${norm(suite).replace(/^SUITE /,"STE ")}`;

const arc = JSON.parse(await readFile(path.join(raw, "arcgis-all.geojson"), "utf8")).features;
const commercial = arc.filter(f => f.properties.PermitClassMapped === "Non-Residential").map(f => {
  const p = f.properties; const d = p.AppliedDate || "";
  const desc = String(p.Description || "").toUpperCase();
  let classification = "other_commercial";
  if (/RESTAURANT|CAFE|COFFEE|BAR |BREW|KITCHEN|FOOD/.test(desc)) classification = "food_service";
  else if (/RETAIL|TENANT IMPROVEMENT|T\.I\.|STORE|SHOP/.test(desc)) classification = "retail_or_tenant_improvement";
  else if (/APARTMENT|MULTI.?FAMILY|MIXED.?USE/.test(desc)) classification = "multifamily_or_mixed_use";
  return {
    source_record_id: p.OBJECTID, permit_number: p.PermitNum, description: p.Description,
    applied_date: d, issued_date: p.IssuedDate, completed_date: p.CompletedDate,
    status: p.StatusCurrent, address: p.OriginalAddress1, city: p.OriginalCity, state: p.OriginalState,
    zip: p.OriginalZip, permit_class: p.PermitClass, classification,
    longitude: f.geometry?.coordinates?.[0], latitude: f.geometry?.coordinates?.[1],
    in_current_90_day_window: d >= "2026-07-16" ? "true" : "false",
    source_url: "https://services.arcgis.com/ay9ePoQ2UfAX3U38/ArcGIS/rest/services/BuildingPermits/FeatureServer/0"
  };
});
await writeFile(path.join(root, "commercial-permits.csv"), csv(commercial, Object.keys(commercial[0])));

const abcText = execFileSync("unzip", ["-p", path.join(raw, "abc-daily-export.zip"), "ABC-DailyDataExport.csv"], { encoding: "utf8", maxBuffer: 80_000_000 });
const abc = parseCsv(abcText.split(/\r?\n/).slice(1).join("\n")).filter(r => norm(r["Prem City"]) === "CARLSBAD");
const pending = abc.filter(r => r["Lic or App"].trim() === "APP" && r["Type Status"].trim() === "PEND");
const foods = JSON.parse(await readFile(path.join(raw, "sd-food-carlsbad.json"), "utf8"));
const foodByAddress = new Map();
for (const f of foods) { const k=addressKey(f.address); if (!foodByAddress.has(k)) foodByAddress.set(k, []); foodByAddress.get(k).push(f); }
const abcByAddress = new Map();
for (const r of abc) { const k=addressKey(r["Prem Addr 1"]); if (!abcByAddress.has(k)) abcByAddress.set(k, []); abcByAddress.get(k).push(r); }
const permitsByAddress = new Map();
for (const p of commercial) { const k=addressKey(p.address); if (!permitsByAddress.has(k)) permitsByAddress.set(k, []); permitsByAddress.get(k).push(p); }
for (const p of commercial) {
  const k=addressKey(p.address); const af=abcByAddress.get(k)||[]; const ff=foodByAddress.get(k)||[];
  p.abc_address_match_count=af.length;
  p.county_food_address_match_count=ff.length;
  p.identifiable_business_names=[...new Set([...af.map(x=>x["DBA Name"].trim()).filter(Boolean),...ff.map(x=>x.record_name).filter(Boolean)])].slice(0,10).join("|");
  p.business_match_status=p.identifiable_business_names ? "address_level_candidate_requires_suite_and_date_review" : "unmatched";
}
await writeFile(path.join(root, "commercial-permits.csv"), csv(commercial, Object.keys(commercial[0])));
const grouped = new Map();
for (const r of pending) {
  const key = `${r["File Number"].trim()}|${addressKey(r["Prem Addr 1"], r["Prem Addr 2"])}`;
  if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(r);
}
const candidates = [...grouped.values()].map(rows => {
  const r=rows[0]; const baseKey=addressKey(r["Prem Addr 1"]);
  const fm=foodByAddress.get(baseKey)||[]; const pm=permitsByAddress.get(baseKey)||[];
  const sameNameFood=fm.filter(f => norm(f.record_name).includes(norm(r["DBA Name"])) || norm(r["DBA Name"]).includes(norm(f.record_name)));
  let confidence="possible_match_requiring_review";
  if (sameNameFood.length) confidence="strong_candidate";
  return {
    candidate_name: r["DBA Name"].trim() || r["Primary Name"].trim(), legal_business_name: r["Primary Name"].trim(),
    address: r["Prem Addr 1"], suite: r["Prem Addr 2"], city: "Carlsbad", state: "CA", zip: r["Prem Zip"],
    abc_file_number: r["File Number"], abc_license_types: [...new Set(rows.map(x=>x["License Type"]))].join("|"),
    abc_status: "PEND", county_food_matches: fm.length, historical_commercial_permit_matches: pm.length,
    confidence, match_rationale: sameNameFood.length ? "Exact normalized street address and overlapping facility/DBA name; suite still requires review." : pm.length ? "Pending ABC application and historical city commercial permit share the normalized street address; tenant identity is not proven." : "Pending ABC application is direct evidence of an application at this address; no independent exact-address match found.",
    false_positive_risk: "Application may be a transfer, duplicate license type, existing operator, or may never issue. Shopping-center addresses require suite-level review.",
    abc_source_url: "https://www.abc.ca.gov/licensing/licensing-reports/",
    county_source_url: fm.length ? "https://internal-sandiegocounty.data.socrata.com/d/c5ez-ufrd" : "",
    permit_source_url: pm.length ? "https://services.arcgis.com/ay9ePoQ2UfAX3U38/ArcGIS/rest/services/BuildingPermits/FeatureServer/0" : ""
  };
}).sort((a,b)=>a.candidate_name.localeCompare(b.candidate_name));
await writeFile(path.join(root, "tenant-candidates.csv"), csv(candidates, Object.keys(candidates[0])));

const projects = [
 {project_key:"fairfield-apartments-bressi-ranch",project_name:"Fairfield Apartments at Bressi Ranch",category:"apartments",location_text:"Southwest corner of Palomar Airport Road and Gateway Road",apns:"213-263-19|213-263-20",project_ids:"SDP 2024-0009|DEV2022-0186",proposed_units:320,affordable_units:43,building_count:1,height:"4-6 stories; approximately 44 ft 2 in to 67 ft 2 in",commercial_sqft:"",event_date:"2026-10-09",event_type:"CEQA Notice of Exemption posted",documented_status:"CEQA exemption notice posted; construction permit not established",source_url:"https://ceqanet.lci.ca.gov/2026100315",verification:"verified_primary_source"},
 {project_key:"salk-avenue-apartments",project_name:"Salk Avenue Apartments",category:"apartments",location_text:"Salk Avenue / College Boulevard / El Camino Real",apns:"",project_ids:"SDP 2025-0004|SCH 2026030432",proposed_units:397,affordable_units:59,building_count:"",height:"",commercial_sqft:"",event_date:"2026-06-03",event_type:"City approval documented by CEQA Notice of Determination",documented_status:"Planning/environmental approval documented; construction permit not established",source_url:"https://ceqanet.lci.ca.gov/2026030432/3",verification:"verified_primary_source"},
 {project_key:"resort-view-apartments",project_name:"Resort View Apartments",category:"apartments",location_text:"West side of Viejo Castilla Way between Navarra Drive and Pirineos Way",apns:"216-170-14-00|216-170-15-00",project_ids:"SDP 2024-0012",proposed_units:26,affordable_units:"",building_count:5,height:"3-4 stories; maximum 50 ft 6 in",commercial_sqft:"",event_date:"2026-01-21",event_type:"City approval documented by CEQA Notice of Determination",documented_status:"Planning approval documented; construction permit not established",source_url:"https://ceqanet.lci.ca.gov/2026010839",verification:"verified_primary_source"},
 {project_key:"salt-grass",project_name:"Salt | Grass",category:"mixed-use",location_text:"2715-2729 Carlsbad Boulevard",apns:"",project_ids:"SDP 2026-0006|CDP 2026-0036",proposed_units:15,affordable_units:2,building_count:"",height:"",commercial_sqft:8240,event_date:"2026-07-10",event_type:"Application date stated by developer",documented_status:"Developer-stated application; city decision and construction permit not established",source_url:"https://www.blvd-beach.com/",verification:"verified_developer_source_not_city_approval"},
 {project_key:"next-med-center-sign-program",project_name:"Next Med Center of Carlsbad sign program",category:"commercial_notice",location_text:"",apns:"",project_ids:"AMEND 2026-0011|CDP 2026-0033",proposed_units:"",affordable_units:"",building_count:"",height:"",commercial_sqft:"",event_date:"2026-09-10",event_type:"City public development notice (seed)",documented_status:"Unverified in this run because city page returned HTTP 403; sign program is not proof of a new tenant",source_url:"https://www.carlsbadca.gov/departments/community-development/planning/agendas-minutes-notices",verification:"source_access_blocked_403"},
 {project_key:"costco-fuel-expansion",project_name:"Costco fuel expansion project",category:"commercial_notice",location_text:"Address not established from accessible primary record",apns:"",project_ids:"AMEND 2022-0020",proposed_units:"",affordable_units:"",building_count:"",height:"",commercial_sqft:"",event_date:"2025-10-14",event_type:"City public development notice (seed)",documented_status:"Unverified in this run because city page returned HTTP 403; do not assign the seed's separate notice address",source_url:"https://www.carlsbadca.gov/departments/community-development/planning/agendas-minutes-notices",verification:"source_access_blocked_403"}
];
await writeFile(path.join(root,"normalized-projects.csv"),csv(projects,Object.keys(projects[0])));

const matchedCommercial=commercial.filter(x=>x.business_match_status!=="unmatched").length;
const metrics={arcgis_records:arc.length,arcgis_nonresidential:commercial.length,arcgis_current_90_days:commercial.filter(x=>x.in_current_90_day_window==="true").length,commercial_permits_with_address_level_business_candidate:matchedCommercial,commercial_permit_address_match_rate:matchedCommercial/commercial.length,abc_carlsbad_rows:abc.length,abc_pending_application_rows:pending.length,tenant_candidates:candidates.length,county_food_carlsbad:foods.length,strong_candidates:candidates.filter(x=>x.confidence==="strong_candidate").length,candidates_with_historical_permit_match:candidates.filter(x=>x.historical_commercial_permit_matches>0).length,projects:projects.length};
await writeFile(path.join(raw,"run-metrics.json"),JSON.stringify(metrics,null,2));
console.log(JSON.stringify(metrics,null,2));
