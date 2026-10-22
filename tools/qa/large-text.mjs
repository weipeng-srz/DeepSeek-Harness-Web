// Large-text mode must scale UI without horizontal overflow.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8814), label: 'v5-large-text' })
let browser
try {
  browser = await launchBrowser()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage()
  await loginPage(page, sandbox)
  await page.locator('#menuBtn').click()
  await page.waitForTimeout(300)
  await page.locator('#settingsBtn').click()
  await page.waitForTimeout(300)
  await page.locator('[data-font="1.4"]').click()
  await page.waitForTimeout(300)
  const state = await page.evaluate(() => ({
    large: document.body.classList.contains('text-large'),
    scale: getComputedStyle(document.documentElement).getPropertyValue('--reading-scale').trim(),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }))
  record('extra-large text applies', state.large && state.scale === '1.4', JSON.stringify(state))
  record('mobile does not overflow with extra-large text', !state.overflow)
  await page.locator('button[data-settings-close]').click()
  await page.waitForTimeout(300)
  await page.reload()
  await page.waitForTimeout(900)
  const persisted = await page.evaluate(() => ({
    large: document.body.classList.contains('text-large'),
    scale: getComputedStyle(document.documentElement).getPropertyValue('--reading-scale').trim(),
  }))
  record('extra-large text survives reload', persisted.large && persisted.scale === '1.4', JSON.stringify(persisted))
  const emptySize = await page.locator('#emptyHintText').evaluate((el) => getComputedStyle(el).fontSize)
  record('secondary text scales too', parseFloat(emptySize) >= 12.5, emptySize)
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}
const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-5'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-5/large-text-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
