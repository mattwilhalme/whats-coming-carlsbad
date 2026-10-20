import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl, type ErrorEvent, type GeoJSONSource, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import "./explore.css";
import { createMobileExplorer } from "./mobile-explorer";
import { isSupabaseConfigured, loadBusinessSignals, loadProjects } from "./supabase";
import {
  businessSignalToMapActivity,
  distanceMiles,
  filterMapActivities,
  geocodingQuery,
  hasVerifiedPoint,
  hasUsableAddress,
  projectToMapActivity,
  type MapActivity,
  type MapFilter
} from "./map-data";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const CARLSBAD_BOUNDS = { south: 33.06, north: 33.21, west: -117.43, east: -117.22 };
const root = document.querySelector<HTMLDivElement>("#explorer")!;

setWorkerUrl(workerUrl);

root.innerHTML = `
  <header class="explorer-header">
    <a href="./" class="back-link">← Catalog</a>
    <div><p class="eyebrow">Public-records beta</p><h1>Carlsbad 3D Explorer</h1></div>
    <button id="list-toggle" class="icon-button" type="button" aria-controls="activity-panel" aria-expanded="false">Activity</button>
  </header>
  <main class="explorer-layout">
    <section class="map-shell" aria-label="Interactive map">
      <div id="map"></div>
      <div class="map-tools">
        <form id="nearby-search" class="search-card">
          <label for="address">What’s coming near me?</label>
          <div class="search-row"><input id="address" autocomplete="street-address" placeholder="Carlsbad street address" required><button type="submit">Find</button></div>
          <div class="radius-row"><label for="radius">Within</label><select id="radius"><option value="0.5">0.5 mile</option><option value="1" selected>1 mile</option><option value="2">2 miles</option><option value="5">5 miles</option></select></div>
          <small>Searches are sent only when you submit and are not stored by this site. Geocoding by OpenStreetMap Nominatim.</small>
        </form>
        <div id="map-status" class="map-status" role="status" aria-live="polite">Loading map and public records…</div>
      </div>
    </section>
    <aside id="activity-panel" class="activity-panel">
      <div class="panel-head"><div><p class="eyebrow">Verified sources</p><h2>Development activity</h2></div><strong id="result-count">0</strong></div>
      <div id="panel-controls" class="panel-controls"><div id="filters" class="filters" role="group" aria-label="Filter map activity">
        <button type="button" data-filter="all" aria-pressed="true">All activity</button>
        <button type="button" data-filter="restaurants" aria-pressed="false">Restaurants</button>
        <button type="button" data-filter="retail" aria-pressed="false">Retail</button>
        <button type="button" data-filter="housing" aria-pressed="false">Housing</button>
        <button type="button" data-filter="commercial" aria-pressed="false">Commercial</button>
      </div>
      <label class="list-search"><span>Search records</span><input id="record-search" type="search" placeholder="Name, address or status"></label>
      <p id="coverage" class="coverage"></p>
      </div><div id="activity-list" class="activity-list" aria-label="Development projects" aria-busy="true"><p class="empty">Loading public records…</p></div>
    </aside>
  </main><dialog id="project-dialog" class="project-dialog" aria-label="Project details"><button type="button">Close details</button><div class="dialog-content"></div></dialog>`;

const status = document.querySelector<HTMLDivElement>("#map-status")!;
const list = document.querySelector<HTMLDivElement>("#activity-list")!;
const coverage = document.querySelector<HTMLParagraphElement>("#coverage")!;
const resultCount = document.querySelector<HTMLElement>("#result-count")!;
const recordSearch = document.querySelector<HTMLInputElement>("#record-search")!;
let activities: MapActivity[] = [];
let activeId: string | null = null;
let visibleRows: MapActivity[] = [];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let activeFilter: MapFilter = "all";
let nearbyCenter: [number, number] | null = null;
let searchMarker: Marker | null = null;
let mapReady = false;
let dataReady = false;
let initialFocusHandled = false;
const initialFocusId = new URLSearchParams(window.location.search).get("focus");

function initializeMap() {
 try { return new Map({
  container: "map",
  style: MAP_STYLE,
  center: [-117.3506, 33.1581],
  zoom: 13.5,
  pitch: 55,
  bearing: -18,
  canvasContextAttributes: { antialias: true },
  maxBounds: [[-117.58, 32.92], [-117.05, 33.35]]
});
 } catch (error) {
   console.warn("3D map unavailable", error);
   status.textContent = "This browser cannot display the 3D map. Project cards and sources remain available.";
   document.querySelector('#map')!.innerHTML = '<p class="map-unavailable">3D map unavailable in this browser.<br>Browse the public records below.</p>';
   return null;
 }
}
const map = initializeMap();
map?.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
map?.addControl(new ScaleControl({ unit: "imperial" }), "bottom-right");

const mobile = createMobileExplorer(id => {
  const activity = visibleRows.find(row => row.id === id);
  if (activity) void selectActivity(activity, false);
}, () => {
  if (!map) return;
  const center = map.getCenter();
  const moving = map.isMoving();
  map.resize();
  // Keep the geographic center stable when the pitched viewport changes shape.
  if (!moving) map.jumpTo({ center });
});
const dialog = document.querySelector<HTMLDialogElement>("#project-dialog")!;
dialog.querySelector('button')!.addEventListener('click', () => dialog.close());
function openDetails(card: HTMLElement) {
  const copy = card.cloneNode(true) as HTMLElement;
  copy.removeAttribute('tabindex');
  copy.removeAttribute('aria-current');
  copy.querySelector('.mobile-details-button')?.remove();
  dialog.querySelector('.dialog-content')!.replaceChildren(copy);
  dialog.showModal();
}
function highlightSelection() {
  if (!map || !mapReady || !map.getLayer("activity-points")) return;
  map.setPaintProperty("activity-points", "circle-radius", ["case", ["==", ["get", "id"], activeId ?? ""], 14, 9]);
  map.setPaintProperty("activity-points", "circle-stroke-color", ["case", ["==", ["get", "id"], activeId ?? ""], "#172d29", "#fff"]);
  map.setPaintProperty("activity-points", "circle-stroke-width", ["case", ["==", ["get", "id"], activeId ?? ""], 4, 2]);
}

function addBuildingExtrusions(target: MapLibreMap) {
  const layers = (target.getStyle() as StyleSpecification).layers ?? [];
  if (layers.some((layer) => layer.id === "carlsbad-buildings-3d")) return true;
  const buildingLayer = layers.find((layer) => "source" in layer && layer.source && "source-layer" in layer && layer["source-layer"] === "building") as ({ source: string } | undefined);
  if (!buildingLayer) return false;
  const labelLayer = layers.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"]);
  target.addLayer({
    id: "carlsbad-buildings-3d",
    type: "fill-extrusion",
    source: buildingLayer.source,
    "source-layer": "building",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": "#8ca69d",
      "fill-extrusion-height": ["coalesce", ["to-number", ["get", "render_height"]], ["to-number", ["get", "height"]], 10],
      "fill-extrusion-base": ["coalesce", ["to-number", ["get", "render_min_height"]], ["to-number", ["get", "min_height"]], 0],
      "fill-extrusion-opacity": 0.72
    }
  }, labelLayer?.id);
  return true;
}

function activityGeoJson(rows: MapActivity[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.filter(hasVerifiedPoint).map((activity) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [activity.longitude!, activity.latitude!] },
      properties: { id: activity.id, category: activity.category, name: activity.name }
    }))
  };
}

function syncMap(rows: MapActivity[]) {
  const source = map?.getSource("activity-points") as GeoJSONSource | undefined;
  source?.setData(activityGeoJson(rows));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Date(value.includes("T") ? value : `${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function locateAddress(address: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "us", q: geocodingQuery(address) }).toString();
  const response = await fetch(url, { headers: { Accept: "application/json", "Accept-Language": "en" } });
  if (!response.ok) throw new Error("Geocoding is temporarily unavailable.");
  const [result] = await response.json() as Array<{ lat: string; lon: string }>;
  if (!result) throw new Error("Address not found in Carlsbad.");
  const latitude = Number(result.lat), longitude = Number(result.lon);
  if (latitude < CARLSBAD_BOUNDS.south || latitude > CARLSBAD_BOUNDS.north || longitude < CARLSBAD_BOUNDS.west || longitude > CARLSBAD_BOUNDS.east) throw new Error("That address is outside the Carlsbad search area.");
  return [longitude, latitude] as [number, number];
}

function showSearchPoint(center: [number, number], zoom = 16) {
  if (!map) return;
  searchMarker?.remove();
  searchMarker = new Marker({ color: "#172d29" }).setLngLat(center).addTo(map);
  map.flyTo({ center, zoom, pitch: 55, duration: reducedMotion.matches ? 0 : 650 });
}

async function selectActivity(activity: MapActivity, scroll = true) {
  const changed = activeId !== activity.id;
  activeId = activity.id;
  mobile.select(activity.id, scroll);
  highlightSelection();
  document.querySelectorAll(".activity-card").forEach((card) => card.classList.toggle("selected", card.getAttribute("data-id") === activity.id));
  if (hasVerifiedPoint(activity)) {
    if (!map) { status.textContent = `Map unavailable. Reviewed location for ${activity.name}: ${activity.address}.`; return; }
    if (!mobile.isMobile() || changed) map.flyTo({
      center: [activity.longitude!, activity.latitude!],
      zoom: mobile.isMobile() ? Math.max(15.5, Math.min(17, map.getZoom())) : 17,
      pitch: mobile.isMobile() ? map.getPitch() : 60,
      bearing: map.getBearing(), duration: reducedMotion.matches ? 0 : 650
    });
    status.textContent = `Showing the reviewed location for ${activity.name}.`;
    return;
  }
  if (mobile.isMobile()) {
    status.textContent = `Location pending for ${activity.name}. No reviewed coordinates; map position preserved.`;
    return;
  }
  if (!hasUsableAddress(activity)) {
    status.textContent = "This record does not yet include a street address that can be located.";
    return;
  }
  status.textContent = `Locating ${activity.address}…`;
  try {
    showSearchPoint(await locateAddress(activity.address));
    status.textContent = "Address located from the current record. Parcel coordinates remain unverified.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Address search failed.";
  }
}

async function focusInitialActivity() {
  if (initialFocusHandled || !initialFocusId || !dataReady) return;
  initialFocusHandled = true;
  const activity = activities.find((row) => row.id === initialFocusId);
  if (!activity) {
    status.textContent = "That record is no longer in the current public dataset.";
    return;
  }
  // Keep all cards available when arriving at a project deep link.
  if (!mobile.isMobile()) recordSearch.value = activity.name;
  render();
  document.querySelector<HTMLElement>("#activity-panel")!.classList.add("open");
  if (!mobile.isMobile()) document.querySelector<HTMLButtonElement>("#list-toggle")!.setAttribute("aria-expanded", "true");
  await selectActivity(activity);
  if (!mobile.isMobile()) document.querySelector<HTMLElement>(`.activity-card[data-id="${CSS.escape(activity.id)}"]`)?.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "nearest" });
}

function render() {
  let rows = filterMapActivities(activities, activeFilter, recordSearch.value);
  const radius = Number((document.querySelector<HTMLSelectElement>("#radius")!).value);
  if (nearbyCenter) rows = rows.filter((row) => hasVerifiedPoint(row) && distanceMiles(nearbyCenter!, [row.longitude!, row.latitude!]) <= radius);
  visibleRows = rows;
  const mapped = rows.filter(hasVerifiedPoint).length;
  const addressable = rows.filter((row) => !hasVerifiedPoint(row) && hasUsableAddress(row)).length;
  resultCount.textContent = String(rows.length);
  coverage.textContent = nearbyCenter
    ? `${rows.length} verified location${rows.length === 1 ? "" : "s"} within ${radius} mile${radius === 1 ? "" : "s"}.`
    : `${mapped} reviewed points · ${addressable} address-searchable · ${rows.length - mapped - addressable} awaiting a usable location.`;
  list.innerHTML = rows.length ? rows.map((activity) => `
    <article class="activity-card" data-id="${escapeHtml(activity.id)}" tabindex="0">
      <div class="card-title"><span class="category ${activity.category}">${escapeHtml(activity.category)}</span><span class="location-state">${hasVerifiedPoint(activity) ? "Reviewed point" : hasUsableAddress(activity) ? "Address available" : "Location pending"}</span></div>
      <h3>${escapeHtml(activity.name)}</h3><p>${escapeHtml(activity.address)}</p>
      <dl><div><dt>Status</dt><dd>${escapeHtml(activity.status)}</dd></div><div><dt>Latest update</dt><dd>${formatDate(activity.latestUpdate)}</dd></div></dl>
      <p class="uncertainty">${escapeHtml(activity.uncertaintyNote)}</p>
      <div class="mobile-card-context"><span class="evidence-label">${escapeHtml(activity.sourceLabel)}</span><p>${escapeHtml(activity.recordKind ?? "Public record")}</p>${activity.milestone ? `<p><strong>Documented milestone</strong> · ${escapeHtml(activity.milestone)}</p>` : ""}</div>
      <button type="button" class="mobile-details-button">Full project details →</button><div class="card-evidence">
      <div class="mobile-detail-facts">${(activity.detailFacts ?? []).map(fact => `<p>${escapeHtml(fact)}</p>`).join("")}</div>
      ${activity.apn ? `<div class="location-evidence"><strong>Verified address point</strong><span>APN ${escapeHtml(activity.apn)} · reviewed ${formatDate(activity.locationReviewedAt)}</span><small>${escapeHtml(activity.locationMatchRationale ?? "")}</small><a href="${escapeHtml(activity.locationSourceUrl ?? "")}" target="_blank" rel="noreferrer">View SanGIS source ↗</a></div>` : ""}
      <a href="${escapeHtml(activity.sourceUrl)}" target="_blank" rel="noreferrer">View ${escapeHtml(activity.sourceLabel)} ↗</a></div>
    </article>`).join("") : `<p class="empty">No records match this view.</p>`;
  list.querySelectorAll<HTMLElement>(".activity-card").forEach((card) => {
    const activity = rows.find((row) => row.id === card.dataset.id)!;
    card.addEventListener("click", event => {
      if ((event.target as HTMLElement).closest("a")) return;
      void selectActivity(activity);
      if ((event.target as HTMLElement).closest(".mobile-details-button")) openDetails(card);
    });
    card.addEventListener("keydown", (event) => { if (event.target === card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void selectActivity(activity); } });
  });
  list.setAttribute("aria-busy", String(!dataReady));
  syncMap(rows);
  const selected = rows.find(row => row.id === activeId);
  if (!selected) activeId = null;
  mobile.refresh(activeId);
  highlightSelection();
  if (mobile.isMobile() && !selected && rows.length && (!initialFocusId || initialFocusHandled) && !nearbyCenter) void selectActivity(rows[0]);
}

map?.on("load", () => {
  if (!map) return;
  mapReady = true;
  const hasBuildings = addBuildingExtrusions(map);
  map.addSource("activity-points", { type: "geojson", data: activityGeoJson([]) });
  map.addLayer({ id: "activity-points", type: "circle", source: "activity-points", paint: { "circle-radius": 9, "circle-color": ["match", ["get", "category"], "restaurants", "#db6f3c", "housing", "#5568d9", "commercial", "#8c5ea8", "#26776b"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  status.textContent = hasBuildings ? "3D buildings loaded. Verified activity locations appear as colored markers." : "Basemap loaded. 3D geometry is unavailable here; activity markers remain usable.";
  render();
  void focusInitialActivity();
});
map?.on("click", "activity-points", (event) => {
  const id = event.features?.[0]?.properties?.id as string | undefined;
  const activity = activities.find((row) => row.id === id);
  if (!activity) return;
  void selectActivity(activity);
  document.querySelector<HTMLElement>("#activity-panel")!.classList.add("open");
  if (!mobile.isMobile()) document.querySelector<HTMLButtonElement>("#list-toggle")!.setAttribute("aria-expanded", "true");
  if (!mobile.isMobile()) document.querySelector<HTMLElement>(`.activity-card[data-id="${CSS.escape(activity.id)}"]`)?.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "nearest" });
});
map?.on("mouseenter", "activity-points", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
map?.on("mouseleave", "activity-points", () => { if (map) map.getCanvas().style.cursor = ""; });
map?.on("error", (event: ErrorEvent) => { console.error(event.error); status.textContent = "A map resource failed to load. The evidence list remains available."; });

Promise.all([loadBusinessSignals(), loadProjects()]).then(([signals, projects]) => {
  activities = [...signals.map(businessSignalToMapActivity), ...(projects ?? []).map(projectToMapActivity)];
  dataReady = true;
  const unsupported = new Set(["retail"]);
  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    const value = button.dataset.filter as MapFilter;
    if (unsupported.has(value) && !activities.some((activity) => activity.category === value)) {
      button.disabled = true;
      button.title = "No current public records support this category";
    }
  });
  render();
  void focusInitialActivity();
}).catch((error) => {
  console.error(error);
  list.setAttribute("aria-busy", "false");
  list.innerHTML = `<p class="empty">Records are unavailable. Please reload to try again.</p>`;
  status.textContent = isSupabaseConfigured ? "Live records could not be loaded. The map remains available." : "Connect Supabase to show live records.";
});

document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter as MapFilter;
  nearbyCenter = null;
  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  render();
}));
recordSearch.addEventListener("input", render);
document.querySelector<HTMLSelectElement>("#radius")!.addEventListener("change", render);
document.querySelector<HTMLButtonElement>("#list-toggle")!.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  if (mobile.isMobile()) {
    const open = document.querySelector('.explorer-layout')!.classList.toggle('search-open');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-controls', 'nearby-search');
    if (open) document.querySelector<HTMLInputElement>('#address')!.focus();
    return;
  }
  const panel = document.querySelector<HTMLElement>("#activity-panel")!;
  panel.classList.toggle("open");
  button.setAttribute("aria-expanded", String(panel.classList.contains("open")));
});

document.querySelector<HTMLFormElement>("#nearby-search")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.querySelector<HTMLInputElement>("#address")!.value.trim();
  if (!query) return;
  status.textContent = "Locating address…";
  try {
    nearbyCenter = await locateAddress(query);
    document.querySelector(".explorer-layout")!.classList.remove("search-open");
    document.querySelector("#list-toggle")!.setAttribute("aria-expanded", "false");
    showSearchPoint(nearbyCenter, 14.5);
    render();
    status.textContent = "Address located. Nearby results use geographic distance from verified record coordinates.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Address search failed.";
  }
});


function updateMobileSearchButton() {
  const button = document.querySelector<HTMLButtonElement>("#list-toggle")!;
  button.textContent = mobile.isMobile() ? "Search" : "Activity";
  button.setAttribute("aria-controls", mobile.isMobile() ? "nearby-search" : "activity-panel");
}
matchMedia("(max-width: 800px), (max-height: 500px) and (pointer: coarse)").addEventListener("change", updateMobileSearchButton);
updateMobileSearchButton();

// Export supports integration tests without adding globals or alternate runtime behavior.
export { map as explorerMap };
