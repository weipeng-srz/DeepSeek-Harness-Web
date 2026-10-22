// Round 2 — read-only share links and offline HTML export.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({
  port: Number(process.env.QA_PORT || 8807),
  label: 'v5-share',
  seedConversations: [
    {
      title: '敏感分享测试',
      messages: [
        { role: 'user', text: '客户邮箱 test@example.com，电话 13800138000' },
        { role: 'assistant', text: '收到。', status: 'done' },
      ],
    },
    {
      title: '分享测试对话',
      messages: [
        { role: 'user', text: '这是可以给同事看的结论。' },
        {
          role: 'assistant',
          text: '结论如下。',
          status: 'done',
          blocks: [
            { type: 'thinking', text: '内部推理不应默认分享。' },
            { type: 'text', text: '## 结论\n\n| 项目 | 值 |\n| --- | --- |\n| 转化率 | 12% |' },
            { type: 'tool', id: 'tool_share_1', tool: 'bash', input: { command: 'cat secret.txt' }, status: 'completed', result: 'SECRET-TOKEN' },
          ],
        },
      ],
    },
  ],
})
console.log(`SANDBOX ${sandbox.base}`)
const api = sandbox.api
const list = await api('/api/conversations?limit=10')
const conv = list.body.conversations.find((item) => item.title === '分享测试对话')
const sensitiveConv = list.body.conversations.find((item) => item.title === '敏感分享测试')
const project = (await api('/api/projects', {
  method: 'POST',
  body: JSON.stringify({ name: '分享项目', emoji: '🔗', instructions: '对外结论要克制。' }),
})).body.project
await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: JSON.stringify({ projectId: project.id }) })

let browser
try {
  let res = await api('/api/shares')
  record('share list starts empty', res.status === 200 && res.body.shares.length === 0)

  res = await api(`/api/conversations/${sensitiveConv.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays: 7 }),
  })
  record('server blocks unconfirmed sensitive share', res.status === 409 && res.body.sensitive >= 2, JSON.stringify({ status: res.status, sensitive: res.body.sensitive }))
  const allowedSensitive = await api(`/api/conversations/${sensitiveConv.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays: 7, allowSensitive: true }),
  })
  record('explicit confirmation allows sensitive share', allowedSensitive.status === 201, String(allowedSensitive.status))

  res = await api(`/api/conversations/${conv.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays: 7, includeTools: false, includeThinking: false }),
  })
  const share = res.body.share
  const url = res.body.url
  const originalToken = res.body.token
  record('create share returns 201 + url', res.status === 201 && /\/s\/[A-Za-z0-9_-]+$/.test(url || ''), url)
  record('share defaults exclude tools and thinking', share.includeTools === false && share.includeThinking === false)

  const publicRes = await fetch(`${sandbox.base}/api/share/${res.body.token}`)
  const publicData = await publicRes.json()
  const serialized = JSON.stringify(publicData)
  record('public share needs no cookie', publicRes.status === 200 && publicData.title === '分享测试对话')
  record('public snapshot omits internal project name', !('projectName' in publicData), String(publicData.projectName))
  record('public snapshot excludes tools by default', !serialized.includes('SECRET-TOKEN') && !serialized.includes('内部推理'), serialized.slice(0, 80))
  record('public snapshot excludes owner/conversation ids', !('owner' in publicData) && !('conversationId' in publicData) && !('token' in publicData))

  const protectedShare = await api(`/api/conversations/${conv.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays: 7, password: 'ab12cd', messageIds: [] }),
  })
  const lockedGet = await fetch(`${sandbox.base}/api/share/${protectedShare.body.token}`)
  const lockedBody = await lockedGet.json()
  record('password-protected share locks the snapshot', lockedGet.status === 401 && lockedBody.passwordRequired === true, String(lockedGet.status))
  const wrongPassword = await fetch(`${sandbox.base}/api/share/${protectedShare.body.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' }),
  })
  record('wrong password is rejected', wrongPassword.status === 401, String(wrongPassword.status))
  const rightPassword = await fetch(`${sandbox.base}/api/share/${protectedShare.body.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'ab12cd' }),
  })
  record('correct password unlocks the snapshot', rightPassword.status === 200 && (await rightPassword.json()).title === '分享测试对话', String(rightPassword.status))

  const pageRes = await fetch(`${sandbox.base}/s/${res.body.token}`)
  const pageHtml = await pageRes.text()
  record('share page is served without login', pageRes.status === 200 && pageHtml.includes('只读分享'), String(pageRes.status))
  record('share page is noindex', (pageRes.headers.get('x-robots-tag') || '').includes('noindex'))

  await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: JSON.stringify({ title: '更新后的标题' }) })
  const refreshed = await api(`/api/shares/${share.id}/refresh`, { method: 'POST' })
  record('share snapshot can be refreshed in place', refreshed.status === 200, String(refreshed.status))
  const refreshedPublic = await (await fetch(`${sandbox.base}/api/share/${originalToken}`)).json()
  record('refresh keeps the URL and updates content', refreshedPublic.title === '更新后的标题', refreshedPublic.title)
  await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: JSON.stringify({ title: '分享测试对话' }) })

  const withTools = await api(`/api/conversations/${conv.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays: 30, includeTools: true, includeThinking: true }),
  })
  const toolsData = await (await fetch(`${sandbox.base}/api/share/${withTools.body.token}`)).json()
  const toolsSerialized = JSON.stringify(toolsData)
  record('opt-in share includes tools and thinking', toolsSerialized.includes('SECRET-TOKEN') && toolsSerialized.includes('内部推理'))

  res = await api('/api/shares')
  record('owner share list has tokens', res.body.shares.length >= 3 && res.body.shares.every((item) => typeof item.token === 'string'), String(res.body.shares.length))
  record('share list exposes view counts', res.body.counts.views >= 2, JSON.stringify(res.body.counts))

  const revokedRes = await api(`/api/shares/${share.id}`, { method: 'DELETE' })
  record('revoke share succeeds', revokedRes.status === 200)
  const revokedPublic = await fetch(`${sandbox.base}/api/share/${originalToken}`)
  record('revoked token is not public', revokedPublic.status === 404 || revokedPublic.status === 410)
  const revokedRead = await fetch(`${sandbox.base}/api/share/${new URL(url).pathname.split('/').pop()}`)
  record('revoked link returns 410', revokedRead.status === 410, String(revokedRead.status))

  const unauthList = await fetch(`${sandbox.base}/api/shares`)
  record('share management requires auth', unauthList.status === 401)

  await sleep(500)
  const sharesFile = JSON.parse(fs.readFileSync(path.join(sandbox.dir, 'data/shares.json'), 'utf8'))
  record('share tokens are encrypted at rest', !JSON.stringify(sharesFile).includes(originalToken) && sharesFile.shares.every((item) => !('token' in item) && item.tokenEnc), 'raw token missing')
  const revokedShare = sharesFile.shares.find((item) => item.id === share.id)
  record('revoked snapshot content is purged', revokedShare && revokedShare.snapshot.messages.length === 0, JSON.stringify(revokedShare?.snapshot?.messages?.length))

  // Context preview + memory isolation.
  let contextInfo = await api(`/api/conversations/${conv.id}/context`)
  record('context preview shows project instructions', contextInfo.status === 200 && contextInfo.body.projectBlock.includes('对外结论要克制') && contextInfo.body.project.name === '分享项目', JSON.stringify(contextInfo.body.limits))
  await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: JSON.stringify({ noMemory: true }) })
  contextInfo = await api(`/api/conversations/${conv.id}/context`)
  record('conversation can disable memory', contextInfo.body.memoryDisabled === true && contextInfo.body.memoryBlock === '', String(contextInfo.body.memoryDisabled))
  await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: JSON.stringify({ noMemory: false }) })
  await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ memoryOff: true }) })
  contextInfo = await api(`/api/conversations/${conv.id}/context`)
  record('project can disable memory', contextInfo.body.memoryDisabled === true, String(contextInfo.body.memoryDisabled))
  await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ memoryOff: false }) })

  // Deleting a conversation keeps links during the 8s undo window and
  // revokes them after the purge. Use a disposable conversation.
  const doomedConv = (await api(`/api/conversations/${conv.id}/duplicate`, { method: 'POST' })).body.conversation
  const doomed = await api(`/api/conversations/${doomedConv.id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresInDays: 7 }),
  })
  const doomedToken = doomed.body.token
  await api(`/api/conversations/${doomedConv.id}`, { method: 'DELETE' })
  const duringUndo = await fetch(`${sandbox.base}/api/share/${doomedToken}`)
  record('share survives the undo window after delete', duringUndo.status === 200, String(duringUndo.status))
  await api(`/api/conversations/${doomedConv.id}/restore`, { method: 'POST' })
  const afterRestore = await fetch(`${sandbox.base}/api/share/${doomedToken}`)
  record('undo keeps the share alive', afterRestore.status === 200, String(afterRestore.status))
  await api(`/api/conversations/${doomedConv.id}`, { method: 'DELETE' })
  await sleep(10_000)
  const afterPurge = await fetch(`${sandbox.base}/api/share/${doomedToken}`)
  record('share is revoked after the undo window expires', afterPurge.status === 410, String(afterPurge.status))

  // UI: create a share, copy the URL, render the public page.
  browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  await page.goto(`${sandbox.base}/c/${conv.id}`)
  await page.waitForTimeout(700)
  await page.locator('.conv-more').first().click()
  await page.getByRole('menuitem', { name: '分享只读链接' }).click()
  await page.waitForTimeout(400)
  record('share sheet opens', await page.locator('#shareSheet').isVisible())
  await page.waitForTimeout(500)
  record('share picker lists messages', await page.locator('#sharePickList input').count() === 2, String(await page.locator('#sharePickList input').count()))
  record('share preview is not stuck loading', !(await page.locator('#sharePreview').innerText()).includes('正在统计'), await page.locator('#sharePreview').innerText())
  await page.locator('[data-share-expiry="30"]').click()
  await page.locator('#shareIncludeTools').check()
  await page.locator('#sharePickAll').click()
  await page.locator('#shareCreate').click()
  await page.waitForTimeout(800)
  const createdUrl = await page.locator('#shareUrl').inputValue()
  record('UI creates a share URL', /\/s\/[A-Za-z0-9_-]+$/.test(createdUrl), createdUrl)
  record('UI lists the new share', (await page.locator('#shareList .share-row').count()) >= 1)

  const publicContext = await browser.newContext({ viewport: { width: 900, height: 1000 }, serviceWorkers: 'block' })
  const publicPage = await publicContext.newPage()
  const publicUrl = new URL(new URL(createdUrl).pathname, sandbox.base).href
  await publicPage.goto(publicUrl)
  await publicPage.waitForTimeout(700)
  record('public page renders messages', (await publicPage.locator('.share-msg').count()) === 2, String(await publicPage.locator('.share-msg').count()))
  record('public page has no app shell', (await publicPage.locator('#sidebar, #composer').count()) === 0)
  record('public page renders tools when opted in', (await publicPage.locator('.share-tool').count()) === 1)
  record('public page prints', await publicPage.locator('#sharePrint').isVisible())
  record('public page has copy button', await publicPage.locator('#shareCopy').isVisible())
  await publicPage.screenshot({ path: path.join(ROOT, 'reports/v5/round-2/share-page.png') })

  // Offline HTML export via the conversation menu.
  await page.locator('button[data-share-close]').click()
  await page.waitForTimeout(300)
  await page.locator('.conv-more').first().click()
  const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await page.getByRole('menuitem', { name: /导出/ }).click()
  await page.waitForTimeout(250)
  await page.locator('[data-export-format="html"]').click()
  await page.locator('#exportTools').check()
  await page.locator('#exportThinking').check()
  await page.locator('#exportStart').click()
  const download = await downloadPromise
  record('offline HTML export downloads', Boolean(download), download ? download.suggestedFilename() : 'no download')
  if (download) {
    const file = await download.path()
    const html = file ? fs.readFileSync(file, 'utf8') : ''
    record('downloaded HTML is readable', Boolean(html))
    record('offline HTML has no external scripts', !/<script/i.test(html))
    record('offline HTML contains rendered table', html.includes('<table>') && html.includes('转化率'))
  }

  record('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-2'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-2/share-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
