import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'style-rollback'
const out = path.join(ROOT, 'reports/quality', label); fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8806), label: `${label}-visual` })
const browser = await launchBrowser(), evidence = []
try {
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, hasTouch: width === 390, serviceWorkers: 'block' })
    await context.addInitScript(theme => localStorage.setItem('dsh.theme', theme), theme)
    const page = await context.newPage(); await loginPage(page, sandbox); await page.waitForTimeout(700)
    const file = `home-${width}-${theme}.png`; await page.screenshot({ path: path.join(out, file), fullPage: true })
    const state = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, theme: document.documentElement.dataset.theme, design: document.documentElement.dataset.design || null, scenarios: document.querySelectorAll('#scenarioGrid [data-scenario]').length, composer: Boolean(document.querySelector('#input')), assets: [...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(el => el.getAttribute('src') || el.getAttribute('href')) }))
    evidence.push({ width, theme, file, state }); console.log(`CAPTURE ${file} ${JSON.stringify(state)}`); await context.close()
  }
} finally {
  fs.writeFileSync(path.join(out, 'rollback-visual.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, scope: 'Only requested rollback home screenshots in desktop/mobile CSS viewports, light/dark; no new design audit.', evidence }, null, 2)); await browser.close(); await sandbox.stop()
}
