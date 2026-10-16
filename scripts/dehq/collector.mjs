import { chromium } from "playwright-core";
import { normalizeName, normalizeStreet, normalizeSuite, normalizeText } from "../abc/normalize.mjs";

export const DEHQ_SEARCH_URL = "https://publicservices.sandiegocounty.gov/CitizenAccess/Cap/CapHome.aspx?module=LUEG-DEH&TabName=LUEG-DEH";
const FOOD_PLAN_ID = /^DEH\d{4}-(?:FFPP|FAMD)-/;

export function parseUsDate(value) {
  const match = normalizeText(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : null;
}

export function parseDehqAddress(value) {
  const raw = normalizeText(value);
  const cityMatch = raw.match(/^(.*?),?\s+CARLSBAD\s+CA\s+(\d{5})(\d{4})?(?:\s+United States)?$/i);
  if (!cityMatch) return { address_raw: raw, street: raw, suite: "", street_normalized: normalizeStreet(raw), suite_normalized: "", city: "", state: "", postal_code: "" };
  const premise = cityMatch[1].replace(/,\s*$/, "");
  const parts = premise.split(/,\s*/);
  const street = parts.shift() ?? premise;
  const suite = parts.join(" ").replace(/^SUITE\s+/i, "STE ");
  return {
    address_raw: raw,
    street,
    suite,
    street_normalized: normalizeStreet(street),
    suite_normalized: normalizeSuite(suite),
    city: "CARLSBAD",
    state: "CA",
    postal_code: cityMatch[3] ? `${cityMatch[2]}-${cityMatch[3]}` : cityMatch[2]
  };
}

export function normalizeDehqRows(rows) {
  const warnings = [];
  const records = [];
  for (const row of rows) {
    const recordNumber = normalizeText(row.record_number).toUpperCase();
    if (!FOOD_PLAN_ID.test(recordNumber)) continue;
    const openedDate = parseUsDate(row.opened_date);
    const projectName = normalizeText(row.project_name);
    const address = parseDehqAddress(row.address);
    if (!openedDate || !projectName || !address.street_normalized || !address.city) {
      warnings.push({ record_number: recordNumber || null, reason: "missing date, project name, or parseable Carlsbad address" });
      continue;
    }
    records.push({
      record_number: recordNumber,
      opened_date: openedDate,
      record_type: normalizeText(row.record_type),
      project_name: projectName,
      project_name_normalized: normalizeName(projectName),
      status: normalizeText(row.status),
      detail_url: new URL(row.detail_url, DEHQ_SEARCH_URL).href,
      ...address
    });
  }
  return { records: [...new Map(records.map((record) => [record.record_number, record])).values()].sort((a, b) => a.record_number.localeCompare(b.record_number)), warnings };
}

async function extractPageRows(page) {
  return page.locator("#ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList tr").evaluateAll((rows) => rows.map((row) => {
    const cells = [...row.querySelectorAll(":scope > td")];
    const link = row.querySelector('a[href*="CapDetail.aspx"]');
    if (!link) return null;
    const idCell = cells.findIndex((cell) => cell.contains(link));
    if (idCell < 0 || cells.length < idCell + 6) return null;
    const text = (offset) => (cells[idCell + offset]?.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      record_number: (link.textContent ?? "").trim(),
      opened_date: text(1),
      record_type: text(2),
      project_name: text(3),
      address: text(4),
      status: text(5),
      detail_url: link.getAttribute("href") ?? ""
    };
  }).filter(Boolean));
}

export async function collectDehqSearch({ city = "CARLSBAD", startDate, endDate, channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome", maxPages = 30 } = {}) {
  if (!startDate || !endDate) throw new Error("startDate and endDate are required in MM/DD/YYYY format");
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(DEHQ_SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate").fill(startDate);
    await page.locator("#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate").fill(endDate);
    await page.locator("#ctl00_PlaceHolderMain_generalSearchForm_txtGSCity").fill(city);
    await page.locator("#ctl00_PlaceHolderMain_btnNewSearch").click();
    await page.locator("#ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList").waitFor({ state: "visible", timeout: 60_000 });

    const rows = [];
    let pages = 0;
    while (pages < maxPages) {
      pages += 1;
      const pageRows = await extractPageRows(page);
      rows.push(...pageRows);
      const next = page.getByRole("link", { name: "Next >", exact: true });
      if (await next.count() === 0) break;
      const firstRecord = pageRows[0]?.record_number ?? "";
      await next.click();
      await page.waitForFunction((previous) => {
        const link = document.querySelector('#ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList a[href*="CapDetail.aspx"]');
        return link && link.textContent?.trim() !== previous;
      }, firstRecord, { timeout: 60_000 });
      await page.waitForTimeout(750);
    }
    if (pages >= maxPages && await page.getByRole("link", { name: "Next >", exact: true }).count()) throw new Error(`DEHQ results exceeded the ${maxPages}-page safety limit`);
    return { sourceRecordCount: rows.length, pages, ...normalizeDehqRows(rows) };
  } finally {
    await browser.close();
  }
}

export function validateDehqCollection(result, { minimumSourceRecords = 1, minimumFilteredRecords = 1 } = {}) {
  if (result.sourceRecordCount < minimumSourceRecords) throw new Error(`DEHQ search appears incomplete: ${result.sourceRecordCount} source records`);
  if (result.records.length < minimumFilteredRecords) throw new Error("DEHQ search contains no usable Carlsbad food-plan records");
  return true;
}
