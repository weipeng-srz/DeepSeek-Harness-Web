import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'advanced'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8798), label: `${label}-advanced` })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const results = []
const test = async (name, fn) => {
  try { const { ok, ...evidence } = await fn(); results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) }
  catch (error) { results.push({ name, status: 'blocked', evidence: { error: error.message } }); console.log(`BLOCKED ${name} ${error.message.slice(0, 160)}`); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }) }
}
try {
  const stamp = Date.now()
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: Array.from({ length: 75 }, (_, i) => ({ title: i === 74 ? 'QA OLDER_TITLE_UNIQUE' : `QA Record ${i}`, updatedAt: stamp - i * 1000, createdAt: stamp - i * 1000, messages: [{ role: 'user', text: i === 0 ? 'EARLY_MESSAGE_NEEDLE_247' : `Record ${i} first question` }, { role: 'assistant', text: 'ordinary final answer without search keywords' }] })) }) })
  const list = (await sandbox.api('/api/conversations?limit=100')).body.conversations
  const normal = list.find(x => x.title.endsWith('Record 0'))
  const old = list.find(x => x.title.includes('OLDER_TITLE_UNIQUE'))
  await loginPage(page, sandbox)
  await test('quick switcher searches messages beyond preview', async () => {
    await page.keyboard.press('Meta+p'); await page.locator('#quickInput').fill('EARLY_MESSAGE_NEEDLE_247')
    await page.waitForFunction(() => document.querySelector('#quickList')?.textContent.includes('Record 0'), undefined, { timeout: 3000 }).catch(() => {})
    const { text, count } = await page.locator('#quickList').evaluate(el => ({ text: el.innerText, count: el.querySelectorAll('.quick-item').length }))
    await page.keyboard.press('Escape'); return { ok: count === 1 && text.includes('Record 0'), count, text }
  })
  await test('quick switcher finds conversation beyond loaded sixty', async () => {
    const loaded = await page.locator('#convList .conv-item').count()
    await page.keyboard.press('Meta+p'); await page.locator('#quickInput').fill('OLDER_TITLE_UNIQUE')
    await page.waitForFunction(() => document.querySelector('#quickList')?.textContent.includes('OLDER_TITLE_UNIQUE'), undefined, { timeout: 3000 }).catch(() => {})
    const count = await page.locator('#quickList .quick-item').count()
    if (count) { await page.keyboard.press('Enter'); await page.waitForTimeout(300) } else await page.keyboard.press('Escape')
    return { ok: count === 1 && page.url().includes(old.id), count, initiallyLoaded: loaded, route: new URL(page.url()).pathname }
  })
  await test('historical quick result survives focus refresh', async () => {
    const other = await context.newPage(); await other.goto('about:blank'); await page.bringToFront()
    // Explicitly deliver focus as well: headless tabs may all remain visible.
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(700)
    const title = await page.locator('#topbarName').innerText(); await other.close()
    return { ok: page.url().includes(old.id) && title.includes('OLDER_TITLE_UNIQUE'), title, route: new URL(page.url()).pathname }
  })
  // Use real uploaded text; only delay the response to reproduce an async race.
  for (const name of ['race-a.txt', 'race-b.txt']) await sandbox.api(`/api/conversations/${normal.id}/upload?name=${name}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: name === 'race-a.txt' ? 'OLD_A_RESPONSE' : 'CURRENT_B_RESPONSE' })
  await page.goto(`${sandbox.base}/c/${normal.id}`); await page.locator('#thread .msg').first().waitFor()
  await test('file preview ignores an older response after switching', async () => {
    await page.route('**/files/raw?**', async route => { const response = await route.fetch(); if (route.request().url().includes('race-a.txt')) await sleep(1000); await route.fulfill({ response }) })
    await page.locator('#filesBtn').click(); await page.getByRole('button', { name: '预览 race-a.txt', exact: true }).click()
    await page.waitForTimeout(80); await page.keyboard.press('Escape')
    await page.locator('#filesBtn').click(); await page.getByRole('button', { name: '预览 race-b.txt', exact: true }).click()
    await page.waitForTimeout(1350)
    const text = await page.locator('#filePreviewBody').innerText(); const title = await page.locator('#filePreviewTitle').innerText()
    await page.screenshot({ path: path.join(out, 'file-preview-race.png'), fullPage: true })
    await page.keyboard.press('Escape'); await page.unrouteAll()
    return { ok: title === 'race-b.txt' && text.includes('CURRENT_B_RESPONSE') && !text.includes('OLD_A_RESPONSE'), title, text }
  })
  await test('closing loading file preview prevents late insertion', async () => {
    await page.route('**/files/raw?**', async route => { const response = await route.fetch(); await sleep(500); await route.fulfill({ response }) })
    await page.locator('#filesBtn').click(); await page.getByRole('button', { name: '预览 race-a.txt', exact: true }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(800)
    const text = await page.locator('#filePreviewBody').innerText(); const hidden = !await page.locator('#filePreview').isVisible(); await page.unrouteAll()
    return { ok: hidden && !text.includes('OLD_A_RESPONSE'), hidden, text }
  })
  await test('all settings radio groups support arrow navigation', async () => {
    await page.locator('#settingsBtn').click()
    const cases = [ ['themeOptions', 'data-theme-option', 'light', 'dark'], ['densityOptions', 'data-density', 'comfortable', 'compact'], ['fontOptions', 'data-font', '1', '1.1'] ]
    const states = []
    for (const [id, attr, first, next] of cases) {
      await page.locator(`#${id} [${attr}="${first}"]`).click(); await page.keyboard.press('ArrowRight')
      states.push({ group: id, expected: next, actual: await page.locator(`#${id} [aria-checked="true"]`).getAttribute(attr), focused: await page.evaluate(attr => document.activeElement.getAttribute(attr), attr) })
    }
    await page.locator('[data-theme-option="light"]').click(); await page.keyboard.press('Escape')
    return { ok: states.every(item => item.actual === item.expected && item.focused === item.expected), states }
  })
  await test('custom prompt accidental deletion can be undone', async () => {
    await page.locator('#promptsBtn').click(); await page.locator('#promptName').fill('QA Undo prompt'); await page.locator('#promptText').fill('QA do not lose this reusable request'); await page.locator('#promptForm button').click()
    const card = page.locator('.prompt-card').filter({ hasText: 'QA Undo prompt' })
    await card.locator('.prompt-actions button').filter({ hasText: '删除' }).click()
    const removed = await card.count() === 0
    const undo = page.locator('#toast button').filter({ hasText: '撤销' })
    const available = await undo.count() > 0
    let keyboardSteps = 0
    if (available) {
      while (keyboardSteps < 60 && !await page.evaluate(() => document.activeElement?.matches('#toast .toast-action'))) { await page.keyboard.press('Tab'); keyboardSteps += 1 }
      if (await page.evaluate(() => document.activeElement?.matches('#toast .toast-action'))) await page.keyboard.press('Enter')
    }
    const restored = await card.count() === 1
    const focusVisible = await page.evaluate(() => { const node = document.activeElement; return !!node && node !== document.body && node.getClientRects().length > 0 })
    await page.keyboard.press('Escape')
    return { ok: removed && available && restored && focusVisible, removed, undoAvailable: available, restored, focusVisible, keyboardSteps }
  })
} catch (error) { results.push({ name: 'advanced harness execution', status: 'blocked', evidence: { error: error.stack } }); console.error(error.stack) }
finally {
  fs.writeFileSync(path.join(out, 'advanced.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, blocked: results.filter(x => x.status === 'blocked').length } }, null, 2))
  await browser.close(); await sandbox.stop()
}
