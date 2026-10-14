import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "raw");
const base = "https://services.arcgis.com/ay9ePoQ2UfAX3U38/ArcGIS/rest/services/BuildingPermits/FeatureServer";
await mkdir(rawDir, { recursive: true });

async function getJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "carlsbad-data-feasibility-study/0.1" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

const service = await getJson(`${base}?f=pjson`);
const layer = await getJson(`${base}/0?f=pjson`);
await writeFile(path.join(rawDir, "arcgis-service.json"), JSON.stringify(service, null, 2));
await writeFile(path.join(rawDir, "arcgis-layer-0.json"), JSON.stringify(layer, null, 2));

const pageSize = Math.min(layer.maxRecordCount || 2000, 2000);
const features = [];
for (let offset = 0; ; offset += pageSize) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: String(pageSize),
    resultOffset: String(offset),
    orderByFields: `${layer.objectIdField || "OBJECTID"} ASC`,
    f: "geojson"
  });
  const page = await getJson(`${base}/0/query?${params}`);
  features.push(...(page.features || []));
  await writeFile(path.join(rawDir, `arcgis-page-${offset}.geojson`), JSON.stringify(page));
  if (!page.exceededTransferLimit && (page.features || []).length < pageSize) break;
}
await writeFile(path.join(rawDir, "arcgis-all.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
console.log(JSON.stringify({ records: features.length, pageSize }, null, 2));
