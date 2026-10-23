// Owner isolation: with `singleUser: false` each browser (dsh_cid) is its own
// owner. Projects used to be a global namespace — any authenticated device
// could read another owner's instructions/notes, rename or purge their
// projects, and inherit their defaultPermission. This suite locks that down,
// and re-checks the conversation endpoints that were already scoped.
import { createSandbox, sleep } from './quality-harness.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8818), label: 'isolation', singleUser: false })
const { base, code } = sandbox

// Two independent clients: each keeps its own cookie jar, exactly like two
// browsers on the same access code.
function makeClient(name) {
  const jar = new Map()
  const call = async (url, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const response = await fetch(base + url, { ...options, headers })
    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';')
      const index = pair.indexOf('=')
      jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    return { status: response.status, body, headers: response.headers }
  }
  return {
    name,
    call,
    login: () => call('/api/login', { method: 'POST', body: JSON.stringify({ code }) }),
  }
}

try {
  const A = makeClient('A')
  const B = makeClient('B')
  record('client A logs in', (await A.login()).status === 200)
  record('client B logs in', (await B.login()).status === 200)
  // Force distinct client ids even if one request happened before login.
  await A.call('/api/me')
  await B.call('/api/me')

  const project = (await A.call('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'A-PRIVATE', instructions: 'SECRET-INSTRUCTIONS-A', notes: 'SECRET-NOTES-A', defaultPermission: 'danger-full-access' }),
  })).body.project
  record('A creates a project', Boolean(project?.id))

  const listB = await B.call('/api/projects')
  record('B cannot list A\'s project', listB.status === 200 && !listB.body.projects.some((item) => item.id === project.id), JSON.stringify(listB.body.projects?.map((item) => item.name)))
  record('B cannot count A\'s conversations', listB.body.counts?.total === 0, JSON.stringify(listB.body.counts))

  const backupB = await B.call('/api/backup')
  record('B\'s backup does not contain A\'s project', backupB.status === 200 && !(backupB.body.projects || []).some((item) => item.id === project.id))

  const patchB = await B.call(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'PWNED-BY-B' }) })
  record('B cannot rename A\'s project', patchB.status === 404, String(patchB.status))

  const filesB = await B.call(`/api/projects/${project.id}/files`)
  record('B cannot list A\'s project files', filesB.status === 404, String(filesB.status))

  const convB = await B.call('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', projectId: project.id }) })
  record('B cannot create a conversation inside A\'s project', convB.status === 400, String(convB.status))

  const trashB = await B.call(`/api/projects/${project.id}`, { method: 'DELETE' })
  record('B cannot trash A\'s project', trashB.status === 404, String(trashB.status))

  const purgeB = await B.call(`/api/projects/${project.id}/purge`, { method: 'POST' })
  record('B cannot purge A\'s project', purgeB.status === 404, String(purgeB.status))

  const restoreB = await B.call(`/api/projects/${project.id}/restore`, { method: 'POST' })
  record('B cannot restore A\'s project', restoreB.status === 404, String(restoreB.status))

  const listA = await A.call('/api/projects')
  record('A still sees the untouched project', listA.body.projects.some((item) => item.id === project.id && item.name === 'A-PRIVATE'), JSON.stringify(listA.body.projects?.map((item) => item.name)))
  record('A\'s project keeps its instructions', listA.body.projects.find((item) => item.id === project.id)?.instructions === 'SECRET-INSTRUCTIONS-A')

  // Conversations were already owner-scoped; keep the assertion so a future
  // refactor cannot quietly relax it.
  const convA = (await A.call('/api/conversations', { method: 'POST', body: JSON.stringify({ engine: 'dsr', projectId: project.id }) })).body.conversation
  const readB = await B.call(`/api/conversations/${convA.id}`)
  record('B cannot read A\'s conversation', readB.status === 404, String(readB.status))

  // Unauthenticated logout must not revoke every session.
  const anon = await fetch(`${base}/api/logout`, { method: 'POST' })
  record('anonymous logout is rejected', anon.status === 401, String(anon.status))
  const stillA = await A.call('/api/conversations')
  record('A\'s session survives an anonymous logout attempt', stillA.status === 200, String(stillA.status))
} finally {
  await sandbox.stop().catch(() => {})
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
