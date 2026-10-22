// Round 4 — prompt variables, voice affordance, per-answer share, Markdown export.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8811),
  label: 'v5-productivity',
  seedConversations: [
    {
      title: '生产力测试',
      messages: [
        { role: 'user', text: '第一个问题' },
        {
          role: 'assistant',
          text: '第一个回答：结论 A。',
          status: 'done',
          blocks: [
            { type: 'text', text: '第一个回答：结论 A。' },
            { type: 'tool', id: 'tool_p1', tool: 'bash', input: { command: 'echo hello' }, status: 'completed', result: 'hello' },
          ],
        },
        { role: 'user', text: '第二个问题' },
        { role: 'assistant', text: '第二个回答：结论 B。', status: 'done' },
      ],
    },
  ],
})
console.log(`SANDBOX ${sandbox.base}`)
const api = sandbox.api
const conv = (await api('/api/conversations?limit=5')).body.conversations[0]
const detail = (await api(`/api/conversations/${conv.id}`)).body.conversation
const firstAnswer = detail.messages[1]

let browser
try {
  // Per-answer share should only include the selected turn.
  const shareRes = await api(`/api/conversations/${conv.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays: 7, messageIds: [detail.messages[0].id, firstAnswer.id] }),
  })
  record('per-answer share is created', shareRes.status === 201 && shareRes.body.share.messageCount === 2, JSON.stringify(shareRes.body.share?.messageCount))
  const publicData = await (await fetch(`${sandbox.base}/api/share/${shareRes.body.token}`)).json()
  record('per-answer share contains only the selected turn', publicData.messages?.length === 2 && JSON.stringify(publicData).includes('结论 A') && !JSON.stringify(publicData).includes('结论 B'), JSON.stringify(publicData.messages?.map((msg) => msg.text)))

  await api('/api/library', {
    method: 'PUT',
    body: JSON.stringify({
      bookmarks: [],
      prompts: [{ id: 'p_vars', name: '客户更新', text: '给 {{客户}} 写一段 {{交付物}} 更新，先结论后细节。' }],
    }),
  })

  browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.waitForTimeout(800)
  await page.locator('#promptsBtn').click()
  await page.waitForTimeout(400)
  const custom = page.locator('.prompt-card').filter({ hasText: '客户更新' }).first()
  await custom.getByRole('button', { name: /插入提示词/ }).click()
  await page.waitForTimeout(300)
  record('template modal opens for variables', await page.locator('#templateModal').isVisible())
  record('template modal has both variables', await page.locator('#templateFields input').count() === 2, String(await page.locator('#templateFields input').count()))
  await page.locator('#templateFields input').nth(0).fill('星河科技')
  await page.locator('#templateFields input').nth(1).fill('周报')
  await page.locator('#templateForm button[type="submit"]').click()
  await page.waitForTimeout(300)
  const composerValue = await page.locator('#input').inputValue()
  record('variables are replaced in composer', composerValue.includes('星河科技') && composerValue.includes('周报') && !composerValue.includes('{{'), composerValue)
  record('voice affordance is available', await page.locator('#micBtn').isVisible())
  record('composer keeps a single row with mic', await page.evaluate(() => getComputedStyle(document.querySelector('.composer-row')).display === 'flex'))

  // Reopen the prompt; remembered values should prefill.
  await page.locator('#input').fill('')
  await page.locator('#promptsBtn').click()
  await page.waitForTimeout(300)
  await page.locator('.prompt-card').filter({ hasText: '客户更新' }).first().getByRole('button', { name: /插入提示词/ }).click()
  await page.waitForTimeout(250)
  const remembered = await page.locator('#templateFields input').nth(0).inputValue()
  record('template values are remembered', remembered === '星河科技', remembered)
  await page.locator('#templateCancel').click()

  // Markdown export includes tool calls.
  await page.locator('#newChatTop').click()
  await page.locator('#convSearch').fill('生产力测试')
  await page.waitForTimeout(500)
  await page.locator('.conv-item').first().click()
  await page.waitForTimeout(500)
  await page.locator('.conv-more').first().click()
  // Default export: safe for external delivery.
  const defaultDownloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await page.getByRole('menuitem', { name: /导出/ }).click()
  await page.waitForTimeout(250)
  await page.locator('#exportStart').click()
  const defaultDownload = await defaultDownloadPromise
  if (defaultDownload) {
    const defaultFile = await defaultDownload.path()
    const defaultText = defaultFile ? fs.readFileSync(defaultFile, 'utf8') : ''
    record('default export omits tools and internal metadata', !defaultText.includes('工具：bash') && !defaultText.includes('权限：') && !defaultText.includes('echo hello'), defaultText.slice(0, 90))
  } else {
    record('default export omits tools and internal metadata', false, 'no download')
  }

  await page.locator('.conv-more').first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await page.getByRole('menuitem', { name: /导出/ }).click()
  await page.waitForTimeout(250)
  await page.locator('#exportTools').check()
  await page.locator('#exportMeta').check()
  await page.locator('#exportStart').click()
  const download = await downloadPromise
  record('Markdown export downloads', Boolean(download), download ? download.suggestedFilename() : 'none')
  if (download) {
    const file = await download.path()
    const markdown = file ? fs.readFileSync(file, 'utf8') : ''
    record('Markdown export includes tools', markdown.includes('工具：bash') && markdown.includes('echo hello'), markdown.slice(0, 120))
    record('Markdown export includes project metadata', markdown.includes('引擎：'))
  }

  // Answer-level share from the UI.
  await page.locator('.msg.assistant .msg-actions button[aria-label="分享这条回答"]').first().click()
  await page.waitForTimeout(300)
  record('answer share opens the share sheet', await page.locator('#shareSheet').isVisible())
  await page.locator('#shareCreate').click()
  await page.waitForTimeout(700)
  const answerUrl = await page.locator('#shareUrl').inputValue()
  record('answer share creates a URL', /\/s\//.test(answerUrl), answerUrl)
  const answerData = await (await fetch(new URL(new URL(answerUrl).pathname, sandbox.base).href.replace('/s/', '/api/share/'))).json()
  record('answer share snapshot has exactly one turn', answerData.messages?.length === 2, String(answerData.messages?.length))

  await page.screenshot({ path: path.join(ROOT, 'reports/v5/round-4/productivity.png') })
  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-4'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-4/productivity-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
