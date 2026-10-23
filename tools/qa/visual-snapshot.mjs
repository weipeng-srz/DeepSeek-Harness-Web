// Visual snapshot harness: capture a fixed set of screens so a CSS/DOM change
// can be diffed before/after instead of argued about.
// Usage: node tools/qa/visual-snapshot.mjs <label>
//   writes reports/ai-optimization/visual/<label>/*.png + manifest.json
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const label = process.argv[2] || 'current'
const OUT = path.join(ROOT, 'reports/ai-optimization/visual', label)
fs.mkdirSync(OUT, { recursive: true })

const seed = [
  {
    title: 'NVDA 财报速读',
    messages: [
      { role: 'user', text: '帮我看这份财报的三个关键变化，先结论后细节。' },
      {
        role: 'assistant',
        status: 'done',
        text: '## 结论\n数据中心收入同比 +112%，毛利率 74.6%。\n\n### 三个变化\n1. **收入结构**：数据中心占比升至 87%\n2. **毛利率**：环比 +1.2pt\n3. **库存**：周转天数下降 9 天\n\n```js\nconst growth = (a, b) => ((b - a) / a * 100).toFixed(1)\n```\n\n| 指标 | 上季 | 本季 |\n| --- | --- | --- |\n| 收入 | 26.0B | 35.1B |\n| 毛利率 | 73.4% | 74.6% |',
        thinking: '先确认口径，再比较同比与环比。',
        blocks: [
          { type: 'thinking', text: '先确认口径，再比较同比与环比。' },
          { type: 'tool', name: 'read_file', input: { path: 'NVDA-Q3.pdf' }, result: '收入 35.1B；毛利率 74.6%', status: 'done' },
          {
            type: 'text',
            text: '## 结论\n数据中心收入同比 +112%，毛利率 74.6%。\n\n### 三个变化\n1. **收入结构**：数据中心占比升至 87%\n2. **毛利率**：环比 +1.2pt\n3. **库存**：周转天数下降 9 天\n\n```js\nconst growth = (a, b) => ((b - a) / a * 100).toFixed(1)\n```\n\n| 指标 | 上季 | 本季 |\n| --- | --- | --- |\n| 收入 | 26.0B | 35.1B |\n| 毛利率 | 73.4% | 74.6% |',
          },
        ],
      },
    ],
  },
  { title: '城市热岛文献综述', messages: [{ role: 'user', text: '整理三篇论文的共同结论。' }, { role: 'assistant', text: '三篇都指向夜间热岛强度与绿地连通性负相关。', status: 'done' }] },
  { title: '周报：10 月第 4 周', messages: [{ role: 'user', text: '把本周进展整理成周报。' }, { role: 'assistant', text: '本周完成 3 项，风险 1 项。', status: 'done' }] },
]

const sandbox = await createSandbox({ port: 8883, label: `visual-${label}`, seedConversations: seed })
let browser
const manifest = []
try {
  const project = (await sandbox.api('/api/projects', { method: 'POST', body: JSON.stringify({ name: '美股研究', emoji: '📈' }) })).body.project
  const list = (await sandbox.api('/api/conversations?limit=10')).body.conversations
  await sandbox.api(`/api/conversations/${list[0].id}`, { method: 'PATCH', body: JSON.stringify({ projectId: project.id, pinned: true }) })

  browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await loginPage(page, sandbox)
  await page.reload()
  await page.locator('#shell').waitFor({ state: 'visible' })
  await sleep(700)

  const shot = async (name) => {
    const file = path.join(OUT, `${name}.png`)
    await page.screenshot({ path: file, fullPage: false })
    manifest.push(name)
  }

  await shot('desktop-home-light')

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await sleep(400)
  await shot('desktop-home-dark')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await sleep(300)

  await page.locator('.conv-item').first().click()
  await sleep(700)
  await shot('desktop-conversation')

  await page.locator('#convSearch').fill('城市')
  await sleep(500)
  await shot('desktop-search')
  await page.locator('#convSearch').fill('')
  await sleep(300)

  await page.keyboard.press('Meta+k')
  await sleep(500)
  await shot('desktop-palette')
  await page.keyboard.press('Escape')
  await sleep(300)

  await page.locator('#projectsBtn').click()
  await sleep(500)
  await shot('desktop-projects')
  await page.keyboard.press('Escape')
  await sleep(300)

  // Mobile
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, serviceWorkers: 'block' })
  await mobile.addCookies(await context.cookies())
  const mp = await mobile.newPage()
  mp.on('pageerror', (e) => errors.push(String(e)))
  await mp.goto(sandbox.base + '/')
  await mp.locator('#shell').waitFor({ state: 'visible' })
  await sleep(600)
  const mshot = async (name) => {
    const file = path.join(OUT, `${name}.png`)
    await mp.screenshot({ path: file, fullPage: false })
    manifest.push(name)
  }
  await mshot('mobile-home')
  await mp.locator('#menuBtn').click()
  await sleep(500)
  await mshot('mobile-drawer')
  // Opening a conversation from the drawer is the primary mobile journey; the
  // drawer closes itself and the conversation renders behind it.
  await mp.locator('.conv-item .conv-main').first().click()
  await sleep(800)
  await mshot('mobile-conversation')

  await mp.setViewportSize({ width: 320, height: 568 })
  await sleep(700)
  await mshot('mobile-320-conversation')
  await mp.locator('#menuBtn').click()
  await sleep(500)
  await mshot('mobile-320-drawer')
  await mp.locator('#newChat').click()
  await sleep(700)
  await mshot('mobile-320-home')

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ label, screens: manifest, errors }, null, 2))
  console.log(JSON.stringify({ out: OUT, screens: manifest.length, errors }, null, 2))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}
