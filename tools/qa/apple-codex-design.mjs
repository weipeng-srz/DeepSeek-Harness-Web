import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'apple-codex-after'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8796), label })
const browser = await launchBrowser()
const results = []
const catalog = { source: 'cache', models: ['Balanced', 'Fast', 'Research'].map((name, i) => ({ id: `qa-${name.toLowerCase()}`, name: `QA ${name}`, default: i === 0, defaultEffort: 'medium', description: i === 0 ? '日常工作与代码任务，兼顾响应速度和完整性。可处理较长内容，并帮助核对关键细节。' : '适合多步骤工作，需要完整清晰地显示模型能力说明。', efforts: ['low', 'medium', 'high', 'xhigh'].map(value => ({ value, label: value, description: '适合复杂推理、多步骤分析与需要仔细验证的任务，通常耗时更长。' })) })) }
try {
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [{ engine: 'codex', title: 'QA model design', messages: [{ role: 'user', text: '请帮我检查设计与工程细节。' }, { role: 'assistant', text: '这是隔离测试的内容，没有执行模型。' }] }] }) })
  const id = (await sandbox.api('/api/conversations')).body.conversations[0].id
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }, { width: 390, height: 420 }, { width: 1440, height: 420 }]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1024, serviceWorkers: 'block' })
    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    await page.route('**/api/codex/models', route => route.fulfill({ status: 200, json: catalog }))
    await loginPage(page, sandbox)
    await page.goto(`${sandbox.base}/c/${id}`)
    await page.locator('#codexFootBtn').waitFor({ state: 'visible' })
    await page.waitForTimeout(400)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await page.locator('#codexFootBtn').click()
      const pop = page.locator('.codex-pop')
      await pop.waitFor(); await page.waitForTimeout(250)
      const inspect = () => page.evaluate(() => {
        const panel = document.querySelector('.codex-pop'), box = panel.getBoundingClientRect()
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data] }
        const lum = values => values.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
        const contrast = el => {
          let parent = el, bg = [255, 255, 255, 255]
          while (parent) { const color = rgb(getComputedStyle(parent).backgroundColor); if (color[3] === 255) { bg = color; break } parent = parent.parentElement }
          const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg)
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        }
        const info = selector => [...document.querySelectorAll(selector)].map(el => {
          const r = el.getBoundingClientRect(), css = getComputedStyle(el)
          return { text: el.textContent, width: r.width, height: r.height, top: r.top, bottom: r.bottom, font: css.fontSize, color: css.color, bg: css.backgroundColor, contrast: contrast(el), radius: css.borderRadius, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
        })
        return { panel: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, scrollTop: panel.scrollTop, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1 }, title: info('.codex-pop-title'), description: info('.codex-model-desc, .codex-effort-desc'), actions: info('#codexFootBtn, .codex-pop-close, .codex-model-choice, .codex-effort-choice, .codex-pop-open'), close: info('.codex-pop-close')[0], tag: info('.codex-model-tag'), headerPosition: getComputedStyle(document.querySelector('.codex-pop-head')).position }
      })
      const initial = await inspect()
      await page.screenshot({ path: path.join(out, `model-${viewport.width}x${viewport.height}-${theme}.png`), fullPage: true })
      await pop.evaluate(el => { el.scrollTop = el.scrollHeight })
      await page.waitForTimeout(50)
      const scrolled = await inspect()
      const closeVisible = scrolled.close.top >= Math.max(0, scrolled.panel.top) && scrolled.close.bottom <= Math.min(viewport.height, scrolled.panel.bottom)
      const footerVisible = await page.locator('.codex-pop-open').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
      await page.screenshot({ path: path.join(out, `model-scrolled-${viewport.width}x${viewport.height}-${theme}.png`), fullPage: true })
      const checks = { fitsViewport: initial.panel.left >= -1 && initial.panel.right <= viewport.width + 1 && initial.panel.top >= -1 && initial.panel.bottom <= viewport.height + 1, noHorizontalOverflow: !initial.panel.horizontalOverflow, readableTitles: initial.title.every(item => parseFloat(item.font) >= 18), readableDescriptions: initial.description.every(item => parseFloat(item.font) >= 13 && item.scrollHeight <= item.clientHeight + 1), actions44: initial.actions.every(item => item.width >= 44 && item.height >= 44), closeVisibleAfterScroll: closeVisible, footerReachable: footerVisible, textContrast: [...initial.description, ...initial.tag].every(item => item.contrast >= 4.5) }
      results.push({ viewport, theme, checks, initial, scrolled })
      await page.keyboard.press('Escape')
    }
    await context.close()
  }
} finally {
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, scope: 'Real Chrome, synthetic long model descriptions and responses, no model calls; touch emulation is not real iOS testing.', results }, null, 2))
  await browser.close(); await sandbox.stop()
}
console.log(JSON.stringify(results.map(({ viewport, theme, checks }) => ({ viewport, theme, checks })), null, 2))
