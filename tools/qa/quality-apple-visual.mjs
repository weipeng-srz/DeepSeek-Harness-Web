import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'apple-before'
const out = path.join(ROOT, 'reports/quality', label); fs.mkdirSync(out, { recursive: true })
const id = 'qa-apple-reading'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8799), label: `${label}-visual`, seedConversations: [{ id, title: '产品体验评审 · 项目计划', messages: [{ role: 'user', text: '请把项目目标整理成一个清晰、可以执行的计划。' }, { role: 'assistant', text: '# 先把核心任务做好\n\n这是一段独立 QA 合成内容，用来检查长文阅读、信息层次和跨设备布局。\n\n## 本周计划\n\n1. 确认关键使用场景。\n2. 完善主要流程和异常状态。\n3. 通过实际操作验证结果。\n\n| 任务 | 负责人 | 状态 |\n| --- | --- | --- |\n| 页面审查 | 产品团队 | 进行中 |\n| 功能回归 | QA | 待验证 |\n\n```js\nconst nextStep = "keep it clear";\n```\n\n> 每一次反馈都应该帮助用户理解当前状态。' }] }, { id: 'qa-apple-second', title: '每周工作总结', messages: [{ role: 'user', text: '整理本周工作。' }] }] })
await sandbox.api(`/api/conversations/${id}/upload?name=QA-review.txt`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'Synthetic QA file for the visual inventory.' })
const browser = await launchBrowser(); const evidence = []
try {
  for (const width of (process.env.QA_WIDTHS || '1440,390').split(',').map(Number)) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: width <= 768 ? 844 : 1000 }, hasTouch: width <= 768, serviceWorkers: 'block' })
    await context.addInitScript(theme => localStorage.setItem('dsh.theme', theme), theme)
    const page = await context.newPage(); page.setDefaultTimeout(8000)
    const shot = async name => {
      await page.waitForTimeout(400)
      const file = `${name}-${width}-${theme}.png`; await page.screenshot({ path: path.join(out, file), fullPage: true })
      const metrics = await page.evaluate(() => {
        const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }
        return { viewport: [innerWidth, innerHeight], documentWidth: document.documentElement.scrollWidth, typography: [...document.querySelectorAll('h1,h2,.hero-title,.hero-subtitle,.scenario-title,.scenario-desc,.sidebar-link,.conv-meta,.composer-hint,.settings-desc,.sheet-sub,.permission-option-desc,.prompt-card p')].filter(visible).map(el => ({ selector: el.className || el.tagName, text: el.textContent.trim().slice(0, 60), size: getComputedStyle(el).fontSize, lineHeight: getComputedStyle(el).lineHeight, color: getComputedStyle(el).color })), smallTargets: [...document.querySelectorAll('button,a[href]')].filter(visible).map(el => ({ name: el.getAttribute('aria-label') || el.title || el.textContent.trim().slice(0,40), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })).filter(item => item.width < 44 || item.height < 44) }
      })
      evidence.push({ view: name, width, theme, screenshot: file, metrics }); console.log(`CAPTURE ${file}`)
    }
    const sidebar = async () => { if (width < 1024 && await page.locator('#menuBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#menuBtn').click() }
    await page.goto(sandbox.base); await page.locator('#loginView').waitFor({ state: 'visible' }); await shot('apple-login')
    await page.locator('#accessCode').fill(sandbox.code); await page.locator('#loginBtn').click(); await page.locator('#shell').waitFor({ state: 'visible' }); await page.waitForTimeout(600); await shot('apple-home')
    await page.goto(`${sandbox.base}/c/${id}`); await page.locator('#thread .msg').first().waitFor(); await shot('apple-reading')
    await sidebar(); await page.locator('#settingsBtn').click(); await shot('apple-settings'); await page.keyboard.press('Escape'); if (width < 1024) await page.keyboard.press('Escape')
    await page.locator('#filesBtn').click(); await shot('apple-files'); await page.keyboard.press('Escape')
    await page.locator('#permissionBtn').click(); await shot('apple-permission'); await page.keyboard.press('Escape')
    await sidebar(); await page.locator('#promptsBtn').click(); await shot('apple-prompts'); await page.keyboard.press('Escape'); if (width < 1024) await page.keyboard.press('Escape')
    await page.keyboard.press('Meta+p'); await page.locator('#quickInput').fill('项目'); await page.waitForTimeout(400); await shot('apple-quick'); await page.keyboard.press('Escape')
    await sidebar(); await page.locator(`.conv-item[data-id="${id}"] [data-action="menu"]`).click(); await shot('apple-conversation-menu'); await page.keyboard.press('Escape'); if (width < 1024) await page.keyboard.press('Escape')
    await context.close()
  }
} finally {
  fs.writeFileSync(path.join(out, 'apple-visual.json'), JSON.stringify({ label, sourceSnapshot: sandbox.dir, generatedAt: new Date().toISOString(), scope: 'Synthetic QA data; real Chrome desktop and emulated phone viewport; measured CSS and screenshots, not real-user research or a WCAG certification', evidence }, null, 2))
  await browser.close(); await sandbox.stop()
}
