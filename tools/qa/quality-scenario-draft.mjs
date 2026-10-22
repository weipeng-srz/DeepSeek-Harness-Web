import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'

const label = process.env.QA_LABEL || 'r5-scenario-after'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const id = 'quality-scenario-draft'
const secondId = 'quality-scenario-draft-b'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8796), label, seedConversations: [
  { id, title: 'QA scenario draft', messages: [{ role: 'user', text: 'Synthetic conversation A for draft persistence' }] },
  { id: secondId, title: 'QA other draft', messages: [{ role: 'user', text: 'Synthetic conversation B for draft isolation' }] },
] })
const browser = await launchBrowser()
const results = []
const test = async (name, run) => {
  try {
    const { ok, ...evidence } = await run()
    results.push({ name, status: ok ? 'passed' : 'failed', evidence })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`)
  } catch (error) {
    results.push({ name, status: 'blocked', evidence: { error: error.message } })
    console.log(`BLOCKED ${name} ${error.message.slice(0, 150)}`)
  }
}
try {
  for (const device of [{ name: 'desktop', viewport: { width: 1440, height: 1000 } }, { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const context = await browser.newContext({ ...device, serviceWorkers: 'block' })
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    const modelCalls = []
    await page.route('**/api/chat**', async route => { modelCalls.push(route.request().url()); await route.abort() })
    await loginPage(page, sandbox)
    const insert = async () => {
      await page.locator('#scenarioBtn').click()
      await page.locator('#scenarioList [data-scenario="web"]').click()
    }
    const readInput = () => page.locator('#input').evaluate(input => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd, focus: document.activeElement === input, selected: input.value.slice(input.selectionStart, input.selectionEnd) }))
    let template = ''
    await test(`${device.name}: empty draft inserts, selects and saves template immediately`, async () => {
      await page.locator('#input').fill('')
      await insert()
      const actual = await readInput(); template = actual.value
      const stored = await page.evaluate(() => localStorage.getItem('dsh.draft.new'))
      const first = template.match(/\{\{[^}]+\}\}/)[0]
      return { ok: actual.focus && actual.selected === first && actual.start === template.indexOf(first) && stored === template, ...actual, storedMatches: stored === template }
    })
    const draft = '已有草稿 😀 {{粘贴网址}} 请保留尾部空格  '
    const combined = draft + '\n\n' + template
    await test(`${device.name}: appends after exact draft and selects new placeholder with UTF-16 offset`, async () => {
      await page.locator('#input').fill(draft)
      await insert()
      const actual = await readInput()
      const first = template.match(/\{\{[^}]+\}\}/)[0]
      const start = draft.length + 2 + template.indexOf(first)
      return { ok: actual.value === combined && actual.start === start && actual.end === start + first.length && actual.focus, ...actual, expectedStart: start, draftLength: draft.length }
    })
    await test(`${device.name}: immediate reload restores exact combined draft`, async () => {
      await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' })
      const restored = await page.locator('#input').inputValue()
      await page.screenshot({ path: path.join(out, `${device.name}-scenario-reload.png`), fullPage: true })
      return { ok: restored === combined, restoredLength: restored.length, expectedLength: combined.length, exactRestore: restored === combined }
    })
    await test(`${device.name}: unresolved placeholder stays blocked before model request`, async () => {
      await page.locator('#input').fill(combined)
      await page.locator('#sendBtn').click()
      const toast = await page.locator('#toast').innerText()
      const actual = await readInput()
      return { ok: toast.includes('替换占位符') && modelCalls.length === 0 && actual.selected === '{{粘贴网址}}', toast, modelRequests: modelCalls.length, selection: actual.selected }
    })
    await test(`${device.name}: whitespace-only draft inserts without leading blank lines`, async () => {
      await page.locator('#input').fill('  \n\t  ')
      await insert()
      const actual = await readInput()
      const stored = await page.evaluate(() => localStorage.getItem('dsh.draft.new'))
      return { ok: actual.value === template && stored === template, exactTemplate: actual.value === template, storedMatches: stored === template }
    })
    await test(`${device.name}: appending beyond composer limit updates count and disables sending`, async () => {
      await page.locator('#input').fill('a'.repeat(23990))
      await insert()
      const length = [...await page.locator('#input').inputValue()].length
      const disabled = await page.locator('#sendBtn').isDisabled()
      const count = await page.locator('#charCount').innerText()
      return { ok: length > 24000 && disabled && count.includes(length.toLocaleString('zh-CN')), length, disabled, count }
    })
    await test(`${device.name}: current conversation draft saves separately and restores on reload`, async () => {
      await page.goto(`${sandbox.base}/c/${id}`)
      await page.locator('#thread .msg').first().waitFor()
      const currentDraft = '保留当前会话的独立草稿'
      await page.locator('#input').fill(currentDraft)
      await insert()
      const expected = currentDraft + '\n\n' + template
      const stored = await page.evaluate(id => localStorage.getItem(`dsh.draft.${id}`), id)
      const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/conversations/${id}` && response.request().method() === 'GET')
      await page.reload(); await response; await page.locator('#thread .msg').first().waitFor()
      await page.waitForTimeout(150)
      const restored = await page.locator('#input').inputValue()
      const persistedAfter = await page.evaluate(id => localStorage.getItem(`dsh.draft.${id}`), id)
      return { ok: stored === expected && restored === expected, storedMatches: stored === expected, exactRestore: restored === expected, restoredLength: restored.length, persistedAfter }
    })
    await test(`${device.name}: over-limit new draft stays disabled after cached reload`, async () => {
      await page.locator('#newChatTop').click()
      await page.locator('#input').fill('😀'.repeat(24001))
      await page.waitForFunction(() => [...(localStorage.getItem('dsh.draft.new') || '')].length === 24001)
      const disabledBefore = await page.locator('#sendBtn').isDisabled()
      await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' })
      await page.waitForTimeout(200)
      const length = [...await page.locator('#input').inputValue()].length
      const disabledAfter = await page.locator('#sendBtn').isDisabled()
      return { ok: length === 24001 && disabledBefore && disabledAfter, length, disabledBefore, disabledAfter, route: new URL(page.url()).pathname }
    })
    await test(`${device.name}: over-limit conversation draft stays disabled after leaving and reopening`, async () => {
      await page.keyboard.press('Meta+p')
      await page.locator(`#quick-option-${id}`).click()
      await page.waitForTimeout(150)
      await page.locator('#input').fill('😀'.repeat(24001))
      await page.waitForFunction(id => [...(localStorage.getItem(`dsh.draft.${id}`) || '')].length === 24001, id)
      const disabledBefore = await page.locator('#sendBtn').isDisabled()
      await page.locator('#newChatTop').click()
      await page.locator('#input').fill('')
      await page.keyboard.press('Meta+p')
      await page.locator(`#quick-option-${id}`).click()
      await page.waitForTimeout(150)
      const length = [...await page.locator('#input').inputValue()].length
      const disabledAfter = await page.locator('#sendBtn').isDisabled()
      return { ok: length === 24001 && disabledBefore && disabledAfter, length, disabledBefore, disabledAfter, route: new URL(page.url()).pathname }
    })
    await test(`${device.name}: cached A then deep-linked B and A preserve independent drafts`, async () => {
      const openConversation = async conversationId => {
        const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/conversations/${conversationId}` && response.request().method() === 'GET')
        await page.goto(`${sandbox.base}/c/${conversationId}`); await response
        await page.waitForTimeout(150)
      }
      await openConversation(secondId)
      await page.locator('#input').fill('独立草稿 B 😀')
      await insert()
      const expectedB = '独立草稿 B 😀\n\n' + template
      await openConversation(id)
      await page.locator('#input').fill('独立草稿 A 🌿')
      await insert()
      const expectedA = '独立草稿 A 🌿\n\n' + template
      await openConversation(secondId)
      const restoredB = await page.locator('#input').inputValue()
      await openConversation(id)
      const restoredA = await page.locator('#input').inputValue()
      const stored = await page.evaluate(([a, b]) => ({ a: localStorage.getItem(`dsh.draft.${a}`), b: localStorage.getItem(`dsh.draft.${b}`) }), [id, secondId])
      return { ok: restoredA === expectedA && restoredB === expectedB && stored.a === expectedA && stored.b === expectedB, exactA: restoredA === expectedA, exactB: restoredB === expectedB, storedA: stored.a === expectedA, storedB: stored.b === expectedB }
    })
    await context.close()
  }
  const appSource = fs.readFileSync(path.join(sandbox.dir, 'public/js/app.js'), 'utf8')
  const source = appSource.slice(appSource.indexOf('  function useScenario(id) {'), appSource.indexOf('  function openScenarioSheet() {'))
  for (const initial of ['', 'Plain draft 😀  ']) {
    await test(`extracted actual function: placeholder-free template cursor at end (${initial ? 'existing' : 'empty'} draft)`, async () => {
      let saved = null; let metaUpdates = 0
      const input = { value: initial, focus() {}, setSelectionRange(start, end) { this.start = start; this.end = end } }
      const env = { SCENARIOS: [{ id: 'test-no-placeholder', template: 'Plain synthetic template.' }], els: { input, scenarioSheet: { hidden: true }, sendBtn: {} }, resizeInput() {}, closeScenarioSheet() {}, updateComposerMeta() { metaUpdates++ }, saveDraftNow() { saved = input.value } }
      vm.runInNewContext(`${source}\nuseScenario('test-no-placeholder')`, env)
      const expected = `${initial ? initial + '\n\n' : ''}Plain synthetic template.`
      return { ok: input.value === expected && input.start === expected.length && input.end === expected.length && saved === expected && metaUpdates === 1, exactValue: input.value === expected, start: input.start, end: input.end, expectedEnd: expected.length, savedMatches: saved === expected, metaUpdates, scope: 'Synthetic boundary: shipped scenarios all have placeholders; this invokes the unmodified extracted production function.' }
    })
  }
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, scope: 'Isolated Chrome browser with synthetic drafts; no user data or model requests. Two explicit extracted-function boundary checks.', results }, null, 2))
  await browser.close(); await sandbox.stop()
}
