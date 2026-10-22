import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'apple-final'
const out = path.join(ROOT, 'reports/quality', label); fs.mkdirSync(out, { recursive: true })
const id = 'qa-apple-sheet'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8805), label: `${label}-sheets`, seedConversations: [{ id, title: 'QA sheet reachability', messages: [{ id: 'qa-sheet-message', role: 'assistant', text: 'QA message for bookmarks and file checks.' }] }, { id: 'qa-apple-archive', title: 'QA archived fixture', archivedAt: Date.now(), messages: [] }] })
await sandbox.api(`/api/conversations/${id}/upload?name=QA-sheet.txt`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'QA preview line\n'.repeat(90) })
const browser = await launchBrowser(), results = []
try {
  for (const width of [320, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 568 }, hasTouch: true, serviceWorkers: 'block' })
    await context.addInitScript(theme => localStorage.setItem('dsh.theme', theme), theme)
    const page = await context.newPage(); page.setDefaultTimeout(7000); await loginPage(page, sandbox)
    const openConversation = async () => { await page.goto(`${sandbox.base}/c/${id}`); await page.locator('#thread .msg').first().waitFor() }
    const sidebar = async () => { if (await page.locator('#menuBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#menuBtn').click() }
    const cases = [
      { name: 'prompts', selector: '#promptSheet', open: async () => { await sidebar(); await page.locator('#promptsBtn').click() }, operate: async () => { await page.locator('#promptText').scrollIntoViewIfNeeded(); await page.locator('#promptText').fill('QA short screen prompt'); await page.locator('#promptName').fill('QA short screen'); await page.locator('#promptForm button[type=submit]').click(); await page.locator('#promptList').getByText('QA short screen', { exact: true }).waitFor() } },
      { name: 'files', selector: '#filesSheet', open: () => page.locator('#filesBtn').click(), operate: async () => { await page.getByRole('link', { name: '下载 QA-sheet.txt', exact: true }).click({ trial: true }); await page.getByRole('button', { name: '删除文件 QA-sheet.txt', exact: true }).click({ trial: true }) } },
      { name: 'preview', selector: '#filePreview', open: async () => { await page.locator('#filesBtn').click(); await page.getByRole('button', { name: '预览 QA-sheet.txt', exact: true }).click(); await page.locator('#filePreviewBody pre').waitFor() }, operate: async () => { await page.locator('#filePreviewBody').evaluate(el => el.scrollTop = el.scrollHeight); await page.locator('#filePreviewDownload').click({ trial: true }); await page.locator('#filePreviewOpen').click({ trial: true }) } },
      { name: 'archive', selector: '#archiveSheet', open: async () => { await sidebar(); await page.locator('#archiveBtn').click() }, operate: async () => { const row = page.locator('.archive-row').filter({ hasText: 'QA archived fixture' }); await row.waitFor(); await row.getByRole('button', { name: '恢复', exact: true }).click({ trial: true }) } },
      { name: 'bookmarks', selector: '#bookmarksSheet', open: async () => { const mark = page.locator('#thread [data-bookmark-id]').first(); if (await mark.getAttribute('aria-pressed') !== 'true') await mark.click(); await sidebar(); await page.locator('#bookmarksBtn').click() }, operate: async () => { await page.locator('#bookmarksList').getByText('QA message for bookmarks and file checks.', { exact: true }).waitFor() } },
      { name: 'scenarios', selector: '#scenarioSheet', open: () => page.locator('#scenarioBtn').click(), operate: async () => { const cards = page.locator('#scenarioList [data-scenario]'); if (await cards.count() !== 5) throw new Error('Expected all five scenario actions'); for (const card of await cards.all()) { await card.scrollIntoViewIfNeeded(); await card.click({ trial: true }) } } },
      { name: 'shortcuts', selector: '#shortcutsSheet', open: async () => { await page.locator('#input').fill('/shortcuts'); await page.keyboard.press('Enter') }, operate: async () => { await page.locator('#shortcutsList').evaluate(el => el.scrollTop = el.scrollHeight); const text = await page.locator('#shortcutsList').innerText(); if (text.length < 30) throw new Error('Shortcut content missing') } },
    ]
    for (const item of cases) {
      try {
        await openConversation(); await item.open(); const sheet = page.locator(item.selector), panel = sheet.locator('[role=dialog]'); await panel.waitFor(); await page.waitForTimeout(400)
        const rect = await panel.boundingBox(); const contained = rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= 569
        await item.operate(); const close = sheet.getByRole('button', { name: /^关闭/ }).first(); await close.scrollIntoViewIfNeeded(); await close.click({ trial: true }); const closeRect = await close.boundingBox()
        const horizontal = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }))
        const screenshot = `sheet-${item.name}-${width}-${theme}.png`; await page.screenshot({ path: path.join(out, screenshot), fullPage: true })
        await close.tap(); await sheet.waitFor({ state: 'hidden' }); if (await page.locator('#menuBtn').getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape')
        const unlocked = !await page.locator('#shell').evaluate(el => el.inert)
        const ok = contained && closeRect.width >= 44 && closeRect.height >= 44 && horizontal.width <= width && unlocked
        results.push({ name: `${item.name} ${width} ${theme}`, status: ok ? 'passed' : 'failed', evidence: { panel: rect, close: closeRect, horizontal, unlocked, screenshot } }); console.log(`${ok ? 'PASS' : 'FAIL'} ${item.name} ${width} ${theme}`)
      } catch (error) { results.push({ name: `${item.name} ${width} ${theme}`, status: 'failed', evidence: { error: error.message } }); console.log(`FAIL ${item.name} ${width} ${theme}: ${error.message}`); await page.screenshot({ path: path.join(out, `sheet-${item.name}-${width}-${theme}-failed.png`), fullPage: true }) }
    }
    await context.close()
  }
} finally {
  fs.writeFileSync(path.join(out, 'apple-sheets.json'), JSON.stringify({ label, sourceSnapshot: sandbox.dir, generatedAt: new Date().toISOString(), scope: 'Real Chrome touch emulation at 320/390 x 568; synthetic QA content; actual form save and preview plus trial hit testing for destructive/external actions; no OS soft keyboard or real phone claim.', results }, null, 2)); await browser.close(); await sandbox.stop()
}
