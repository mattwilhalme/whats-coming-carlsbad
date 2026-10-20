import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { download, links, processDocuments } from './core.mjs';
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : null;
const dryRun = !process.argv.includes('--apply');
const manifest = JSON.parse(await readFile(option('--manifest') ?? 'scripts/planning/sources.json', 'utf8'));
const started_at = new Date().toISOString();
let projects, identifiers;
let client;
if (option('--catalog')) ({projects, identifiers = []} = JSON.parse(await readFile(option('--catalog'), 'utf8')));
else {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Supply --catalog for offline dry-run or Supabase credentials for catalog reads');
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
  const p = await client.from('projects').select('id,slug,name');
  const i = await client.from('project_identifiers').select('*');
  if (p.error || i.error) throw p.error ?? i.error;
  projects = p.data; identifiers = i.data;
}
const discovery = [];
const entries = [...manifest.documents];
for (const url of manifest.indexes) {
  try {
    const source = await download(url);
    const discovered = links(source.bytes.toString('utf8'), url);
    if (!discovered.length) throw Error('No document links discovered; index format may have changed');
    discovery.push({url,status:'ok',documents:discovered.length});
    for (const file_url of discovered.slice(0, 40)) if (!entries.some(e=>e.file_url===file_url)) entries.push({file_url,source_page_url:url});
  } catch (e) { discovery.push({url,status:'failed',error:e.message}); }
}
const documents = await processDocuments(entries, {projects,identifiers});
const report = {started_at,finished_at:new Date().toISOString(),mode:dryRun?'dry-run':'apply',discovery,documents,limitations:['New and ambiguous projects require review before catalog creation.','Only checksum-bound reviewed claims and milestones are published.','No OCR fallback; scanned PDFs enter the review report.']};
// Save the concrete write plan before any production writes.
await mkdir('artifacts/planning', {recursive:true});
await writeFile('artifacts/planning/plan.json', JSON.stringify(report,null,2));
if (!dryRun) {
  if (!client) throw Error('Apply requires Supabase credentials');
  for (const doc of documents) {
    if (!doc.review || doc.status !== 'existing') continue;
    try {
      const {data,error} = await client.rpc('ingest_reviewed_planning_document', {payload:doc});
      if (error) throw error;
      doc.persistence = data;
    } catch(e) { doc.persistence = {error:e.message}; }
  }
  const {error} = await client.rpc('record_planning_ingestion_run', {payload:report});
  if (error) report.run_log_error = error.message;
}
await writeFile('artifacts/planning/report.json', JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,documents:documents.map(({facts,review,...d})=>d)},null,2));
if (discovery.some(d=>d.status==='failed') || documents.some(d=>d.status==='failed'||d.persistence?.error) || report.run_log_error) process.exitCode = 1;
