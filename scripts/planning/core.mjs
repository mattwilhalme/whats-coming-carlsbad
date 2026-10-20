import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
export function allowedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['www.carlsbadca.gov','carlsbadca.gov','ceqanet.lci.ca.gov','files.ceqanet.lci.ca.gov'].includes(url.hostname)) throw Error(`Unapproved source URL: ${value}`);
  url.hash = '';
  return url.href;
}
// Explicit redirects are checked before each request. No arbitrary hosts, shell interpolation or unbounded downloads.
export async function download(url, redirects = 0) {
  url = allowedUrl(url);
  if (redirects > 5) throw Error('Too many redirects');
  const dir = await mkdtemp(join(tmpdir(), 'planning-fetch-'));
  try {
    const file = join(dir, 'body');
    const headers = join(dir, 'headers');
    const { stdout } = await exec('curl', ['--silent','--show-error','--max-time','35','--connect-timeout','10','--max-filesize','31457280','--dump-header',headers,'--output',file,'--write-out','%{http_code}',url], { timeout: 40000 });
    const status = Number(stdout);
    const headerText = await readFile(headers, 'utf8');
    if ([301,302,303,307,308].includes(status)) {
      const location = [...headerText.matchAll(/^location:\s*(.+)$/gmi)].at(-1)?.[1].trim();
      if (!location) throw Error('Redirect without location');
      return download(new URL(location, url).href, redirects + 1);
    }
    if (status !== 200) throw Error(`HTTP ${status}: ${url}`);
    return { bytes: await readFile(file), url, retrieved_at: new Date().toISOString() };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export function links(html, base) {
  const found = [];
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = allowedUrl(new URL(m[1].replaceAll('&amp;', '&'), base).href);
      if (/\.pdf(?:\?|$)|\/showpublisheddocument\/|\/Attachment\//i.test(url)) found.push(url);
    } catch { /* unrelated links are not download candidates */ }
  }
  return [...new Set(found)];
}
export async function extractPdf(bytes) {
  if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw Error('Response is not a PDF');
  const dir = await mkdtemp(join(tmpdir(), 'planning-pdf-'));
  try {
    const file = join(dir, 'source.pdf');
    const textFile = join(dir, 'source.txt');
    await writeFile(file, bytes);
    await exec('pdftotext', ['-layout', file, textFile], { timeout: 45000, maxBuffer: 1024 * 1024 });
    const pages = (await readFile(textFile, 'utf8')).split('\f');
    if (!pages.at(-1).trim()) pages.pop();
    if (!pages.length || pages.every(p => p.trim().length < 40)) throw Error('PDF has no usable embedded text; OCR/manual review required');
    return pages.map(p => p.normalize('NFKC'));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export function extractFacts(pages) {
  return pages.map((text, index) => ({
    page_number: index + 1,
    cases: [...new Set([...text.matchAll(/\b(?:SDP|DEV|CDP|CUP|CT|PUD|ZCA|LCPA|PUB)\s*\d{4}-?\d{4}\b/gi)].map(m => m[0].replace(/\s|-/g, '').toUpperCase()))],
    apns: [...new Set([...text.matchAll(/\b\d{3}-\d{3}-\d{2}(?:-\d{2})?\b/g)].map(m => m[0]))],
    // Preserve nearby source text for review; never label every address in a packet as a project address.
    text
  }));
}
export function matchProject(pages, projects, identifiers = []) {
  const text = normalize(pages.join('\n'));
  const names = projects.filter(p => text.includes(normalize(p.name)));
  const cases = new Set(extractFacts(pages).flatMap(p => p.cases));
  const ids = identifiers.filter(i => i.authority === 'City of Carlsbad' && cases.has(i.identifier.replace(/\s|-/g, '').toUpperCase()));
  const matches = new Set([...names.map(p => p.id), ...ids.map(i => i.project_id)]);
  if (matches.size !== 1) return { status: matches.size ? 'ambiguous' : 'new_candidate', project: null };
  return { status: 'existing', project: projects.find(p => p.id === [...matches][0]) };
}
export function validateReview(entry, document, project) {
  if (!entry.review) return null;
  const review = entry.review;
  if (review.sha256 !== document.sha256) throw Error('Reviewed checksum changed; manual re-review required');
  if (review.project_slug !== project?.slug) throw Error('Reviewed project does not match extracted identity');
  for (const claim of review.claims ?? []) {
    if (!Number.isInteger(claim.page_number) || !document.pages[claim.page_number - 1] || !claim.evidence_text?.trim() ||
        !normalize(document.pages[claim.page_number - 1]).includes(normalize(claim.evidence_text))) throw Error(`Claim evidence missing on cited page: ${claim.claim_key}`);
  }
  for (const event of review.events ?? []) {
    const page = document.pages[event.page_number - 1];
    if (!page || !event.evidence_text?.trim() || !normalize(page).includes(normalize(event.evidence_text))) throw Error('Event evidence missing on cited page');
    if (!['hearing_scheduled','approved','continued','denied','ceqa_exemption_posted'].includes(event.event_type)) throw Error('Unsupported event type');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date) || Number.isNaN(Date.parse(event.event_date))) throw Error('Invalid event date');
    // All milestones require checksum-bound human review. Recommendations and blank resolution templates are never automatically decisions.
    if (!event.review_note) throw Error('Event needs a review note describing date/outcome evidence');
  }
  return review;
}
export async function processDocuments(entries, { projects = [], identifiers = [], fetchDocument = download, parsePdf = extractPdf } = {}) {
  const results = [];
  for (const entry of entries) {
    let stage = 'download';
    try {
      const fetched = await fetchDocument(entry.file_url);
      stage = 'parse';
      const pages = await parsePdf(fetched.bytes);
      const doc = { file_url: allowedUrl(entry.file_url), resolved_url: fetched.url, source_page_url: allowedUrl(entry.source_page_url), title: entry.title ?? 'Planning document', document_type: entry.document_type ?? 'other', published_at: entry.published_at ?? null, retrieved_at: fetched.retrieved_at, sha256: hash(fetched.bytes), page_count: pages.length, pages };
      stage = 'match';
      const match = matchProject(pages, projects, identifiers);
      stage = 'review';
      const review = validateReview(entry, doc, match.project);
      results.push({ ...doc, pages: undefined, status: match.status, project_slug: match.project?.slug, project_name: match.project?.name, facts: extractFacts(pages), review });
    } catch (error) { results.push({ file_url: entry.file_url, status: 'failed', stage, error: error.message }); }
  }
  return results;
}
