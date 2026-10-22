import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'

const label = process.env.QA_LABEL || 'r2-before'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: 8796, label })
const browser = await launchBrowser()
const results = []
const catalog = { source: 'fallback', models: [
  { id: 'qa-balanced', name: 'Balanced model', default: true, defaultEffort: 'medium', description: '日常工作与代码任务，兼顾速度和完整性。', efforts: [
    { value: 'low', label: '快速', description: '适合简短问题和快速反馈。' },
    { value: 'medium', label: '标准', description: '在响应速度与推理深度之间保持均衡。' },
    { value: 'high', label: '深入', description: '适合复杂推理、多步骤分析与需要仔细验证的任务，通常耗时更长。' },
  ] },
  { id: 'qa-fast', name: 'Fast model', default: false, defaultEffort: 'medium', description: '适合日常交流、简短编辑与快速反馈。', efforts: [{ value: 'medium', label: '标准', description: '兼顾速度和完整性。' }] },
] }
try {
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [{ title: 'QA Visual content', engine: 'codex', messages: [
    { role: 'user', text: '请检查表格、代码、长链接和模型设置的阅读体验。' },
    { role: 'assistant', text: '# 内容阅读检查\n\n这是常规正文，用来检查标题、正文与次级说明的层次。\n\n| 项目名称 | 工作说明 | 负责人 | 当前状态 | 下一步 |\n| --- | --- | --- | --- | --- |\n| 设计系统一致性检查 | 核对浅色与深色模式，以及手机和平板的布局和可读性 | QA | 进行中 | 完成复测 |\n\n长链接：https://example.test/' + 'long-path-'.repeat(25) + '\n\n```js\nconst validationMessage = "' + 'long-content-'.repeat(30) + '"\n```' },
  ] }] }) })
  const conv = (await sandbox.api('/api/conversations')).body.conversations[0]
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1000, serviceWorkers: 'block' })
    const page = await context.newPage()
    await page.route('**/api/codex/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }))
    await loginPage(page, sandbox)
    if (viewport.width < 1024) await page.locator('#menuBtn').click()
    await page.locator(`[data-id="${conv.id}"] .conv-main`).click()
    await page.locator('#thread .md').waitFor()
    await page.waitForTimeout(350)
    const content = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, table: [...document.querySelectorAll('.table-wrap')].map(el => ({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })), code: [...document.querySelectorAll('.code-block pre')].map(el => ({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })) }))
    results.push({ viewport, case: 'long content', ...content })
    await page.screenshot({ path: path.join(out, `content-${viewport.width}.png`), fullPage: true })
    if (viewport.width < 500) {
      await page.locator('.table-wrap').hover()
      await page.mouse.wheel(500, 0)
      await page.waitForTimeout(150)
      const tableScroll = await page.locator('.table-wrap').evaluate(el => ({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }))
      results.push({ viewport, case: 'table horizontal wheel', ...tableScroll })
      await page.screenshot({ path: path.join(out, `table-scrolled-${viewport.width}.png`), fullPage: true })
    }
    const trigger = page.locator('#codexFootBtn')
    await trigger.waitFor({ state: 'visible' })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await trigger.click()
      await page.locator('.codex-pop').waitFor()
      await page.waitForTimeout(250)
      const metrics = await page.evaluate(() => {
        const selectors = ['#codexFootBtn', '.codex-pop', '.codex-pop-sub', '.codex-model-choice', '.codex-effort-choice', '.codex-model-name', '.codex-model-tag', '.codex-model-desc', '.codex-effort-desc', '.codex-pop-open', '.codex-pop-source']
        return selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(el => {
          const css = getComputedStyle(el), box = el.getBoundingClientRect()
          return { selector, text: el.textContent, fontSize: css.fontSize, lineHeight: css.lineHeight, color: css.color, background: css.backgroundColor, width: box.width, height: box.height, top: box.top, bottom: box.bottom, left: box.left, right: box.right, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, outlineColor: css.outlineColor, contrastPreference: matchMedia('(prefers-contrast: more)').matches, pointer: matchMedia('(pointer: coarse)').matches }
        }))
      })
      results.push({ viewport, theme, case: 'codex controls', metrics })
      await page.screenshot({ path: path.join(out, `codex-${viewport.width}-${theme}.png`), fullPage: true })
      await page.keyboard.press('Escape')
    }
    await context.close()
  }
} finally {
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify({ fixture: 'Synthetic messages and model catalog; real DOM/CSS/browser measurements, no AI invoked', results }, null, 2))
  await browser.close()
  await sandbox.stop()
}
console.log(`Wrote ${results.length} visual observations to ${out}`)
