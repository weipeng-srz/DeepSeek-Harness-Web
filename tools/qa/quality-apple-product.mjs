// Independent task-based design review against a copied application and synthetic data.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'

const label = process.env.QA_LABEL || 'apple-product-before'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const id = 'qa-apple-product-review'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8802), label, seedConversations: [{ id, title: '产品评审记录', messages: [{ role: 'user', text: '请整理首发检查清单。' }, { role: 'assistant', text: '# 首发检查清单\n\n这是独立 QA 的合成内容。\n\n1. 检查导航与输入。\n2. 验证设置、搜索和菜单。\n3. 完成键盘及手机端复测。\n\n**发布验收标记**：所有检查都应有证据。' }] }] })
for (const file of fs.readdirSync(path.join(sandbox.dir, 'public/css'))) {
  if (file.endsWith('.css')) sandbox.sourceFiles[`public/css/${file}`] = createHash('sha256').update(fs.readFileSync(path.join(sandbox.dir, 'public/css', file))).digest('hex')
}
const browser = await launchBrowser()
const results = []
let modelRequests = 0
const check = async (name, run) => {
  try { results.push({ name, passed: true, ...await run() }); console.log(`PASS ${name}`) }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`) }
}
const capture = async (page, name) => {
  await page.waitForTimeout(350)
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true })
  return page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return !el.closest('[hidden]') && r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }
    return {
      width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      focus: document.activeElement.id || document.activeElement.className,
      smallTargets: [...document.querySelectorAll('button,a[href]')].filter(visible).map(el => ({ name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) })).filter(x => x.width < 44 || x.height < 44),
      type: [...document.querySelectorAll('h1,.empty-sub,.scenario-title,.scenario-desc,.conv-title,.conv-meta,.composer-hint,.settings-desc,.sheet-sub,.permission-option-desc,.conv-popover-item')].filter(visible).map(el => ({ class: el.className || el.tagName, size: getComputedStyle(el).fontSize, lineHeight: getComputedStyle(el).lineHeight, color: getComputedStyle(el).color })),
      modal: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(el => ({ class: el.className, modal: el.getAttribute('aria-modal'), rect: el.getBoundingClientRect().toJSON() })),
    }
  })
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, hasTouch: width === 390, serviceWorkers: 'block' })
    const page = await context.newPage()
    page.setDefaultTimeout(8000)
    // Observe the actual production endpoint and block unexpected generation so
    // a navigation/selector regression cannot incur a real engine operation.
    await page.route('**/api/conversations/*/chat', async route => {
      modelRequests += 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Model generation is disabled in this design review.' }) })
    })
    await loginPage(page, sandbox)
    const sidebar = async () => { if (width < 1024 && await page.locator('#menuBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#menuBtn').click() }
    await check(`${width}: new user selects a scenario and edits the draft`, async () => {
      const home = await capture(page, `home-${width}`)
      await page.locator('#scenarioGrid .scenario-card').first().click()
      const inserted = await page.locator('#input').inputValue()
      assert.ok(inserted.length > 20)
      assert.equal(await page.evaluate(() => document.activeElement.id), 'input')
      assert.equal(await page.locator('#sendBtn').isDisabled(), false)
      await page.locator('#input').fill(`${inserted}\n这是审查草稿，不发送。`)
      const scenarios = []
      assert.equal(await page.locator('#scenarioGrid .scenario-card').count(), 5)
      for (const card of await page.locator('#scenarioGrid .scenario-card').all()) {
        const before = await page.locator('#input').inputValue()
        await card.scrollIntoViewIfNeeded(); await card.click()
        const after = await page.locator('#input').inputValue()
        assert.ok(after.startsWith(before)); assert.ok(after.length > before.length)
        assert.equal(await page.evaluate(() => document.activeElement.id), 'input')
        scenarios.push(await card.locator('.scenario-title').innerText())
      }
      const longDraft = await capture(page, `home-last-scenario-${width}`)
      await page.locator('#sendBtn').click({ trial: true })
      return { home, longDraft, scenarios, clicksFromHome: 1, draftLength: inserted.length, screenshot: `home-${width}.png`, scope: 'Preparation only; all five scenarios remain reachable by scrolling; no model call or task-completion claim.' }
    })
    await check(`${width}: experienced user finds a conversation by message text`, async () => {
      await sidebar(); await page.locator('#convSearch').fill('发布验收标记')
      await page.locator(`.conv-item[data-id="${id}"]`).waitFor()
      await page.locator(`.conv-item[data-id="${id}"] .conv-main`).click()
      await page.locator('#thread .msg').first().waitFor()
      assert.ok(page.url().endsWith(`/c/${id}`))
      const reading = await capture(page, `reading-${width}`)
      return { reading, screenshot: `reading-${width}.png` }
    })
    await check(`${width}: user opens all conversation menu choices and cancels rename`, async () => {
      await sidebar(); await page.locator(`.conv-item[data-id="${id}"] .conv-more`).click()
      const menu = await capture(page, `menu-${width}`)
      const labels = await page.locator('.conv-popover-item').allTextContents()
      assert.equal(labels.length, 9)
      await page.locator('.conv-popover-item[data-action="rename"]').click()
      await page.locator('#renameModal').waitFor({ state: 'visible' })
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('#renameModal').isVisible(), false)
      if (width < 1024) await page.keyboard.press('Escape')
      return { menu, labels, screenshot: `menu-${width}.png` }
    })
    await check(`${width}: user changes appearance and returns to work`, async () => {
      await sidebar(); await page.locator('#settingsBtn').click()
      const settings = await capture(page, `settings-${width}`)
      await page.locator('#backupBtn').scrollIntoViewIfNeeded()
      await page.locator('#backupBtn').click({ trial: true }); await page.locator('#importBtn').click({ trial: true })
      const backup = await capture(page, `settings-backup-${width}`)
      await page.locator('[data-theme-option="dark"]').click()
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
      await page.keyboard.press('Escape')
      if (width < 1024) await page.keyboard.press('Escape')
      const dark = await capture(page, `reading-dark-${width}`)
      assert.equal(await page.locator('#shell').evaluate(el => el.inert), false)
      assert.equal(await page.locator('#input').isEditable(), true)
      return { settings, backup, dark, screenshot: `settings-${width}.png` }
    })
    await check(`${width}: user understands permission options without changing permission`, async () => {
      await page.locator('#permissionBtn').click()
      const permission = await capture(page, `permission-${width}`)
      const text = await page.locator('#permissionMenu').innerText()
      assert.ok(text.includes('标准'))
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('#permissionMenu').isVisible(), false)
      return { permission, screenshot: `permission-${width}.png` }
    })
    await context.close()
  }
  assert.equal(modelRequests, 0)
} finally {
  const report = { capturedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, scope: 'Independent simulated user task walkthrough in real Chrome; synthetic isolated data; no model execution; no claim of real user research.', modelRequests, results, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length }
  fs.writeFileSync(path.join(out, 'product-review.json'), JSON.stringify(report, null, 2))
  await browser.close(); await sandbox.stop()
  console.log(`${report.passed}/${results.length} passed; report ${out}/product-review.json`)
  process.exitCode = report.failed ? 1 : 0
}
