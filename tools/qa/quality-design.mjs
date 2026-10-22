import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round2'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8799), label: `${label}-design` })
const browser = await launchBrowser()
const results = []
const record = (name, ok, evidence) => { results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`) }
const catalog = { source: 'fallback', models: [{ id: 'qa-model', name: 'QA Model', default: true, defaultEffort: 'medium', description: '模型说明用于检查文字可读性与完整阅读。', efforts: [{ value: 'low', label: '快速', description: '简短问题和快速反馈。' }, { value: 'medium', label: '标准', description: '速度和完整性的平衡。' }, { value: 'high', label: '深入', description: '适合复杂推理、多步骤分析与需要仔细验证的任务，通常需要花费更多时间。' }] }] }
try {
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [{ title: 'QA design independent', engine: 'codex', messages: [{ role: 'user', text: 'Check table readability' }, { role: 'assistant', text: '| 项目名称 | 工作说明 | 负责人 | 当前状态 | 下一步 |\n| --- | --- | --- | --- | --- |\n| 设计检查 | 窄屏能读懂每一列并局部滚动 | QA | 进行中 | 复测 |\n\n| Key | Value |\n| --- | --- |\n| One | Two |\n\n```js\nconst word = "' + 'long-text-'.repeat(80) + '"\n```' }] }] }) })
  const id = (await sandbox.api('/api/conversations')).body.conversations[0].id
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 }, hasTouch: width < 1000, serviceWorkers: 'block' })
    const page = await context.newPage()
    await page.route('**/api/codex/models', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }))
    await loginPage(page, sandbox)
    if (width < 1024) await page.locator('#menuBtn').click()
    await page.locator(`[data-id="${id}"] .conv-main`).click(); await page.locator('#thread .md').waitFor(); await page.waitForTimeout(300)
    const table = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, tables: [...document.querySelectorAll('.table-wrap')].map(el => ({ client: el.clientWidth, scroll: el.scrollWidth, headings: [...el.querySelectorAll('th')].map(th => ({ text: th.textContent, width: th.getBoundingClientRect().width, height: th.getBoundingClientRect().height })) })), code: [...document.querySelectorAll('.code-block pre')].map(el => ({ client: el.clientWidth, scroll: el.scrollWidth })) }))
    record(`content contained ${width}`, table.width <= width + 1, table)
    if (width <= 390) {
      record(`five-column table readable and locally scrollable ${width}`, table.tables[0].scroll > table.tables[0].client && table.tables[0].headings.every(x => x.width >= 75), table.tables[0])
      record(`two-column table avoids needless overflow ${width}`, table.tables[1].scroll <= table.tables[1].client + 1, table.tables[1])
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
      await page.locator('#codexFootBtn').click(); await page.locator('.codex-pop').waitFor(); await page.waitForTimeout(350)
      const measurements = await page.evaluate(() => {
        const selectors = ['.codex-pop-sub', '.codex-model-desc', '.codex-effort-desc', '.codex-pop-source']
        const descriptions = selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(el => ({ selector, font: parseFloat(getComputedStyle(el).fontSize), clientHeight: el.clientHeight, scrollHeight: el.scrollHeight })))
        const titles = [...document.querySelectorAll('.codex-pop-title,.codex-model-name')].map(el => ({ selector: el.className, font: parseFloat(getComputedStyle(el).fontSize) }))
        const targets = [...document.querySelectorAll('#codexFootBtn,.codex-model-choice,.codex-effort-choice,.codex-pop-open')].map(el => ({ selector: el.className || el.id, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
        const pop = document.querySelector('.codex-pop').getBoundingClientRect()
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const rgba = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].map((v,i) => i === 3 ? v/255 : v) }
        const over = (front, back) => [0,1,2].map(i => front[i] * front[3] + back[i] * (1-front[3])).concat(1)
        const tag = document.querySelector('.codex-model-tag'); const ancestors = []; for (let el = tag; el; el = el.parentElement) ancestors.unshift(el)
        let background = [255,255,255,1]; for (const el of ancestors) background = over(rgba(getComputedStyle(el).backgroundColor), background)
        const foreground = over(rgba(getComputedStyle(tag).color), background)
        const luminance = rgb => rgb.slice(0,3).map(v => v/255).map(v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4).reduce((n,v,i) => n+v*[0.2126,0.7152,0.0722][i],0)
        const a=luminance(foreground), b=luminance(background)
        return { descriptions, titles, targets, contrast: (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05), foreground, background, pop: { x: pop.x, y: pop.y, width: pop.width, height: pop.height }, viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, coarse: matchMedia('(pointer:coarse)').matches }
      })
      record(`description typography ${width} ${theme}`, measurements.descriptions.every(x => x.font >= 12 && x.scrollHeight <= x.clientHeight + 1), measurements.descriptions)
      record(`title typography ${width} ${theme}`, measurements.titles.every(x => x.font >= 14), measurements.titles)
      record(`model tag contrast ${width} ${theme}`, measurements.contrast >= 4.5, { ratio: measurements.contrast, foreground: measurements.foreground, background: measurements.background })
      if (measurements.coarse) record(`coarse pointer targets ${width} ${theme}`, measurements.targets.every(x => x.width >= 44 && x.height >= 44), measurements.targets)
      const { pop, viewport } = measurements
      record(`model panel contained ${width} ${theme}`, pop.x >= 0 && pop.y >= 0 && pop.x + pop.width <= viewport.width + 1 && pop.y + pop.height <= viewport.height + 1 && measurements.documentWidth <= width + 1, { pop, viewport })
      await page.screenshot({ path: path.join(out, `design-${width}-${theme}.png`), fullPage: true })
      await page.keyboard.press('Escape')
    }
    await context.close()
  }
} catch (error) { results.push({ name: 'design harness execution', status: 'blocked', evidence: { error: error.stack } }); console.error(error.stack) }
finally {
  fs.writeFileSync(path.join(out, 'design.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), fixture: 'Synthetic model catalog and messages; real DOM and CSS measurements, alpha-composited text contrast', sourceSnapshot: sandbox.dir, results, totals: { passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, blocked: results.filter(x => x.status === 'blocked').length } }, null, 2))
  await browser.close(); await sandbox.stop()
}
