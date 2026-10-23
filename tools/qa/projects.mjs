// Project spaces: API contract + core UI flows. Runs in an isolated sandbox.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8801), label: 'projects' })
console.log(`SANDBOX ${sandbox.base}`)
const api = sandbox.api
let browser
try {
  let res = await api('/api/projects')
  record('projects start empty', res.status === 200 && res.body.projects.length === 0 && res.body.counts.total === 0, JSON.stringify(res.body.counts))

  res = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '美股研究', emoji: '📈', color: 'green', instructions: '先给结论，数据必须标注来源。', notes: '关注 NVDA、MSFT。' }),
  })
  const project = res.body.project
  record('create project', res.status === 201 && project.name === '美股研究' && project.emoji === '📈', JSON.stringify(project))

  const bad = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: '   ' }) })
  record('reject empty project name', bad.status === 400, String(bad.status))

  const long = await api(`/api/projects/${project.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ instructions: 'x'.repeat(5000) }),
  })
  record('instructions capped at 4000', long.status === 200 && long.body.project.instructions.length === 4000, String(long.body.project?.instructions?.length))

  await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ defaultPermission: 'read-only', defaultEngine: 'dsr' }) })
  res = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ engine: 'codex', permission: 'danger-full-access', projectId: project.id }),
  })
  const conv = res.body.conversation
  record('create conversation in project', res.status === 201 && conv.projectId === project.id, conv.projectId)
  record('project defaults override explicit request', conv.permission === 'read-only' && conv.engine === 'dsr', JSON.stringify({ permission: conv.permission, engine: conv.engine }))
  await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ defaultPermission: 'workspace-write' }) })

  res = await api(`/api/conversations?projectId=${project.id}`)
  record('filter conversations by project', res.body.total === 1 && res.body.conversations[0].id === conv.id, JSON.stringify({ total: res.body.total }))

  res = await api('/api/projects')
  record('project count includes conversation', res.body.projects[0].conversationCount === 1, String(res.body.projects[0].conversationCount))

  const other = await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr' }) })
  res = await api(`/api/projects/${project.id}`)
  const backup = await api('/api/backup')
  record('backup includes projects and links', backup.status === 200 && backup.body.projects?.length >= 1 && backup.body.conversations.some((item) => item.id === conv.id && item.projectId === project.id), JSON.stringify({ projects: backup.body.projects?.length, conv: backup.body.conversations.find((item) => item.id === conv.id)?.projectId }))

  const imported = await api('/api/backup/import', {
    method: 'POST',
    body: JSON.stringify({
      conversations: [{ title: '导入项目对话', projectId: project.id, messages: [{ role: 'user', text: 'hi' }] }],
      projects: [{ id: project.id, name: '导入项目', emoji: '📥', instructions: '导入的指令' }],
    }),
  })
  record('import restores project and remaps conversation', imported.status === 200 && imported.body.projects === 1 && imported.body.imported === 1, JSON.stringify(imported.body))
  const importedList = await api('/api/conversations?q=' + encodeURIComponent('导入项目对话'))
  const importedConv = importedList.body.conversations[0]
  const projectsNow = (await api('/api/projects')).body.projects
  const importedProject = projectsNow.find((item) => item.name === '导入项目')
  record('imported conversation points to imported project', Boolean(importedConv?.projectId && importedProject?.id === importedConv.projectId), JSON.stringify({ conv: importedConv?.projectId, project: importedProject?.id }))

  await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
  const archivedCreate = await api('/api/conversations', { method: 'POST', body: JSON.stringify({ projectId: project.id }) })
  record('archived project rejects new conversations', archivedCreate.status === 409, String(archivedCreate.status))
  await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) })

  res = await api(`/api/projects/${project.id}`, { method: 'DELETE' })
  record('delete project keeps conversations', res.status === 200 && res.body.moved >= 1, JSON.stringify({ moved: res.body.moved }))
  const afterDelete = await api('/api/conversations?projectId=' + project.id)
  const original = (await api('/api/conversations?limit=100')).body.conversations.find((item) => item.id === conv.id)
  record('deleted project conversations return to unfiled', afterDelete.body.total === 0 && original?.projectId === null, JSON.stringify({ remaining: afterDelete.body.total, projectId: original?.projectId }))

  // UI flows ------------------------------------------------------------
  browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginPage(page, sandbox)
  const projRes = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '论文', emoji: '📚', color: 'violet', instructions: '引用必须给页码。', notes: '研究主题：城市热岛。' }),
  })
  const uiProject = projRes.body.project
  const uiConv = await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', projectId: uiProject.id }) })
  await api('/api/conversations/' + uiConv.body.conversation.id, {
    method: 'PATCH',
    body: JSON.stringify({ title: '城市热岛文献综述' }),
  })
  await page.reload()
  await page.locator('#shell').waitFor({ state: 'visible' })
  await page.locator('#projectSelect').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(300)

  record('sidebar project entry visible', await page.locator('#projectsBtn').isVisible())
  // v6 replaced the chip row with a native <select> (#projectFilter). The
  // contract under test is unchanged: every selectable project is reachable
  // from the sidebar, carries its emoji/count, and filters the conversation
  // list. Assert the control actually exists rather than tolerating a
  // missing element.
  const filterVisible = await page.locator('#projectFilter').isVisible()
  const optionTexts = await page.locator('#projectSelect option').evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()))
  record('project filter rendered', filterVisible)
  record(
    'project filter lists every project plus 全部/未归类',
    optionTexts.length >= 4 && optionTexts[0] === '全部对话' && optionTexts.some((text) => text.includes('论文') && text.includes('📚')) && optionTexts.some((text) => text.startsWith('未归类')),
    optionTexts.join(' | '),
  )
  record('project badge shown on conversation', (await page.locator('.conv-item .project-badge').count()) >= 1)

  await page.selectOption('#projectSelect', uiProject.id, { timeout: 10000 })
  await page.waitForTimeout(500)
  const filtered = await page.locator('.conv-item').count()
  record('project select filters conversation list', filtered === 1, String(filtered))
  record('project select keeps the chosen project selected', (await page.locator('#projectSelect').inputValue()) === uiProject.id)
  record('empty state shows project context', await page.locator('#emptyProject').isVisible() && (await page.locator('#emptyProjectName').textContent()) === '论文')

  await page.locator('#projectsBtn').click()
  await page.waitForTimeout(300)
  record('projects sheet opens', await page.locator('#projectsSheet').isVisible())
  await page.locator('#projectNewBtn').click()
  await page.locator('#projectName').fill('面试准备')
  await page.locator('#projectEmoji').fill('🎯')
  await page.locator('#projectInstructions').fill('每次回答给出追问清单。')
  await page.locator('#projectSaveTop').click()
  await page.waitForTimeout(600)
  record('create project through UI', await page.locator('.project-row').count() >= 2)
  await page.locator('button[data-projects-close]').click()
  await page.waitForTimeout(250)

  // Move the unfiled conversation into the filtered project.
  await page.locator('#convSearch').fill('')
  await page.selectOption('#projectSelect', '')
  await page.waitForTimeout(400)
  const item = page.locator('.conv-item').filter({ hasText: '城市热岛文献综述' }).first()
  await item.locator('.conv-more').click()
  await page.getByRole('menuitem', { name: /移动到/ }).click()
  await page.waitForTimeout(300)
  record('move sheet lists projects', await page.locator('#moveSheet').isVisible() && await page.locator('#moveList .move-item').count() >= 2)
  await page.locator(`#moveList .move-item[data-project-id="${uiProject.id}"]`).click()
  await page.waitForTimeout(700)
  const moved = (await api('/api/conversations?projectId=' + uiProject.id)).body
  record('move conversation through UI persists', moved.total === 1, String(moved.total))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await page.locator('#menuBtn').click()
  await page.waitForTimeout(400)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  record('mobile project filter fits without overflow', !overflow, String(overflow))
  await page.screenshot({ path: path.join(ROOT, 'reports/v5/round-1/projects-mobile.png') })

  // A mouse-driven viewport reports pointer: fine, so coarse-pointer rules do
  // not apply. Touch targets therefore have to be measured in a touch context.
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
    serviceWorkers: 'block',
  })
  await touchContext.addCookies(await context.cookies())
  const touchPage = await touchContext.newPage()
  await touchPage.goto(sandbox.base + '/')
  await touchPage.locator('#shell').waitFor({ state: 'visible' })
  await touchPage.locator('#menuBtn').click()
  await touchPage.waitForTimeout(400)
  const touchHeights = await touchPage.evaluate(() => ({
    select: Math.round(document.querySelector('#projectSelect').getBoundingClientRect().height),
    add: Math.round(document.querySelector('#newProjectBtn').getBoundingClientRect().height),
    filter: Math.round(document.querySelector('#projectFilter').getBoundingClientRect().height),
  }))
  // The visible control is the 44px filter row; the borderless <select> inside
  // covers it minus the 1px top/bottom borders. Both are asserted so a future
  // shrink of either is caught.
  record('touch project filter row >= 44px', touchHeights.filter >= 44, JSON.stringify(touchHeights))
  record('touch project select covers the row', touchHeights.select >= touchHeights.filter - 2, `${touchHeights.select}/${touchHeights.filter}`)
  record('touch project add target >= 32px', touchHeights.add >= 32, String(touchHeights.add))
  await touchPage.screenshot({ path: path.join(ROOT, 'reports/v5/round-1/projects-mobile-touch.png') })
  await touchContext.close()

  record('no page errors', errors.length === 0, errors.join(' | ').slice(0, 200))
} finally {
  await browser?.close().catch(() => {})
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-1'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-1/projects-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
