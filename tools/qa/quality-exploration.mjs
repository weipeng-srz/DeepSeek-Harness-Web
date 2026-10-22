import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'baseline'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8798), label: `${label}-extended` })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
page.setDefaultTimeout(15000)
const results = []
const test = async (name, fn) => {
  try { const { ok, ...evidence } = await fn(); results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) }
  catch (error) { results.push({ name, status: 'blocked', evidence: { error: error.message } }); console.log(`BLOCKED ${name} ${error.message.slice(0, 160)}`); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }) }
}
try {
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [{ title: 'QA Extended', messages: [{ role: 'user', text: 'Question for QA bookmark' }, { role: 'assistant', text: '# QA Answer\n\nSearch needle and **Markdown**.\n\n```js\nconsole.log("QA")\n```' }] }, { title: 'QA Long 160', messages: Array.from({ length: 160 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i === 0 ? 'OLD_MESSAGE_UNIQUE_NEEDLE' : `Quality message ${i}` })) }] }) })
  const list = (await sandbox.api('/api/conversations')).body.conversations
  const normal = list.find(x => x.title.includes('Extended'))
  const long = list.find(x => x.title.includes('Long'))
  await loginPage(page, sandbox)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(out, 'desktop-home-stable.png'), fullPage: true })
  await test('prompt form rejects missing content', async () => {
    await page.locator('#promptsBtn').click(); await page.locator('#promptName').fill('QA prompt'); await page.locator('#promptForm button').click()
    return { ok: (await page.locator('#toast').innerText()).includes('名称和内容') }
  })
  await test('custom prompt persists and inserts', async () => {
    await page.locator('#promptText').fill('QA reusable request'); await page.locator('#promptForm button').click()
    await page.keyboard.press('Escape'); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }); await page.locator('#promptsBtn').click()
    const row = page.locator('.prompt-card').filter({ hasText: 'QA prompt' }); await row.locator('.insert').click()
    return { ok: await page.locator('#input').inputValue() === 'QA reusable request' }
  })
  await test('prompt insertion preserves existing draft or asks', async () => {
    await page.locator('#input').fill('QA valuable existing draft'); await page.locator('#promptsBtn').click()
    await page.locator('.prompt-card').filter({ hasText: 'QA prompt' }).locator('.insert').click()
    const value = await page.locator('#input').inputValue()
    const focus = await page.evaluate(() => document.activeElement.id)
    await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' })
    const restored = await page.locator('#input').inputValue()
    return { ok: value === 'QA valuable existing draft\n\nQA reusable request' && restored === value && focus === 'input', composer: value, restored, focus }
  })
  await page.keyboard.press('Escape')
  await page.goto(`${sandbox.base}/c/${normal.id}`); await page.locator('#thread .msg').first().waitFor()
  await test('message bookmark opens original message', async () => {
    await page.locator('#thread [data-bookmark-id]').first().click(); await page.locator('#bookmarksBtn').click()
    const found = await page.locator('.bookmark-row').count() === 1
    await page.locator('.bookmark-main').first().click(); await page.waitForTimeout(200)
    return { ok: found && page.url().includes(normal.id) && !await page.locator('#bookmarksSheet').isVisible() }
  })
  await test('current conversation find highlights match', async () => {
    await page.keyboard.press('Meta+f'); await page.locator('#findInput').fill('needle'); await page.waitForTimeout(300)
    const count = await page.locator('#findCount').innerText(); await page.keyboard.press('Escape')
    return { ok: count === '1/1', count }
  })
  await test('long conversation find reaches older messages', async () => {
    await page.goto(`${sandbox.base}/c/${long.id}`); await page.locator('#thread .msg').first().waitFor()
    const renderedBefore = await page.locator('#thread .msg').count()
    await page.keyboard.press('Meta+f'); await page.locator('#findInput').fill('OLD_MESSAGE_UNIQUE_NEEDLE'); await page.waitForTimeout(300)
    const count = await page.locator('#findCount').innerText(); const placeholder = await page.locator('#findInput').getAttribute('placeholder')
    await page.keyboard.press('Escape')
    return { ok: count === '1/1', count, renderedBefore, placeholder }
  })
  await test('long conversation initial DOM remains bounded', async () => {
    await page.goto(`${sandbox.base}/c/${long.id}`); await page.locator('#thread .msg').first().waitFor()
    const messages = await page.locator('#thread .msg').count(); const nodes = await page.locator('#thread *').count()
    return { ok: messages <= 80, messages, nodes }
  })
  await test('quick switcher supports keyboard select', async () => {
    await page.keyboard.press('Meta+p'); await page.locator('#quickInput').fill('Extended'); await page.waitForTimeout(350); await page.keyboard.press('Enter'); await page.waitForTimeout(250)
    return { ok: page.url().includes(normal.id) && !await page.locator('#quickSwitcher').isVisible() }
  })
  await test('settings traps Tab focus', async () => {
    await page.locator('#settingsBtn').click(); const inside = []
    for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); inside.push(await page.locator('#settingsSheet').evaluate(el => el.contains(document.activeElement))) }
    await page.keyboard.press('Escape'); return { ok: inside.every(Boolean), tabCount: inside.length }
  })
  await test('settings radio uses arrow-key navigation', async () => {
    await page.locator('#settingsBtn').click(); await page.locator('[data-theme-option="light"]').click(); await page.keyboard.press('ArrowRight')
    const theme = await page.locator('html').getAttribute('data-theme'); await page.locator('[data-theme-option="light"]').click(); await page.keyboard.press('Escape')
    return { ok: theme === 'dark', theme }
  })
  await test('settings Escape restores opener focus', async () => {
    await page.locator('#settingsBtn').click(); await page.keyboard.press('Escape'); return { ok: await page.evaluate(() => document.activeElement.id) === 'settingsBtn', focus: await page.evaluate(() => document.activeElement.id) }
  })
  await test('file upload, listing and raw download', async () => {
    const uploaded = await sandbox.api(`/api/conversations/${normal.id}/upload?name=quality-note.txt`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'QA file content' })
    const files = await sandbox.api(`/api/conversations/${normal.id}/files`)
    const file = files.body.files?.find(x => x.name === 'quality-note.txt' || x.path?.endsWith('quality-note.txt'))
    const raw = file ? await sandbox.api(`/api/conversations/${normal.id}/files/raw?path=${encodeURIComponent(file.path)}`) : null
    return { ok: uploaded.status === 201 && Boolean(file) && raw?.body === 'QA file content', uploadStatus: uploaded.status, listingCount: files.body.files?.length, rawStatus: raw?.status }
  })
  await test('file sheet and preview display text', async () => {
    await page.reload(); await page.locator('#filesBtn').waitFor({ state: 'visible' }); await page.locator('#filesBtn').click()
    const names = await page.locator('#filesList').innerText()
    const previewButton = page.locator('#filesList button').filter({ hasText: '预览' }).first()
    if (await previewButton.count()) await previewButton.click()
    else await page.locator('#filesList .file-row-name').first().click()
    await page.waitForTimeout(250)
    const text = await page.locator('#filePreviewBody').innerText(); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    return { ok: names.includes('quality-note.txt') && text.includes('QA file content'), text }
  })
  await test('Codex model settings measured controls and text', async () => {
    await page.locator('#newChat').click(); await page.locator('#engineCodex').click(); await page.waitForTimeout(1200)
    await page.locator('#codexSettingsBtn').click(); await page.locator('.codex-pop').waitFor()
    await page.waitForTimeout(350)
    const detail = await page.locator('.codex-pop').evaluate(el => ({ texts: [...el.querySelectorAll('.codex-pop-sub,.codex-model-desc,.codex-effort-desc,.codex-pop-source')].map(node => ({ selector: node.className, size: parseFloat(getComputedStyle(node).fontSize) })), width: el.getBoundingClientRect().width }))
    await page.screenshot({ path: path.join(out, 'codex-model-settings.png'), fullPage: true })
    return { ok: detail.texts.length > 0 && detail.texts.every(item => item.size >= 12), ...detail }
  })
  await test('model dialog Escape restores focus to trigger', async () => {
    if (!await page.locator('.codex-pop').count()) { await page.locator('#newChat').click(); await page.locator('#engineCodex').click(); await page.locator('#codexSettingsBtn').click() }
    await page.keyboard.press('Escape'); return { ok: await page.evaluate(() => document.activeElement.id) === 'codexSettingsBtn', focus: await page.evaluate(() => document.activeElement.id) }
  })
  await test('mobile model trigger has 44px touch target', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200)
    const rect = await page.locator('#codexSettingsBtn').boundingBox(); return { ok: rect?.width >= 44 && rect?.height >= 44, rect }
  })
  await test('mobile model dialog stays in viewport', async () => {
    await page.locator('#codexSettingsBtn').click(); await page.locator('.codex-pop').waitFor(); await page.waitForTimeout(350)
    const rect = await page.locator('.codex-pop').boundingBox(); await page.screenshot({ path: path.join(out, 'mobile-model-settings.png'), fullPage: true }); await page.keyboard.press('Escape')
    return { ok: rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 391 && rect.y + rect.height <= 845, rect }
  })
} catch (error) {
  results.push({ name: 'exploration harness execution', status: 'blocked', evidence: { error: error.stack, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1000) } })
  await page.screenshot({ path: path.join(out, 'exploration-blocked.png'), fullPage: true })
  console.error(error.stack)
} finally {
  fs.writeFileSync(path.join(out, 'exploration.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, blocked: results.filter(x => x.status === 'blocked').length } }, null, 2))
  await browser.close(); await sandbox.stop()
}
