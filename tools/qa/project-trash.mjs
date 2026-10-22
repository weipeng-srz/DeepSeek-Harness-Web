// Round 5 — project trash: restore reattaches conversations, purge removes files.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox } from './quality-harness.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8823), label: 'v5-project-trash' })
const api = sandbox.api
try {
  const project = (await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: '项目回收站' }) })).body.project
  await api(`/api/projects/${project.id}/files`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'file' })
  await api('/api/memory', { method: 'POST', body: JSON.stringify({ text: '项目记忆', projectId: project.id }) })
  const conv = (await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', projectId: project.id }) })).body.conversation

  let res = await api(`/api/projects/${project.id}`, { method: 'DELETE' })
  record('project delete moves it to trash', res.status === 200 && res.body.moved === 1)
  record('trashed project is hidden from the active list', (await api('/api/projects')).body.projects.length === 0)
  const trash = (await api('/api/projects?trash=1')).body.projects
  record('trash lists the project with files', trash.length === 1 && trash[0].fileCount === 1, JSON.stringify(trash))
  record('conversation is detached while in trash', (await api(`/api/conversations/${conv.id}`)).body.conversation.projectId === null)

  await api(`/api/projects/${project.id}/restore`, { method: 'POST' })
  record('restore brings the project back', (await api('/api/projects')).body.projects.some((item) => item.id === project.id))
  record('restore reattaches its conversations', (await api(`/api/conversations/${conv.id}`)).body.conversation.projectId === project.id)
  record('project memory survives trash', (await api('/api/memory')).body.items.some((item) => item.projectId === project.id))

  await api(`/api/projects/${project.id}`, { method: 'DELETE' })
  await api(`/api/projects/${project.id}/purge`, { method: 'POST' })
  record('purge removes the project', !(await api('/api/projects')).body.projects.some((item) => item.id === project.id))
  record('purge removes project memories', !(await api('/api/memory')).body.items.some((item) => item.projectId === project.id))
  const fileRoot = path.join(sandbox.dir, 'data/projects', project.id)
  record('purge removes project files', !fs.existsSync(fileRoot))
} finally {
  await sandbox.stop().catch(() => {})
}
const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-5'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-5/project-trash-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
