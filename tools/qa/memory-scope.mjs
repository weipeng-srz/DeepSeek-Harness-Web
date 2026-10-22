// Round 3 — project-scoped memory isolation.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ROOT, createSandbox } from './quality-harness.mjs'
import { MemoryStore } from '../../server/memory-store.mjs'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8819), label: 'v5-memory-scope' })
const api = sandbox.api
try {
  const a = (await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: '项目 A' }) })).body.project
  const b = (await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: '项目 B' }) })).body.project
  const ca = (await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', projectId: a.id }) })).body.conversation
  const cb = (await api('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', projectId: b.id }) })).body.conversation

  await api('/api/memory', { method: 'POST', body: JSON.stringify({ text: '全局偏好：回答先给结论。' }) })
  await api('/api/memory', { method: 'POST', body: JSON.stringify({ text: '项目 A 事实：客户叫星河科技。', projectId: a.id }) })
  await api('/api/memory', { method: 'POST', body: JSON.stringify({ text: '项目 B 事实：预算是 20 万。', projectId: b.id }) })

  const ctxA = (await api(`/api/conversations/${ca.id}/context`)).body
  const ctxB = (await api(`/api/conversations/${cb.id}/context`)).body
  record('project A sees global + A memory', ctxA.memoryBlock.includes('全局偏好') && ctxA.memoryBlock.includes('星河科技') && !ctxA.memoryBlock.includes('20 万'), ctxA.memoryBlock.slice(0, 120))
  record('project B sees global + B memory', ctxB.memoryBlock.includes('全局偏好') && ctxB.memoryBlock.includes('20 万') && !ctxB.memoryBlock.includes('星河科技'), ctxB.memoryBlock.slice(0, 120))
  record('memory list still shows every scope', (await api('/api/memory')).body.items.length === 3)
  const items = (await api('/api/memory')).body.items
  record('memory items record their project', items.some((item) => item.projectId === a.id) && items.some((item) => item.projectId === b.id))
} finally {
  await sandbox.stop().catch(() => {})
}
// Persistence: a restart must not drop the project scope.
const tmp = path.join(os.tmpdir(), `dsh-memory-${process.pid}.json`)
try {
  const store = new MemoryStore({ filePath: tmp })
  store.add('owner', '项目 A 的持久记忆', { projectId: 'p_test123456789' })
  await store.flush()
  const reloaded = new MemoryStore({ filePath: tmp })
  const item = reloaded.list('owner').find((entry) => entry.text.includes('持久记忆'))
  record('project scope survives restart', item?.projectId === 'p_test123456789', JSON.stringify(item))
} finally {
  fs.rmSync(tmp, { force: true })
}

const failed = results.filter((item) => !item.ok)
fs.mkdirSync(path.join(ROOT, 'reports/v5/round-3'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'reports/v5/round-3/memory-scope-qa.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
