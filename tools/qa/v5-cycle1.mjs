// v5 cycle 1 — project context, trust, copy/preview, shortcuts, a11y.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'
import { permissionMode } from '../../server/dsh.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// A headless child must receive the same permission preset the chip shows.
record('headless permission mode is forwarded', permissionMode('read-only') === 'read-only' && permissionMode('danger-full-access') === 'danger-full-access' && permissionMode('nonsense') === 'workspace-write')

const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8806),
  label: 'v5-cycle1',
  seedConversations: [
    {
      title: 'v5 质检对话',
      messages: [
        { role: 'user', text: '请把表格和文件改动整理一下' },
        {
          role: 'assistant',
          text: '已整理。',
          status: 'done',
          blocks: [
            { type: 'text', text: '| 城市 | 温度 |\n| --- | --- |\n| 杭州 | 32 |\n| 上海 | 30 |\n\n文件已更新。' },
            { type: 'tool', id: 'tool_fixture_1', tool: 'edit', input: { file_path: 'notes.md', old_string: '旧内容', new_string: '新内容' }, status: 'completed', result: 'ok' },
          ],
        },
      ],
    },
  ],
})
console.log(`SANDBOX ${sandbox.base}`)

const list = await sandbox.api('/api/conversations?limit=10')
const conv = list.body.conversations[0]
const projectRes = await sandbox.api('/api/projects', {
  method: 'POST',
  body: JSON.stringify({ name: '质检项目', emoji: '🧪', instructions: '回答要给出证据。' }),
})
const project = projectRes.body.project
await sandbox.api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: JSON.stringify({ projectId: project.id }) })
const csvRows = ['name,score', ...Array.from({ length: 350 }, (_, index) => `User${index + 1},${index}`)].join('\n')
await sandbox.api(`/api/conversations/${conv.id}/upload?name=table.csv`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: csvRows,
})
// GBK bytes for: 姓名,分数 / 张三,90
const gbk = Buffer.from('d0d5c3fb2cb7d6cafd0ad5c5c8fd2c3930', 'hex')
await sandbox.api(`/api/conversations/${conv.id}/upload?name=gbk.csv`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: gbk,
})

let browser
try {
  browser = await launchBrowser()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.goto(`${sandbox.base}/c/${conv.id}`)
  await page.waitForTimeout(1200)

  record('thread is a screen-reader log', await page.locator('#thread').getAttribute('role') === 'log')
  record('hidden polite status exists', await page.locator('#srStatus').getAttribute('aria-live') === 'polite')
  record('table copy affordance rendered', await page.locator('.table-copy').count() === 1, String(await page.locator('.table-copy').count()))

  await page.locator('.table-copy').click()
  await page.waitForTimeout(300)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  record('table copies as TSV', clipboard.includes('城市\t温度') && clipboard.includes('杭州\t32'), JSON.stringify(clipboard.slice(0, 80)))

  const diffDel = await page.locator('.tool-diff .diff-del .diff-code').allTextContents()
  const diffAdd = await page.locator('.tool-diff .diff-add .diff-code').allTextContents()
  record('tool card shows removed lines', diffDel.includes('旧内容'), JSON.stringify(diffDel))
  record('tool card shows added lines', diffAdd.includes('新内容'), JSON.stringify(diffAdd))

  // Permission confirmation: cancel must not change the stored mode.
  await page.locator('#permissionBtn').click()
  await page.locator('.permission-option[data-value="danger-full-access"]').click()
  await page.waitForTimeout(250)
  record('full permission asks for confirmation', await page.locator('#confirmModal').isVisible())
  await page.locator('#confirmModal').evaluate((el) => el.querySelector('#confirmCancel').click())
  await page.waitForTimeout(300)
  const permissionAfterCancel = (await sandbox.api(`/api/conversations/${conv.id}`)).body.conversation.permission
  record('cancelling confirmation keeps standard permission', permissionAfterCancel === 'workspace-write', permissionAfterCancel)

  // Project sheet must lock the shell and trap focus.
  await page.locator('#projectsBtn').click()
  await page.waitForTimeout(350)
  record('projects sheet locks shell', await page.evaluate(() => document.querySelector('#shell').inert === true))
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  record('focus stays inside projects sheet', await page.evaluate(() => Boolean(document.querySelector('#projectsSheet').contains(document.activeElement))))
  await page.locator('button[data-projects-close]').click()
  await page.waitForTimeout(200)

  // Promised shortcuts.
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme || '')
  await page.keyboard.press('Meta+Shift+L')
  await page.waitForTimeout(250)
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme || '')
  record('Cmd+Shift+L cycles theme', themeAfter !== themeBefore, `${themeBefore} -> ${themeAfter}`)
  await page.keyboard.press('Meta+Shift+F')
  await page.waitForTimeout(400)
  record('Cmd+Shift+F opens files sheet', await page.locator('#filesSheet').isVisible())

  // CSV preview.
  await page.locator('#filesSheet .file-row-name').filter({ hasText: 'table.csv' }).first().click()
  await page.waitForTimeout(700)
  const renderedRows = await page.locator('#filePreviewBody .csv-preview tbody tr').count()
  record('CSV preview renders a real table', renderedRows > 250 && renderedRows <= 299, String(renderedRows))
  record('CSV preview has TSV copy', await page.locator('#filePreviewBody .table-copy').count() === 1)
  await page.locator('#filePreviewBody .table-copy').click()
  await page.waitForTimeout(250)
  const csvClipboard = await page.evaluate(() => navigator.clipboard.readText())
  record('CSV copy contains the full table, not just the preview', csvClipboard.split('\n').length >= 351, String(csvClipboard.split('\n').length))
  await page.locator('#filePreview .file-preview-head [data-preview-close]').click()
  await page.waitForTimeout(250)
  await page.locator('#filesBtn').click()
  await page.waitForTimeout(300)
  await page.locator('#filesList .file-row-name').filter({ hasText: 'gbk.csv' }).first().click()
  await page.waitForTimeout(700)
  const gbkBody = await page.locator('#filePreviewBody').innerText()
  record('GBK CSV decodes without mojibake', gbkBody.includes('姓名') && gbkBody.includes('张三'), gbkBody.replace(/\s+/g, ' ').slice(0, 60))
  await page.locator('#filePreview .file-preview-head [data-preview-close]').click()
  await page.waitForTimeout(300)

  // Empty-state copy no longer assumes a Mac desktop, and a filtered project
  // shows its context banner in the empty state.
  await page.locator('#projectsBtn').click()
  await page.locator(`.project-row[data-project-id="${project.id}"] .project-row-main`).click()
  await page.waitForTimeout(500)
  await page.locator('#newChatTop').click()
  await page.waitForTimeout(300)
  const hero = (await page.locator('#emptyState').innerText()).replace(/\s+/g, ' ')
  record('hero copy is device-neutral', !/Mac|桌面 Agent|交给桌面/.test(hero), hero.slice(0, 80))
  record('project banner appears in filtered empty state', await page.locator('#emptyProject').isVisible())

  // Undo is discoverable and works within the window.
  await page.goto(`${sandbox.base}/c/${conv.id}`)
  await page.waitForTimeout(700)
  await page.locator('.conv-more').first().click()
  await page.getByRole('menuitem', { name: '删除对话' }).click()
  await page.locator('#confirmOk').click()
  await page.waitForTimeout(400)
  const undoVisible = await page.locator('#toast .toast-action').isVisible()
  record('delete exposes an undo action', undoVisible, await page.locator('#toast').innerText())
  if (undoVisible) {
    await page.locator('#toast .toast-action').click()
    await page.waitForTimeout(700)
  }
  const restored = await sandbox.api(`/api/conversations/${conv.id}`)
  record('undo restores the conversation', restored.status === 200, String(restored.status))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await page.locator('#menuBtn').click()
  await page.waitForTimeout(350)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  record('mobile has no horizontal overflow with project chips', !overflow)

  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
  fs.mkdirSync(path.join(ROOT, 'reports/v5/round-1'), { recursive: true })
  await page.screenshot({ path: path.join(ROOT, 'reports/v5/round-1/cycle1-mobile.png') })
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-1'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-1/cycle1-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
