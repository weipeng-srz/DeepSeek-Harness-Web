import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'

const label = process.env.QA_LABEL || 'round5'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const id = 'quality-final-task-fixture'
const sourceText = 'QA question for safe edit'
const answer = '# QA final answer\n\nA precise answer.\n\n```js\nconsole.log("quality copy")\n```'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8799), label: `${label}-features`, seedConversations: [{ id, title: 'QA Final Tasks', messages: [{ role: 'user', text: sourceText }, { role: 'assistant', text: answer, usage: { totalTokens: 123 }, durationMs: 1500 }] }] })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
page.setDefaultTimeout(7000)
const results = []
const row = () => page.locator(`.conv-item[data-id="${id}"]`)
const open = async () => { await page.goto(`${sandbox.base}/c/${id}`); await page.locator('#thread .msg').first().waitFor() }
const menu = async action => { await row().locator('[data-action="menu"]').click(); await page.locator(`#convPopover [data-action="${action}"]`).click() }
const test = async (name, fn) => {
  try { const { ok, ...evidence } = await fn(); results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) }
  catch (error) { results.push({ name, status: 'blocked', evidence: { error: error.message } }); console.log(`BLOCKED ${name} ${error.message.slice(0, 140)}`); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }) }
}
try {
  await loginPage(page, sandbox); await open()
  await test('pin conversation persists and remains first after reload', async () => {
    await menu('pin'); await row().locator('.conv-pin-dot').waitFor(); await page.reload(); await row().locator('.conv-pin-dot').waitFor()
    const stored = (await sandbox.api(`/api/conversations/${id}`)).body.conversation
    const first = await page.locator('.conv-item').first().getAttribute('data-id')
    return { ok: stored.pinned === true && first === id, pinned: stored.pinned, first }
  })
  await test('unpin conversation persists', async () => {
    await menu('pin'); await row().locator('.conv-pin-dot').waitFor({ state: 'detached' })
    const stored = (await sandbox.api(`/api/conversations/${id}`)).body.conversation
    return { ok: !stored.pinned, pinned: Boolean(stored.pinned) }
  })
  await test('statistics shows actual message and token counts', async () => {
    await menu('stats'); await page.locator('#statsModal').waitFor({ state: 'visible' })
    const values = await page.locator('.stats-row').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.querySelector('span').textContent, row.querySelector('b').textContent])))
    await page.locator('#statsClose').click()
    return { ok: values['消息'] === '2 条（你 1 / 助手 1）' && values.Token === '123' && values['标题'] === 'QA Final Tasks', values }
  })
  await test('Markdown export downloads complete synthetic conversation', async () => {
    const pending = page.waitForEvent('download'); await menu('export'); const download = await pending
    const file = path.join(out, 'final-task-export.md'); await download.saveAs(file)
    const text = fs.readFileSync(file, 'utf8')
    return { ok: text.includes(sourceText) && text.includes(answer) && text.includes('## 我') && text.includes('## 助手'), filename: download.suggestedFilename(), bytes: Buffer.byteLength(text), file }
  })
  await test('code copy writes exact code to clipboard', async () => {
    await page.locator('.code-copy').first().click(); const copied = await page.evaluate(() => navigator.clipboard.readText())
    return { ok: copied.trimEnd() === 'console.log("quality copy")', copied }
  })
  await test('message copy writes the original question', async () => {
    await page.getByRole('button', { name: '复制提问', exact: true }).click(); const copied = await page.evaluate(() => navigator.clipboard.readText())
    return { ok: copied === sourceText, copied }
  })
  await test('conversation link copies exact stable deep link', async () => {
    await menu('link'); const copied = await page.evaluate(() => navigator.clipboard.readText())
    return { ok: copied === `${sandbox.base}/c/${id}`, copied }
  })
  await test('editing cancel and Escape preserve persisted message history', async () => {
    const mutations = []
    const listener = request => { if (request.method() !== 'GET' && /\/api\/(chat|conversations)/.test(request.url())) mutations.push(request.method() + ' ' + new URL(request.url()).pathname) }
    page.on('request', listener)
    await page.getByRole('button', { name: '编辑这条提问', exact: true }).click(); await page.locator('.bubble-edit').fill('Unsaved edit should never persist'); await page.locator('.user-edit-actions').getByRole('button', { name: '取消', exact: true }).click()
    const cancelled = await page.locator('.bubble-edit').count() === 0 && await page.locator('.msg.user .bubble-text').innerText() === sourceText
    await page.getByRole('button', { name: '编辑这条提问', exact: true }).click(); await page.locator('.bubble-edit').fill('Escape should preserve history'); await page.keyboard.press('Escape')
    page.off('request', listener)
    const stored = (await sandbox.api(`/api/conversations/${id}`)).body.conversation
    return { ok: cancelled && await page.locator('.bubble-edit').count() === 0 && stored.messages.length === 2 && stored.messages[0].text === sourceText && mutations.length === 0, cancelled, messageCount: stored.messages.length, mutations }
  })
  await test('read-only permission persists after reload without model execution', async () => {
    await page.locator('#permissionBtn').click(); await page.locator('.permission-option[data-value="read-only"]').click(); await page.waitForFunction(() => document.querySelector('#permissionLabel').textContent === '只读')
    await page.reload(); await page.locator('#thread .msg').first().waitFor()
    const stored = (await sandbox.api(`/api/conversations/${id}`)).body.conversation
    const displayed = await page.locator('#permissionLabel').innerText()
    return { ok: stored.permission === 'read-only' && displayed === '只读', permission: stored.permission, displayed }
  })
  await test('archive UI removes active conversation and restores from archive box', async () => {
    await menu('archive'); await row().waitFor({ state: 'detached' }); const emptyRoute = new URL(page.url()).pathname
    await page.locator('#archiveBtn').click(); const archived = page.locator('.archive-row').filter({ hasText: 'QA Final Tasks' }); await archived.waitFor()
    await archived.getByRole('button', { name: '恢复', exact: true }).click(); await archived.waitFor({ state: 'detached' }); await page.keyboard.press('Escape'); await row().waitFor()
    await row().locator('.conv-main').click(); await page.locator('#thread .msg').first().waitFor()
    const stored = (await sandbox.api(`/api/conversations/${id}`)).body.conversation
    return { ok: emptyRoute === '/' && !stored.archived && stored.messages.length === 2 && page.url().includes(id), emptyRoute, archived: Boolean(stored.archived), messages: stored.messages.length }
  })
  await test('composer validates Unicode length, whitespace and multiline entry', async () => {
    await page.locator('#input').fill('   '); const whitespaceDisabled = await page.locator('#sendBtn').isDisabled()
    await page.locator('#input').fill('😀'.repeat(24000)); const boundaryAllowed = !await page.locator('#sendBtn').isDisabled(); const counterAtBoundary = await page.locator('#charCount').innerText()
    await page.locator('#input').fill('😀'.repeat(24001)); const overLimitDisabled = await page.locator('#sendBtn').isDisabled()
    await page.locator('#input').fill('Line one'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('Line two'); const multiline = await page.locator('#input').inputValue(); await page.locator('#input').fill('')
    return { ok: whitespaceDisabled && boundaryAllowed && counterAtBoundary.includes('24,000') && overLimitDisabled && multiline === 'Line one\nLine two', whitespaceDisabled, boundaryAllowed, counterAtBoundary, overLimitDisabled, multiline }
  })
  await test('scenario templates fill and block unresolved placeholders before model call', async () => {
    await page.locator('#newChat').click(); const cards = await page.locator('#scenarioGrid [data-scenario]').count()
    await page.locator('#scenarioGrid [data-scenario]').first().click(); const filled = await page.locator('#input').inputValue()
    const calls = []; const listener = request => { if (/\/chat(?:\?|$)/.test(request.url())) calls.push(request.url()) }; page.on('request', listener)
    await page.locator('#sendBtn').click(); await page.waitForTimeout(100); page.off('request', listener)
    const toast = await page.locator('#toast').innerText()
    return { ok: cards === 5 && filled.includes('{{') && toast.includes('替换占位符') && calls.length === 0, cards, filledLength: filled.length, toast, modelRequests: calls.length }
  })
  await test('scenario insertion preserves existing draft and persists on refresh', async () => {
    const draft = 'QA valuable draft before choosing a scenario'
    await page.locator('#input').fill(draft); await page.locator('#scenarioBtn').click(); await page.locator('#scenarioList [data-scenario]').first().click()
    const value = await page.locator('#input').inputValue(); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }); const restored = await page.locator('#input').inputValue()
    return { ok: value.includes(draft) && value.includes('{{') && restored === value, existingDraftPreserved: value.includes(draft), populatedLength: value.length, restoredLength: restored.length, exactRestore: restored === value }
  })
  await test('pointer-selected density and font survive immediate reload', async () => {
    await page.locator('#settingsBtn').click(); await page.locator('button[data-density="compact"]').click(); await page.locator('button[data-font="1.1"]').click(); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }); await page.locator('#settingsBtn').click()
    const actual = await page.evaluate(() => ({ density: document.documentElement.dataset.density, fontScale: document.documentElement.style.getPropertyValue('--reading-scale'), selectedDensity: document.querySelector('button[data-density="compact"]').getAttribute('aria-checked'), selectedFont: document.querySelector('button[data-font="1.1"]').getAttribute('aria-checked') }))
    await page.keyboard.press('Escape')
    return { ok: actual.density === 'compact' && actual.fontScale === '1.1' && actual.selectedDensity === 'true' && actual.selectedFont === 'true', ...actual }
  })
  await test('invalid or malformed saved reading preferences fall back safely', async () => {
    const cases = []
    for (const raw of ['{"density":"huge","fontScale":999,"notify":false}', '{not-valid-json', 'null']) {
      await page.evaluate(raw => localStorage.setItem('dsh.prefs.v1', raw), raw); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' })
      cases.push(await page.evaluate(() => ({ density: document.documentElement.dataset.density, fontScale: document.documentElement.style.getPropertyValue('--reading-scale') })))
    }
    return { ok: cases.every(value => value.density === 'comfortable' && value.fontScale === '1'), cases }
  })
  await page.screenshot({ path: path.join(out, 'final-task-features.png'), fullPage: true })
} finally {
  fs.writeFileSync(path.join(out, 'features.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, scope: 'Independent browser tasks with isolated synthetic conversation, no model calls or system notification permission', results }, null, 2))
  await browser.close(); await sandbox.stop()
}
