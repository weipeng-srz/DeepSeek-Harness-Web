import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round5'
const baselineRef = process.env.QA_BASELINE_REF || '2df5d3d0c601d681f59362c8807c09b90b002590'
const baselinePublic = process.env.QA_BASELINE_PUBLIC ? path.resolve(process.env.QA_BASELINE_PUBLIC) : null
function expectedAssets(publicDir) {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  const codex = fs.readFileSync(path.join(publicDir, 'js/codex.js'), 'utf8')
  const extract = (text, pattern) => { const match = text.match(pattern); if (!match) throw new Error(`Missing expected release asset ${pattern} in ${publicDir}`); return match[0] }
  return { app: extract(html, /\/js\/app\.js\?v=\d+/), codex: extract(html, /\/js\/codex\.js\?v=\d+/), bundle: extract(html, /\/css\/bundle\.css\?v=\d+/), codexCSS: extract(codex, /\/css\/codex\.css\?v=\d+/) }
}
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8799), label: `${label}-release` })
async function assetContentHashes(publicDir, assets) {
  const hashes = {}
  for (const [key, url] of Object.entries(assets)) {
    let content
    if (key === 'bundle') {
      // Read the generated route from the isolated server while this exact
      // public tree is installed; a fixed CSS list could miss a new layer.
      const response = await fetch(sandbox.base + url, { cache: 'no-store' })
      if (!response.ok || !response.headers.get('content-type')?.includes('text/css')) throw new Error(`Cannot fingerprint CSS bundle (${response.status})`)
      content = Buffer.from(await response.arrayBuffer())
    } else content = fs.readFileSync(path.join(publicDir, url.split('?')[0]))
    hashes[key] = createHash('sha256').update(content).digest('hex')
  }
  return hashes
}
const browser = await launchBrowser()
const results = []
const record = (name, ok, evidence = {}) => { results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) }
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' })
  const page = await context.newPage(); await loginPage(page, sandbox)
  await page.keyboard.press('Meta+p'); await page.locator('#quickSwitcher').waitFor({ state: 'visible' })
  await page.waitForTimeout(350) // Measure the settled touch target, after entry motion.
  const quickClose = page.locator('#quickSwitcher').getByRole('button', { name: /关闭/ }).first()
  const hasQuickClose = await quickClose.count() > 0 && await quickClose.isVisible()
  const quickRect = hasQuickClose ? await quickClose.boundingBox() : null
  if (hasQuickClose) await quickClose.tap(); else await page.keyboard.press('Escape')
  record('quick switcher has a visible touch close control', hasQuickClose && quickRect.width >= 44 && quickRect.height >= 44 && !await page.locator('#quickSwitcher').isVisible(), { rect: quickRect })
  await page.locator('#engineCodex').click(); await page.locator('#codexSettingsBtn').waitFor({ state: 'visible' }); await page.locator('#codexSettingsBtn').click(); await page.locator('.codex-pop').waitFor()
  await page.waitForTimeout(350)
  const modelClose = page.locator('.codex-pop').getByRole('button', { name: /关闭/ }).first()
  const hasModelClose = await modelClose.count() > 0 && await modelClose.isVisible()
  const modelRect = hasModelClose ? await modelClose.boundingBox() : null
  if (hasModelClose) await modelClose.tap(); else await page.keyboard.press('Escape')
  record('model settings has a visible touch close control and restores focus', hasModelClose && modelRect.width >= 44 && modelRect.height >= 44 && await page.locator('.codex-pop').count() === 0 && await page.evaluate(() => document.activeElement.id) === 'codexSettingsBtn', { rect: modelRect })
  await context.close()

  const swPath = path.join(sandbox.dir, 'public/sw.js')
  const latestWorker = fs.readFileSync(swPath, 'utf8')
  const latestVersion = latestWorker.match(/const VERSION\s*=\s*['"]([^'"]+)/)?.[1]
  const oldWorker = baselinePublic ? fs.readFileSync(path.join(baselinePublic, 'sw.js'), 'utf8') : execFileSync('git', ['show', `${baselineRef}:public/sw.js`], { cwd: ROOT, encoding: 'utf8' })
  const oldVersion = oldWorker.match(/const VERSION\s*=\s*['"]([^'"]+)/)?.[1]
  if (!baselinePublic && oldVersion !== 'dsh-v14') throw new Error(`Baseline ref ${baselineRef} must contain the original dsh-v14 worker; set QA_BASELINE_REF to the original baseline revision or QA_BASELINE_PUBLIC to a frozen previous public directory`)
  record('release service worker version differs from the installed baseline', Boolean(latestVersion && oldVersion && latestVersion !== oldVersion), { oldVersion, latestVersion })
  if (!latestVersion || !oldVersion || latestVersion === oldVersion) throw new Error('Service worker upgrade test blocked: release worker version must differ from the frozen baseline')
  // Restore the complete old public tree in this isolated sandbox, including
  // HTML, scripts and CSS. Installing only the old worker over new HTML would
  // verify cache eviction but would not exercise an old installed client.
  const publicDir = path.join(sandbox.dir, 'public')
  const finalPublicDir = path.join(sandbox.dir, 'public-release-snapshot')
  fs.cpSync(publicDir, finalPublicDir, { recursive: true })
  const expectedNew = expectedAssets(finalPublicDir)
  const newContentHashes = await assetContentHashes(finalPublicDir, expectedNew)
  fs.rmSync(publicDir, { recursive: true })
  if (baselinePublic) fs.cpSync(baselinePublic, publicDir, { recursive: true })
  else {
    const oldPublicArchive = execFileSync('git', ['archive', baselineRef, 'public'], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 })
    execFileSync('tar', ['-xf', '-', '-C', sandbox.dir], { input: oldPublicArchive })
  }
  const expectedOld = expectedAssets(publicDir)
  const oldContentHashes = await assetContentHashes(publicDir, expectedOld)
  const swContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow' })
  const swPage = await swContext.newPage(); await loginPage(swPage, sandbox)
  await swPage.evaluate(async () => { await navigator.serviceWorker.ready })
  await swPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await swPage.reload(); await swPage.locator('#shell').waitFor({ state: 'visible' }); await swPage.waitForTimeout(1000)
  // Exercise the old Codex code and its dynamically requested stylesheet.
  await swPage.locator('#engineCodex').click(); await swPage.locator('#codexSettingsBtn').click(); await swPage.locator('.codex-pop').waitFor(); await swPage.keyboard.press('Escape')
  const initial = await swPage.evaluate(async oldVersion => {
    const app = [...document.scripts].find(script => script.src.includes('/js/app.js')).src
    const relative = value => new URL(value).pathname + new URL(value).search
    const assets = {
      app: relative(app),
      codex: relative([...document.scripts].find(script => script.src.includes('/js/codex.js')).src),
      bundle: relative(document.querySelector('link[href*="/css/bundle.css"]').href),
      codexCSS: relative(document.querySelector('link[data-codex-css]').href),
    }
    const cache = await caches.open(oldVersion)
    await cache.put(app, new Response('window.__QA_STALE_ASSET__ = true;', { headers: { 'Content-Type': 'application/javascript' } }))
    return { caches: await caches.keys(), asset: relative(app), assets, controlled: Boolean(navigator.serviceWorker.controller), appVisible: !document.querySelector('#shell').hidden }
  }, oldVersion)
  const oldAssets = Object.entries(expectedOld).every(([key, value]) => initial.assets[key] === value)
  record('real baseline worker controls its original HTML and assets', initial.caches.includes(oldVersion) && initial.controlled && initial.appVisible && oldAssets, { ...initial, expected: expectedOld })
  if (!oldAssets) throw new Error('Old installed client did not load the frozen baseline resource URLs')
  await swPage.screenshot({ path: path.join(out, `release-old-${oldVersion}-client.png`), fullPage: true })
  // Restore the exact final copied files without reloading the old page. The
  // old client's own updatefound handler must display the update action.
  fs.rmSync(publicDir, { recursive: true }); fs.cpSync(finalPublicDir, publicDir, { recursive: true })
  await swPage.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update() })
  await swPage.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))
  await swPage.locator('#toast').getByRole('button', { name: /刷新/ }).click()
  await swPage.waitForTimeout(1300); await swPage.locator('#shell').waitFor({ state: 'visible' })
  const updated = await swPage.evaluate(async () => {
    const relative = value => new URL(value).pathname + new URL(value).search
    return { caches: await caches.keys(), stale: Boolean(window.__QA_STALE_ASSET__), controlled: Boolean(navigator.serviceWorker.controller), appVisible: !document.querySelector('#shell').hidden, assets: {
      app: relative([...document.scripts].find(script => script.src.includes('/js/app.js')).src),
      codex: relative([...document.scripts].find(script => script.src.includes('/js/codex.js')).src),
      bundle: relative(document.querySelector('link[href*="/css/bundle.css"]').href),
      codexCSS: relative(document.querySelector('link[data-codex-css]').href),
    }, newQuickClose: Boolean(document.querySelector('#quickClose')) }
  })
  const newAssets = Object.entries(expectedNew).every(([key, value]) => updated.assets[key] === value)
  const assetChanges = Object.fromEntries(Object.keys(expectedOld).map(key => [key, { contentChanged: oldContentHashes[key] !== newContentHashes[key], urlChanged: expectedOld[key] !== expectedNew[key], oldHash: oldContentHashes[key], newHash: newContentHashes[key] }]))
  const changedAssetsVersioned = Object.values(assetChanges).every(asset => !asset.contentChanged || asset.urlChanged)
  record('installed client upgrade removes obsolete cache and loads new HTML and fresh assets', !updated.caches.includes(oldVersion) && updated.caches.includes(latestVersion) && !updated.stale && updated.controlled && updated.appVisible && newAssets && changedAssetsVersioned && updated.newQuickClose, { ...updated, expected: expectedNew, assetChanges, changedAssetsVersioned })
  // Reload online once so every dynamically requested shell asset is warmed.
  await swPage.reload(); await swPage.locator('#shell').waitFor({ state: 'visible' }); await swPage.waitForTimeout(1000)
  const cachedAPIs = await swPage.evaluate(async () => {
    const keys = await caches.keys(); const paths = []
    for (const key of keys) for (const request of await (await caches.open(key)).keys()) if (new URL(request.url).pathname.startsWith('/api/')) paths.push(new URL(request.url).pathname)
    return paths
  })
  record('service worker does not store private API responses', cachedAPIs.length === 0, { cachedAPIs })
  await swContext.setOffline(true); await swPage.reload({ waitUntil: 'domcontentloaded' }); await swPage.locator('#shell').waitFor({ state: 'visible' })
  await swPage.locator('#reconnectBar.offline').waitFor({ state: 'visible' }); await swPage.waitForTimeout(400)
  const offline = await swPage.evaluate(async () => { let apiRejected = false; try { await fetch('/api/me') } catch { apiRejected = true } return { shellVisible: !document.querySelector('#shell').hidden, offline: !navigator.onLine, apiRejected, feedback: document.querySelector('#reconnectText').textContent } })
  record('offline reload renders cached shell while API stays network-only', offline.shellVisible && offline.offline && offline.apiRejected && offline.feedback.includes('网络中断'), offline)
  await swPage.screenshot({ path: path.join(out, 'release-offline-shell.png'), fullPage: true })
  await swContext.setOffline(false); await swPage.reload(); await swPage.locator('#shell').waitFor({ state: 'visible' })
  record('online recovery restores authenticated application', await swPage.locator('#shell').isVisible() && !await swPage.locator('#loginView').isVisible())
  await swContext.close()
} catch (error) { results.push({ name: 'release harness execution', status: 'blocked', evidence: { error: error.stack } }); console.error(error.stack) }
finally {
  fs.writeFileSync(path.join(out, 'release.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), baselineRef: baselinePublic ? null : baselineRef, baselinePublic, scope: 'Isolated service-worker-enabled Chrome. Full original public tree from a pinned revision or frozen baseline directory actually loaded, including HTML/JS/CSS. Restored final public tree and clicked the old client update action. Resource URLs verified against each source tree; every resource with changed content must change URL, while byte-identical resources may reuse their URL. Generated CSS compared using actual isolated HTTP response content. Synthetic stale old static asset; no user site caches touched.', sourceSnapshot: sandbox.dir, results }, null, 2))
  await browser.close(); await sandbox.stop()
}
