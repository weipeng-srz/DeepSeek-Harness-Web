import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round5'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const existingId = 'quality-polish-existing'
const otherId = 'quality-polish-other'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8799), label: `${label}-polish`, seedConversations: [{ id: existingId, title: 'QA Existing Draft', messages: [{ role: 'user', text: 'QA original persisted question' }] }, { id: otherId, title: 'QA Other Draft', messages: [{ role: 'user', text: 'QA other persisted question' }] }] })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
const page = await context.newPage(); page.setDefaultTimeout(7000)
const results = []
const test = async (name, fn) => { try { const { ok, ...evidence } = await fn(); results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) } catch (error) { results.push({ name, status: 'blocked', evidence: { error: error.message } }); console.log(`BLOCKED ${name} ${error.message.slice(0, 180)}`); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }) } }
try {
  await loginPage(page, sandbox)
  let template = ''
  await test('empty draft scenario fills, selects placeholder and persists immediately', async () => {
    await page.locator('#input').fill(''); await page.locator('#scenarioGrid [data-scenario]').first().click(); template = await page.locator('#input').inputValue()
    const selection = await page.locator('#input').evaluate(el => ({ start: el.selectionStart, selected: el.value.slice(el.selectionStart, el.selectionEnd), focused: document.activeElement === el }))
    await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }); const restored = await page.locator('#input').inputValue()
    return { ok: template.length > 0 && selection.focused && selection.selected === template.match(/\{\{[^}]+\}\}/)?.[0] && restored === template, selection, exactRestore: restored === template }
  })
  await test('scenario appends exact separator and selects only new template placeholder', async () => {
    const draft = 'QA draft with existing {{old placeholder}}'
    await page.locator('#input').fill(draft); await page.locator('#scenarioBtn').click(); await page.locator('#scenarioList [data-scenario]').first().click()
    const actual = await page.locator('#input').inputValue(); const selection = await page.locator('#input').evaluate(el => ({ start: el.selectionStart, selected: el.value.slice(el.selectionStart, el.selectionEnd), focused: document.activeElement === el }))
    const expected = `${draft}\n\n${template}`; const expectedStart = draft.length + 2 + template.indexOf('{{')
    await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }); const restored = await page.locator('#input').inputValue()
    return { ok: actual === expected && selection.start === expectedStart && selection.selected === template.match(/\{\{[^}]+\}\}/)?.[0] && selection.focused && restored === expected, exactAppend: actual === expected, selection, expectedStart, exactRestore: restored === expected }
  })
  await page.locator('#input').fill(''); await page.locator('#engineCodex').click(); await page.locator('#codexSettingsBtn').waitFor({ state: 'visible' })
  await test('model modal isolates background and traps forward and reverse focus', async () => {
    await page.locator('#codexSettingsBtn').click(); await page.locator('.codex-pop').waitFor()
    const states = []
    for (let i = 0; i < 28; i++) { await page.keyboard.press(i < 14 ? 'Tab' : 'Shift+Tab'); states.push(await page.locator('.codex-pop').evaluate(el => el.contains(document.activeElement))) }
    const shellInert = await page.locator('#shell').evaluate(el => el.inert)
    const dialog = await page.locator('.codex-pop').evaluate(el => ({ role: el.getAttribute('role'), modal: el.getAttribute('aria-modal') }))
    await page.keyboard.press('Escape'); const focus = await page.evaluate(() => document.activeElement.id)
    return { ok: states.every(Boolean) && shellInert && dialog.role === 'dialog' && dialog.modal === 'true' && focus === 'codexSettingsBtn' && !await page.locator('#shell').evaluate(el => el.inert), states, shellInert, dialog, focus }
  })
  await test('repeated model and quick modal cycles leave no background lock', async () => {
    const checks = []
    for (let i = 0; i < 3; i++) {
      await page.locator('#codexSettingsBtn').click(); await page.keyboard.press('Escape')
      await page.keyboard.press('Meta+p'); await page.keyboard.press('Meta+p'); await page.keyboard.press('Escape')
      checks.push(await page.evaluate(() => ({ inert: document.querySelector('#shell').inert, model: Boolean(document.querySelector('.codex-pop')), quick: !document.querySelector('#quickSwitcher').hidden })))
    }
    await page.locator('#input').fill('Interactive after modal cycles')
    return { ok: checks.every(value => !value.inert && !value.model && !value.quick) && await page.locator('#input').inputValue() === 'Interactive after modal cycles', checks }
  })
  await test('open model modal recalculates compact and desktop layout on resize', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#codexSettingsBtn').click(); await page.locator('.codex-pop').waitFor()
    const measured = []
    for (const [width, height] of [[390, 844], [1440, 1000], [320, 844]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(150)
      const rect = await page.locator('.codex-pop').boundingBox(); measured.push({ width, height, rect })
    }
    await page.screenshot({ path: path.join(out, 'polish-model-320-reduced-motion.png'), fullPage: true })
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1440, height: 1000 })
    return { ok: measured.every(({ width, height, rect }) => rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1) && measured[1].rect.width < 640, measured }
  })
  await test('model modal respects reduced motion preference', async () => {
    await page.locator('#codexSettingsBtn').click(); const motion = await page.locator('.codex-pop').evaluate(el => ({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, animation: getComputedStyle(el).animationDuration, transition: getComputedStyle(el).transitionDuration }))
    await page.keyboard.press('Escape')
    return { ok: motion.reduced && motion.animation.split(',').every(value => parseFloat(value) <= 0.01) && motion.transition.split(',').every(value => parseFloat(value) <= 0.01), motion }
  })
  await test('existing conversation scenario draft survives cached-shell reload', async () => {
    await page.goto(`${sandbox.base}/c/${existingId}`); await page.locator('#thread .msg').first().waitFor()
    const draft = 'QA valuable existing conversation draft'
    await page.locator('#input').fill(draft); await page.locator('#scenarioBtn').click(); await page.locator('#scenarioList [data-scenario]').first().click()
    const expected = `${draft}\n\n${template}`; const before = await page.locator('#input').inputValue()
    await page.reload(); await page.locator('#thread .msg').first().waitFor(); await page.waitForTimeout(250)
    const after = await page.locator('#input').inputValue()
    const stored = await page.evaluate(id => localStorage.getItem(`dsh.draft.${id}`), existingId)
    return { ok: before === expected && after === expected && stored === expected, exactBefore: before === expected, exactAfter: after === expected, exactStored: stored === expected, route: new URL(page.url()).pathname }
  })
  await test('existing conversation ordinary draft survives two cached-shell reloads', async () => {
    const draft = 'QA manually typed draft must survive cached startup'
    await page.locator('#input').fill(draft); await page.waitForTimeout(400)
    const restored = []
    for (let i = 0; i < 2; i++) { await page.reload(); await page.locator('#thread .msg').first().waitFor(); await page.waitForTimeout(250); restored.push(await page.locator('#input').inputValue()) }
    return { ok: restored.every(value => value === draft), restoredLengths: restored.map(value => value.length), expectedLength: draft.length }
  })
  await test('cached conversation A and direct deep link B keep separate drafts', async () => {
    const draftA = 'QA draft belonging only to A'; const draftB = 'QA draft belonging only to B'
    await page.goto(`${sandbox.base}/c/${otherId}`); await page.locator('#thread .msg').first().waitFor(); await page.locator('#input').fill(draftB); await page.waitForTimeout(500)
    await page.goto(`${sandbox.base}/c/${existingId}`); await page.locator('#thread .msg').first().waitFor(); await page.locator('#input').fill(draftA); await page.waitForTimeout(500)
    await page.goto(`${sandbox.base}/c/${otherId}`); await page.locator('#thread .msg').first().waitFor(); await page.waitForTimeout(250)
    const displayed = await page.locator('#input').inputValue(); const stored = await page.evaluate(([a, b]) => ({ a: localStorage.getItem(`dsh.draft.${a}`), b: localStorage.getItem(`dsh.draft.${b}`) }), [existingId, otherId])
    return { ok: displayed === draftB && stored.a === draftA && stored.b === draftB && page.url().endsWith(otherId), displayed, stored, route: new URL(page.url()).pathname }
  })
  await test('restored over-limit draft keeps sending disabled', async () => {
    await page.locator('#input').fill('x'.repeat(24001)); await page.waitForTimeout(400); await page.reload(); await page.locator('#thread .msg').first().waitFor(); await page.waitForTimeout(250)
    const length = (await page.locator('#input').inputValue()).length; const disabled = await page.locator('#sendBtn').isDisabled(); const counter = await page.locator('#charCount').innerText()
    return { ok: length === 24001 && disabled && counter.includes('24,001'), length, disabled, counter }
  })
} finally {
  fs.writeFileSync(path.join(out, 'polish.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, results }, null, 2))
  await browser.close(); await sandbox.stop()
}
