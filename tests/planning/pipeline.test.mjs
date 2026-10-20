import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedUrl, links, normalize, hash, matchProject, validateReview, processDocuments, extractFacts, extractPdf } from '../../scripts/planning/core.mjs';
const project={id:'one',slug:'fairfield-apartments-bressi-ranch',name:'Fairfield Apartments at Bressi Ranch'};
const pages=['SDP 2024-0009 Fairfield Apartments at Bressi Ranch APNs 213-263-19, -20. Staff recommends approval.'];
const url='https://ceqanet.lci.ca.gov/2026100315/Attachment/vWzhlR';
test('Unicode PDF ligatures match the existing project',()=>assert.equal(matchProject(['Fairﬁeld Apartments at Bressi Ranch'],[project]).project.id,'one'));
test('multiple projects in packet require item-level review',()=>assert.equal(matchProject([...pages,'Other Development'],[project,{id:'two',name:'Other Development'}]).status,'ambiguous'));
test('case identifiers can match without a name',()=>assert.equal(matchProject(['SDP2024-0009'],[project],[{authority:'City of Carlsbad',identifier:'SDP 2024-0009',project_id:'one'}]).status,'existing'));
test('conflicting case and name matches are ambiguous',()=>assert.equal(matchProject(pages,[project,{id:'two',name:'Other Development'}],[{authority:'City of Carlsbad',identifier:'SDP20240009',project_id:'two'}]).status,'ambiguous'));
test('unknown project is staged and not silently created',()=>assert.equal(matchProject(['Unknown project'],[project]).status,'new_candidate'));
test('case extraction normalizes hyphens and spaces',()=>assert.deepEqual(extractFacts(['SDP 2024-0009 DEV2022-0186'])[0].cases,['SDP20240009','DEV20220186']));
test('URLs reject credentials, arbitrary hosts and non-HTTPS',()=>{for(const u of ['http://www.carlsbadca.gov/a','https://example.com/a.pdf','https://user@www.carlsbadca.gov/a']) assert.throws(()=>allowedUrl(u));});
test('HTML discovers extensionless city and CEQAnet PDF URLs, deduplicates',()=>assert.deepEqual(links('<a href="/Home/ShowPublishedDocument/1/2">Packet</a><a href="/Home/ShowPublishedDocument/1/2">same</a><a href="https://evil.test/a.pdf">bad</a>', 'https://www.carlsbadca.gov/a'),['https://www.carlsbadca.gov/Home/ShowPublishedDocument/1/2']));
test('HTML masquerading as PDF is rejected',async()=>assert.rejects(extractPdf(Buffer.from('<html>Access Denied</html>')),/not a PDF/));
test('failed PDF does not stop subsequent documents',async()=>{
 const result=await processDocuments([{file_url:url,source_page_url:url},{file_url:url,source_page_url:url}],{projects:[project],fetchDocument:async()=>({bytes:Buffer.from('data'),url,retrieved_at:new Date().toISOString()}),parsePdf:(()=>{let n=0;return async()=>{if(n++===0)throw Error('bad pdf');return pages;};})()});
 assert.equal(result[0].stage,'parse'); assert.equal(result[1].status,'existing');
});
test('unreviewed recommendations do not produce approval milestones',()=>assert.equal(validateReview({}, {pages},project),null));
test('reviewed checksum change fails closed',()=>assert.throws(()=>validateReview({review:{sha256:'old'}},{sha256:'new',pages},project),/checksum changed/));
test('wrong project and page evidence are rejected',()=>{
 assert.throws(()=>validateReview({review:{sha256:'x',project_slug:'other'}},{sha256:'x',pages},project),/does not match/);
 assert.throws(()=>validateReview({review:{sha256:'x',project_slug:project.slug,claims:[{page_number:2,evidence_text:'SDP',claim_key:'case'}]}},{sha256:'x',pages},project),/evidence missing/);
});
test('repeated extraction gives stable matching and content identity',async()=>{
 const options={projects:[project],fetchDocument:async()=>({bytes:Buffer.from('data'),url,retrieved_at:'2026-10-20T00:00:00Z'}),parsePdf:async()=>pages};
 const entries=[{file_url:url,source_page_url:url}];
 assert.deepEqual(await processDocuments(entries,options),await processDocuments(entries,options));
 assert.equal(hash(Buffer.from('data')),hash(Buffer.from('data')));
 assert.equal(normalize('Fairﬁeld'),normalize('Fairfield'));
});
