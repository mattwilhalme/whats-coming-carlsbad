import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// All data and map tiles are local fixtures. Never read or write production data.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  env: { ...process.env, VITE_SUPABASE_URL: 'https://explorer-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key' }, stdio: 'inherit'
});
let browser;
const base = 'http://127.0.0.1:5173';
const signals = Array.from({ length: 6 }, (_, i) => ({
  id: `fixture-${i}`, display_name: `Fixture Kitchen ${i + 1}`, legal_applicant: null,
  address: `${100 + i} Test Street`, full_address: `${100 + i} Test Street, Carlsbad, CA`, suite: null,
  license_type: '41', license_or_application: 'APP', status: 'PEND', source_date: '2026-10-01',
  first_seen_at: '2026-10-01T00:00:00Z', last_seen_at: '2026-10-19T00:00:00Z',
  source_url: 'https://example.gov/evidence', uncertainty_note: 'Application, not a confirmed opening or tenant change.',
  signal_kind: 'pending_application', evidence_level: 'new_pending', is_baseline: false,
  latitude: 33.1581, longitude: -117.3506 + i * .002, location_confidence: 1,
  location_review_note: 'Fixture reviewed address point, not a verified building.', location_reviewed_at: '2026-10-19T00:00:00Z'
}));
const projects = [{ id: 'unlocated', slug: 'unlocated', name: 'Fixture Unlocated Homes', category: 'apartments', location_text: 'Address not yet verified', proposed_units: 20, affordable_units: 2, commercial_sqft: null, current_status: 'Proposed', status_as_of: '2026-10-01', source_label: 'Planning notice', source_url: 'https://example.gov/notice' }];
async function mapCall(page, method, args = []) {
  return page.evaluate(async ({ method, args }) => {
    const { explorerMap } = await import('/src/explore.ts');
    const result = explorerMap[method](...args);
    return result === explorerMap ? null : result;
  }, { method, args });
}
async function selected(page, id) {
  await page.waitForFunction(id => document.querySelector('#activity-list .selected')?.getAttribute('data-id') === id, id);
}
async function cameraAt(page, longitude) {
  await page.waitForFunction(async longitude => {
    const { explorerMap } = await import('/src/explore.ts');
    return !explorerMap.isMoving() && Math.abs(explorerMap.getCenter().lng - longitude) < .00001;
  }, longitude);
}
async function swipe(page) {
  const box = await page.locator('#activity-list').boundingBox();
  const session = await page.context().newCDPSession(page);
  const y = box.y + Math.min(65, box.height / 2), start = box.x + box.width * .85;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
  for (let i = 1; i <= 12; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start - box.width * .7 * i / 12, y }] });
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (attempt === 99) throw new Error('Preview did not start');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await mkdir('artifacts/mobile-explorer', { recursive: true });
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.route('https://explorer-test.supabase.co/**', route => {
    assert.equal(route.request().method(), 'GET', 'fixture data access must remain read-only');
    return route.fulfill({ json: route.request().url().includes('abc_business_signals_public') ? signals : route.request().url().includes('projects_public') ? projects : [] });
  });
  await context.route('https://tiles.openfreemap.org/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5ede8' } }] } }));
  await context.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [{ lat: '33.1581', lon: '-117.3506' }] }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/explore.html`);
  await selected(page, 'signal:fixture-0');
  await page.waitForFunction(async () => (await import('/src/explore.ts')).explorerMap.getLayer('activity-points'));
  await cameraAt(page, signals[0].longitude);
  assert.equal(await page.locator('.activity-card').count(), 7);
  async function assertShare(share) {
    await page.waitForFunction(share => {
      const layout = document.querySelector('.explorer-layout').getBoundingClientRect();
      const shell = document.querySelector('.map-shell').getBoundingClientRect();
      const canvas = document.querySelector('.maplibregl-canvas').getBoundingClientRect();
      return Math.abs(shell.height / layout.height * 100 - share) < 1 && Math.abs(canvas.height - shell.height) < 2;
    }, share);
  }
  await assertShare(50);
  // Five actual touch swipes; verify each card, camera and selected marker expression.
  for (let i = 1; i <= 5; i++) {
    await swipe(page);
    await selected(page, `signal:fixture-${i}`);
    await cameraAt(page, signals[i].longitude);
    assert.match(JSON.stringify(await mapCall(page, 'getPaintProperty', ['activity-points', 'circle-radius'])), new RegExp(`signal:fixture-${i}`));
  }
  // Tap a real rendered MapLibre circle after panning the map independently.
  await mapCall(page, 'jumpTo', [{ center: [signals[0].longitude, signals[0].latitude] }]);
  const point = await mapCall(page, 'project', [[signals[0].longitude, signals[0].latitude]]);
  const canvas = await page.locator('.maplibregl-canvas').boundingBox();
  await page.touchscreen.tap(canvas.x + point.x, canvas.y + point.y);
  await selected(page, 'signal:fixture-0');
  await page.waitForFunction(() => document.querySelector('#activity-list').scrollLeft < 2);
  // Drag to Explore, then Details. ResizeObserver must follow the animated canvas.
  let handle = await page.locator('.panel-handle').boundingBox();
  await page.mouse.move(handle.x + 30, handle.y + 20); await page.mouse.down();
  await page.mouse.move(handle.x + 30, handle.y + 180, { steps: 14 }); await page.mouse.up();
  await assertShare(65);
  await swipe(page); await selected(page, 'signal:fixture-1'); await cameraAt(page, signals[1].longitude);
  handle = await page.locator('.panel-handle').boundingBox();
  await page.mouse.move(handle.x + 30, handle.y + 20); await page.mouse.down();
  await page.mouse.move(handle.x + 30, handle.y - 340, { steps: 14 }); await page.mouse.up();
  await assertShare(20);
  await page.getByRole('button', { name: 'Browse', exact: true }).click(); await assertShare(50);
  const before = await mapCall(page, 'getCenter');
  for (let i = 2; i <= 6; i++) { await page.getByRole('button', { name: 'Next project', exact: true }).click(); await selected(page, i === 6 ? 'project:unlocated' : `signal:fixture-${i}`); }
  const noPointCenter = await mapCall(page, 'getCenter');
  await cameraAt(page, signals[5].longitude);
  assert.ok(Number.isFinite(noPointCenter.lng) && Number.isFinite(before.lng));
  assert.match(await page.locator('#map-status').innerText(), /Location pending/);
  await page.locator('.selected .mobile-details-button').click();
  assert.equal(await page.locator('dialog').isVisible(), true);
  assert.match(await page.locator('dialog').innerText(), /20 proposed homes/);
  await page.getByRole('button', { name: 'Close details' }).click();
  await selected(page, 'project:unlocated');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.locator('#record-search').fill('Kitchen 3');
  assert.equal(await page.locator('#activity-list .activity-card').count(), 1);
  await page.locator('#record-search').fill('no-match');
  assert.match(await page.locator('#activity-list').innerText(), /No records/);
  await page.locator('#record-search').fill('');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('#address').fill('100 Test Street');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#coverage').textContent.includes('within 1 mile'));
  await page.goto(`${base}/explore.html?focus=signal%3Afixture-2`);
  await selected(page, 'signal:fixture-2'); await cameraAt(page, signals[2].longitude);
  assert.equal(await page.locator('#activity-list .activity-card').count(), 7, 'deep link retains browsing context');
  async function selectedPointVisible() {
    await page.waitForFunction(async () => {
      const { explorerMap: map } = await import('/src/explore.ts');
      const point = map.project([-117.3506 + 2 * .002, 33.1581]);
      const canvas = map.getCanvas();
      return point.x > 16 && point.x < canvas.clientWidth - 16 && point.y > 16 && point.y < canvas.clientHeight - 16
        && map.queryRenderedFeatures([point.x, point.y], { layers: ['activity-points'] }).some(feature => feature.properties.id === 'signal:fixture-2');
    });
  }
  await page.setViewportSize({ width: 320, height: 568 }); await assertShare(50);
  await selectedPointVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'artifacts/mobile-explorer/narrow.png' });
  await page.setViewportSize({ width: 844, height: 390 }); await assertShare(50);
  await selectedPointVisible();
  await selected(page, 'signal:fixture-2');
  await page.screenshot({ path: 'artifacts/mobile-explorer/landscape.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Explore', exact: true }).click(); await assertShare(65);
  await page.screenshot({ path: 'artifacts/mobile-explorer/mobile.png' });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Reuse fixture routing; production data is never contacted.
  await desktop.route('https://explorer-test.supabase.co/**', route => route.fulfill({ json: route.request().url().includes('abc_business_signals_public') ? signals : projects }));
  await desktop.route('https://tiles.openfreemap.org/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5ede8' } }] } }));
  const wide = await desktop.newPage(); await wide.goto(`${base}/explore.html`);
  await wide.waitForSelector('.activity-card');
  assert.equal(await wide.locator('.mobile-panel-bar').isVisible(), false);
  assert.equal(await wide.locator('#nearby-search').isVisible(), true);
  const bounds = await wide.locator('.activity-panel').boundingBox();
  assert.equal(Math.round(bounds.width), 390);
  await wide.locator('.activity-card').nth(2).click(); await selected(wide, 'signal:fixture-2');
  await cameraAt(wide, signals[2].longitude);
  await wide.screenshot({ path: 'artifacts/mobile-explorer/desktop.png' });
  // WebGL is optional for reading evidence: simulate an unsupported GPU.
  const unavailable = await context.newPage();
  await unavailable.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (String(type).startsWith('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  await unavailable.goto(`${base}/explore.html`);
  await unavailable.waitForSelector('#activity-list .activity-card');
  assert.equal(await unavailable.locator('#activity-list .activity-card').count(), 7);
  assert.match(await unavailable.locator('#map').innerText(), /3D map unavailable/);
  await unavailable.getByRole('button', { name: 'Next project', exact: true }).click();
  await selected(unavailable, 'signal:fixture-1');
  assert.deepEqual(errors, []);
  console.log('PASS: five touch swipes, map camera/highlight, real marker tap, panel drags, partial panel swipe, details return, missing coordinates/images, filters/search, focus deep link, narrow/rotated viewports, reduced motion and desktop. Chromium mobile emulation, not physical iOS/Android.');
} finally {
  await browser?.close();
  server.kill();
}
