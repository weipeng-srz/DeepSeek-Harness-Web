import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'codex-modal-R5'
const out = path.join(ROOT, 'reports/quality', label); fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8794), label })
const expectedStylesheet = fs.readFileSync(path.join(sandbox.dir, 'public/js/codex.js'), 'utf8').match(/\/css\/codex\.css\?v=\d+/)?.[0]
const browser = await launchBrowser(), results = []
const catalog = { source: 'cache', models: ['Balanced', 'Fast'].map((name, i) => ({ id: `qa-${name.toLowerCase()}`, name: `QA ${name}`, default: i === 0, defaultEffort: 'medium', efforts: ['low', 'medium', 'high'].map(value => ({ value, label: value })) })) }
const record = async (name, action) => { try { const detail = await action(); results.push({ name, passed: true, ...detail }); console.log(`PASS ${name}`) } catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`) } }
let context, page
try {
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [{ engine: 'codex', title: 'Modal fixture', messages: [{ role: 'user', text: 'Synthetic modal test' }, { role: 'assistant', text: 'No model invocation.', status: 'done' }] }] }) })
  const id = (await sandbox.api('/api/conversations')).body.conversations[0].id
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page = await context.newPage(); const chatRequests = []
  page.on('request', request => { if (/\/chat$/.test(new URL(request.url()).pathname)) chatRequests.push(request.url()) })
  await page.route('**/api/codex/models', route => route.fulfill({ status: 200, json: catalog }))
  await loginPage(page, sandbox); await page.locator(`[data-id="${id}"] .conv-main`).click()
  const trigger = page.locator('#codexFootBtn'), modal = page.locator('.codex-pop')
  await trigger.waitFor({ state: 'visible' }); await page.waitForTimeout(400)
  const open = async () => { if (!(await modal.count())) await trigger.click(); await modal.waitFor(); await page.waitForTimeout(220) }
  await record('visible named close has 44px target and true modal background', async () => {
    await open()
    const close = modal.getByRole('button', { name: '关闭 Codex 设置', exact: true }); await close.waitFor({ timeout: 1000 })
    const box = await close.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box))
    assert.equal(await modal.getAttribute('aria-modal'), 'true'); assert.equal(await page.locator('#shell').evaluate(node => node.inert), true)
    await page.screenshot({ path: path.join(out, 'desktop-modal.png'), fullPage: true })
    return { width: box.width, height: box.height }
  })
  await record('Tab and ShiftTab wrap within model panel', async () => {
    await open()
    const buttons = modal.locator('button:enabled'); const first = buttons.first(), last = buttons.last()
    await last.focus(); await page.keyboard.press('Tab'); assert.equal(await first.evaluate(node => node === document.activeElement), true)
    await first.focus(); await page.keyboard.press('Shift+Tab'); assert.equal(await last.evaluate(node => node === document.activeElement), true)
  })
  await record('Escape and visible close restore the trigger and release inert', async () => {
    await open(); await page.keyboard.press('Escape'); assert.equal(await modal.count(), 0)
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true); assert.equal(await page.locator('#shell').evaluate(node => node.inert), false)
    await open(); await modal.getByRole('button', { name: '关闭 Codex 设置', exact: true }).click()
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true); assert.equal(await page.locator('#shell').evaluate(node => node.inert), false)
  })
  await record('model response redraw retains a visible focus target', async () => {
    await open(); await modal.locator('.codex-model-choice').nth(1).click(); await page.waitForTimeout(350)
    assert.equal(await modal.evaluate(node => node.contains(document.activeElement) && document.activeElement.getClientRects().length > 0), true)
    return { focusedClass: await page.evaluate(() => document.activeElement.className) }
  })
  await record('Escape dismisses only Codex while another modal retains its lock', async () => {
    await open(); await page.keyboard.press('Meta+k'); await page.locator('#palette').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape'); assert.equal(await modal.count(), 0)
    assert.equal(await page.locator('#palette').isVisible(), true); assert.equal(await page.locator('#shell').evaluate(node => node.inert), true)
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#palette').isVisible(), false); assert.equal(await page.locator('#shell').evaluate(node => node.inert), false)
  })
  await record('repeated open and close never leaves background inert', async () => {
    for (let i = 0; i < 3; i++) { await open(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#shell').evaluate(node => node.inert), false) }
  })
  await record('outside pointer closes without activating the obscured control', async () => {
    const settings = page.locator('#settingsBtn'), box = await settings.boundingBox()
    await open(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    assert.equal(await modal.count(), 0); assert.equal(await page.locator('#settingsSheet').isVisible(), false)
    assert.equal(await trigger.evaluate(node => node === document.activeElement), false)
  })
  await record('390 to 1440 resize removes sheet styling and stays in viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await open(); assert.equal(await modal.evaluate(node => node.classList.contains('is-sheet')), true)
    const close = modal.getByRole('button', { name: '关闭 Codex 设置', exact: true }), closeBox = await close.boundingBox(); assert.ok(closeBox.width >= 44 && closeBox.height >= 44)
    await page.screenshot({ path: path.join(out, 'mobile-modal.png'), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForTimeout(250)
    assert.equal(await modal.evaluate(node => node.classList.contains('is-sheet')), false)
    const desktop = await modal.boundingBox(); assert.ok(desktop.width < 500 && desktop.x >= 0 && desktop.y >= 0 && desktop.x + desktop.width <= 1440 && desktop.y + desktop.height <= 1000)
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250)
    const mobile = await modal.boundingBox(); assert.ok(mobile.x >= -1 && mobile.x + mobile.width <= 391 && mobile.y >= -1 && mobile.y + mobile.height <= 845, JSON.stringify(mobile))
    return { desktop, mobile }
  })
  await record('reduced motion disables panel animation', async () => {
    await page.keyboard.press('Escape'); await page.emulateMedia({ reducedMotion: 'reduce' }); await open()
    const duration = await modal.evaluate(node => getComputedStyle(node).animationDuration)
    assert.ok(duration.split(',').every(value => parseFloat(value) <= 0.01)); return { duration }
  })
  await record('Codex stylesheet uses the new immutable URL', async () => {
    assert.ok(expectedStylesheet, 'Source must declare a versioned stylesheet URL')
    assert.equal(await page.locator('link[data-codex-css]').getAttribute('href'), expectedStylesheet)
    assert.equal(chatRequests.length, 0)
  })
} finally {
  await context?.close(); await browser.close(); await sandbox.stop()
  const report = { capturedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, expectedStylesheet, fixture: 'Synthetic catalog and messages, real Chrome UI and isolated HTTP, no model turns', results, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length }
  fs.writeFileSync(path.join(out, 'modal.json'), JSON.stringify(report, null, 2)); if (!label.startsWith('apple-')) fs.writeFileSync(path.join(ROOT, 'docs/product/quality-2026-10-22/evidence', `${label}.json`), JSON.stringify(report, null, 2))
  console.log(`${report.passed}/${results.length} passed`); process.exitCode = report.failed ? 1 : 0
}
