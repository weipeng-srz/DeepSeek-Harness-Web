// Reflow and scroll reachability review. The 2x case models a browser's effective
// CSS viewport at 200%; it is not a claim of native browser-menu zoom or iOS QA.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const out = path.join(ROOT, 'reports/quality', process.env.QA_LABEL || 'apple-compact-after')
fs.mkdirSync(out, { recursive: true })
const id = 'qa-apple-compact', codexId = 'qa-apple-compact-codex'
const sandbox = await createSandbox({ port: 8803, label: 'apple-compact', seedConversations: [
  { id, title: '短屏可达性审查', messages: [{ role: 'user', text: '合成短屏检查' }, { role: 'assistant', text: '所有关键操作都应能够滚动到达。' }] },
  { id: codexId, engine: 'codex', title: 'Codex 模型设置审查', messages: [{ role: 'user', text: '仅检查 UI，不运行模型。' }] },
] })
for (const file of fs.readdirSync(path.join(sandbox.dir, 'public/css'))) if (file.endsWith('.css')) sandbox.sourceFiles[`public/css/${file}`] = createHash('sha256').update(fs.readFileSync(path.join(sandbox.dir, 'public/css', file))).digest('hex')
const browser = await launchBrowser(), results = []
let activePage
let modelRequests = 0
const scenarios = [{ name: '320x568', width: 320, height: 568, touch: true }, { name: '390x568', width: 390, height: 568, touch: true }, { name: '200pct-reflow-640x400', width: 640, height: 400, touch: false, scale: 2 }]
const selectedScenarios = process.env.QA_VIEW ? scenarios.filter(view => view.name === process.env.QA_VIEW) : scenarios
assert.ok(selectedScenarios.length > 0, 'QA_VIEW must match a declared scenario')
const catalog = { source: 'cache', models: ['Balanced', 'Fast', 'Reasoning'].map((name, index) => ({ id: `qa-${name}`, name: `QA ${name}`, description: '用于真实页面的合成模型目录；检查长说明与滚动，不调用真实模型。', default: index === 0, defaultEffort: 'medium', efforts: ['low', 'medium', 'high'].map(value => ({ value, label: value, description: '在速度与完整性之间进行选择，确认说明可完整阅读。' })) })) }
const check = async (name, run) => {
  try { results.push({ name, passed: true, ...await run() }); console.log(`PASS ${name}`) }
  catch (error) {
    const screenshot = `failure-${results.length + 1}.png`
    await activePage?.screenshot({ path: path.join(out, screenshot), fullPage: true }).catch(() => {})
    results.push({ name, passed: false, error: error.message, screenshot }); console.log(`FAIL ${name}: ${error.message}`)
    // Reload the isolated view after failure; relying on Escape here would hide
    // a broken Escape path or leave an open layer masking subsequent checks.
    await activePage?.reload().catch(() => {}); await activePage?.locator('#shell').waitFor({ state: 'visible' }).catch(() => {})
  }
}
try {
  for (const view of selectedScenarios) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, deviceScaleFactor: view.scale || 1, serviceWorkers: 'block' })
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(6000)
    await page.route('**/api/conversations/*/chat', async route => { modelRequests += 1; await route.fulfill({ status: 503, json: { error: 'Generation blocked by design QA.' } }) })
    await page.route('**/api/codex/models', route => route.fulfill({ status: 200, json: catalog }))
    const shot = async name => { await page.waitForTimeout(300); const file = `${view.name}-${name}.png`; await page.screenshot({ path: path.join(out, file), fullPage: true }); return file }
    const contained = async locator => {
      const box = await locator.boundingBox(); assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1, JSON.stringify(box)); return box
    }
    const noOverflow = async () => { const width = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(width <= view.width + 1, `document ${width} > ${view.width}`); return width }
    const sidebar = async () => { if (await page.locator('#menuBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#menuBtn').click() }
    await loginPage(page, sandbox)
    await check(`${view.name}: all home scenarios and long composer remain reachable`, async () => {
      const titles = []
      for (const card of await page.locator('#scenarioGrid .scenario-card').all()) { await card.scrollIntoViewIfNeeded(); await card.click(); titles.push(await card.locator('.scenario-title').innerText()) }
      assert.equal(titles.length, 5)
      await page.locator('#input').fill('短屏长草稿检查。\n'.repeat(30))
      await page.locator('#sendBtn').click({ trial: true }); await page.locator('#uploadBtn').click({ trial: true }); await page.locator('#permissionBtn').click({ trial: true })
      const composer = await contained(page.locator('.composer-inner')); const documentWidth = await noOverflow()
      const screenshot = await shot('long-composer'); await page.locator('#input').fill('')
      return { titles, composer, documentWidth, screenshot }
    })
    await check(`${view.name}: engine explanation is fully contained`, async () => {
      await page.locator('#engineInfoBtn').click(); await page.waitForTimeout(300)
      const panel = await contained(page.locator('#engineInfo'))
      assert.match(await page.locator('#engineInfo').innerText(), /DSH/); assert.match(await page.locator('#engineInfo').innerText(), /Codex/)
      const screenshot = await shot('engine-info'); await page.keyboard.press('Escape')
      await page.locator('#input').fill('引擎说明长草稿边界。\n'.repeat(30)); await page.waitForTimeout(200)
      await page.locator('#engineInfoBtn').click(); await page.waitForTimeout(300)
      const longDraftPanel = await contained(page.locator('#engineInfo')); assert.ok(longDraftPanel.height >= 44, `Engine explanation must keep a readable scroll viewport: ${JSON.stringify(longDraftPanel)}`)
      await page.locator('#engineInfo .engine-info-note').scrollIntoViewIfNeeded()
      const longScreenshot = await shot('engine-info-long-draft'); await page.keyboard.press('Escape'); await page.locator('#input').fill('')
      return { panel, screenshot, longDraftPanel, longScreenshot, documentWidth: await noOverflow() }
    })
    await check(`${view.name}: slash command menu and final entry remain reachable`, async () => {
      await page.locator('#input').fill('/'); await page.locator('#commandMenu').waitFor({ state: 'visible' }); await page.waitForTimeout(300)
      const panel = await contained(page.locator('#commandMenu'))
      await page.mouse.move(0, 0)
      await page.locator('#commandMenu .command-item').last().scrollIntoViewIfNeeded(); await page.locator('#commandMenu .command-item').last().click({ trial: true })
      const screenshot = await shot('slash-command'); await page.keyboard.press('Escape'); assert.equal(await page.locator('#commandMenu').isVisible(), false)
      await page.locator('#input').fill('多行草稿\n'.repeat(30)); assert.equal(await page.locator('#commandMenu').isVisible(), false, 'Slash menu intentionally does not open inside a multi-line draft')
      await page.locator('#input').fill('')
      return { panel, screenshot }
    })
    await page.goto(`${sandbox.base}/c/${id}`); await page.locator('#thread .msg').first().waitFor()
    await check(`${view.name}: settings lower actions and close are reachable`, async () => {
      await sidebar(); await page.locator('#settingsBtn').click(); await page.waitForTimeout(300)
      const panel = await contained(page.locator('#settingsSheet .sheet-panel'))
      await page.locator('#markAllReadBtn').scrollIntoViewIfNeeded(); await page.locator('#markAllReadBtn').click({ trial: true })
      await page.locator('#backupBtn').click({ trial: true }); await page.locator('#importBtn').click({ trial: true })
      const screenshot = await shot('settings-bottom'); await page.locator('#settingsSheet [data-settings-close].icon-btn').click()
      assert.equal(await page.locator('#settingsSheet').isVisible(), false); await page.keyboard.press('Escape')
      return { panel, screenshot }
    })
    await check(`${view.name}: last conversation menu action and rename are reachable`, async () => {
      await sidebar(); await page.locator(`.conv-item[data-id="${id}"] .conv-more`).click(); await page.waitForTimeout(300)
      const menu = await contained(page.locator('.conv-popover'))
      assert.equal(await page.locator('.conv-popover-item').count(), 9)
      await page.locator('.conv-popover-item[data-action="delete"]').scrollIntoViewIfNeeded(); await page.locator('.conv-popover-item[data-action="delete"]').click({ trial: true })
      const screenshot = await shot('menu-last')
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.conv-popover').count(), 0, 'Escape closes the conversation menu')
      const anchor = page.locator(`.conv-item[data-id="${id}"] .conv-more`)
      assert.equal(await anchor.getAttribute('aria-expanded'), 'false')
      assert.equal(await anchor.evaluate(el => el === document.activeElement), true)
      assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'), 'true', 'First Escape keeps the sidebar open')
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'), 'false', 'Second Escape closes the sidebar')
      await sidebar(); await page.locator(`.conv-item[data-id="${id}"] .conv-more`).click()
      await page.locator('.conv-popover-item[data-action="rename"]').click(); await page.waitForTimeout(300)
      const rename = await contained(page.locator('#renameModal .modal-card')); await page.locator('#renameSave').click({ trial: true })
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
      return { menu, rename, screenshot }
    })
    await check(`${view.name}: permission explanation is bounded and last choice reachable`, async () => {
      await page.locator('#permissionBtn').click(); await page.waitForTimeout(300)
      const panel = await contained(page.locator('#permissionMenu')); await page.locator('#permissionMenu .permission-option').last().scrollIntoViewIfNeeded(); await page.locator('#permissionMenu .permission-option').last().click({ trial: true })
      const screenshot = await shot('permission'); await page.keyboard.press('Escape')
      await page.locator('#input').fill('权限面板长草稿边界。\n'.repeat(30)); await page.waitForTimeout(200)
      await page.locator('#permissionBtn').click(); await page.waitForTimeout(300)
      const longDraftPanel = await contained(page.locator('#permissionMenu'))
      const scrollViewport = await page.locator('.permission-menu-card').evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, composerHeight: getComputedStyle(document.documentElement).getPropertyValue('--composer-h') }))
      assert.ok(scrollViewport.height >= 44, 'Permission scroll viewport has room for a minimum touch target')
      await page.locator('#permissionMenu .permission-option').last().scrollIntoViewIfNeeded(); await page.locator('#permissionMenu .permission-option').last().click({ trial: true })
      const longScreenshot = await shot('permission-long-draft'); await page.keyboard.press('Escape'); await page.locator('#input').fill('')
      return { panel, screenshot, longDraftPanel, scrollViewport, longScreenshot }
    })
    await check(`${view.name}: quick switch search and close stay reachable`, async () => {
      await page.keyboard.press('Meta+p'); await page.locator('#quickInput').fill('短屏'); await page.locator('#quickList .quick-item').first().waitFor(); await page.waitForTimeout(300)
      const panel = await contained(page.locator('#quickSwitcher .quick-card')); await page.locator('#quickList .quick-item').first().click({ trial: true })
      const screenshot = await shot('quick'); await page.locator('#quickClose').click(); assert.equal(await page.locator('#quickSwitcher').isVisible(), false)
      return { panel, screenshot }
    })
    await check(`${view.name}: Codex model choices and visible close remain reachable`, async () => {
      await page.goto(`${sandbox.base}/c/${codexId}`); await page.locator('#codexFootBtn').waitFor(); await page.locator('#codexFootBtn').click(); await page.waitForTimeout(350)
      const panel = await contained(page.locator('.codex-pop')); await page.locator('.codex-effort-choice').last().scrollIntoViewIfNeeded(); await page.locator('.codex-effort-choice').last().click({ trial: true })
      const screenshot = await shot('codex'); await page.locator('.codex-pop-close').click(); assert.equal(await page.locator('.codex-pop').count(), 0); assert.equal(await page.locator('#shell').evaluate(el => el.inert), false)
      return { panel, screenshot, documentWidth: await noOverflow() }
    })
    await context.close()
  }
  assert.equal(modelRequests, 0)
} finally {
  const report = { capturedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, scope: 'Actual isolated HTTP and Chrome; synthetic data/catalog; short CSS viewports and a 640x400 CSS viewport at DPR 2 to model 1280x800 at 200% browser reflow. No native zoom-menu or physical iOS claim.', modelRequests, results, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length }
  fs.writeFileSync(path.join(out, 'compact.json'), JSON.stringify(report, null, 2)); await browser.close(); await sandbox.stop()
  console.log(`${report.passed}/${results.length} passed`); process.exitCode = report.failed ? 1 : 0
}
