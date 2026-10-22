// API contract tests. Defaults to an isolated sandbox so a test run can never
// create, rename, or delete the user's real conversations.
import { createSandbox } from './quality-harness.mjs'

const sandbox = process.env.APP_URL
  ? null
  : await createSandbox({
      port: Number(process.env.QA_PORT || 8810),
      label: 'api-contract',
      seedConversations: ['Alpha', 'Beta', 'Gamma'].map((name) => ({
        title: `API ${name}`,
        messages: [
          { role: 'user', text: `OK ${name} question` },
          { role: 'assistant', text: `OK ${name} answer`, status: 'done' },
        ],
      })),
    })
const BASE = process.env.APP_URL || sandbox.base
const CODE = process.env.ACCESS_CODE || sandbox?.code || ''
const results = []

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: CODE }),
  })
  const setCookie = login.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  record('login succeeds', login.status === 200 && cookie.startsWith('dsh_access='), cookie.slice(0, 12))

  const unauth = await fetch(`${BASE}/api/conversations`)
  record('unauthenticated list rejected', unauth.status === 401)

  const list = await fetch(`${BASE}/api/conversations?limit=2`, { headers: { Cookie: cookie } })
  const listData = await list.json()
  record('pagination returns limit', listData.conversations.length === 2, `n=${listData.conversations.length}`)
  record('pagination exposes total/hasMore', typeof listData.total === 'number' && typeof listData.hasMore === 'boolean', JSON.stringify({ total: listData.total, hasMore: listData.hasMore }))

  const search = await fetch(`${BASE}/api/conversations?q=OK&limit=5`, { headers: { Cookie: cookie } })
  const searchData = await search.json()
  record('search returns snippet', searchData.conversations.every((c) => 'snippet' in c), `n=${searchData.conversations.length}`)

  const created = await fetch(`${BASE}/api/conversations`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: 'dsr' }),
  }).then((r) => r.json())
  const id = created.conversation.id
  record('create conversation', Boolean(id))

  const emptyTitle = await fetch(`${BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  })
  record('empty title rejected', emptyTitle.status === 400)

  const longTitle = await fetch(`${BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x'.repeat(61) }),
  })
  record('overlong title rejected', longTitle.status === 400)

  const rename = await fetch(`${BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'API 测试会话', pinned: true }),
  }).then((r) => r.json())
  record('rename + pin persists', rename.conversation.title === 'API 测试会话' && rename.conversation.pinned === true)

  const del = await fetch(`${BASE}/api/conversations/${id}`, { method: 'DELETE', headers: { Cookie: cookie } })
  const delData = await del.json()
  record('delete returns undo window', del.status === 200 && delData.undoUntil > Date.now())
  const afterDelete = await fetch(`${BASE}/api/conversations?q=API%20%E6%B5%8B%E8%AF%95%E4%BC%9A%E8%AF%9D`, { headers: { Cookie: cookie } }).then((r) => r.json())
  record('deleted conversation hidden from list', afterDelete.total === 0, `total=${afterDelete.total}`)

  const restore = await fetch(`${BASE}/api/conversations/${id}/restore`, { method: 'POST', headers: { Cookie: cookie } })
  record('restore succeeds inside window', restore.status === 200)

  const invalidAttachment = await fetch(`${BASE}/api/conversations/${id}/chat`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'test', attachments: ['../../etc/passwd'] }),
  })
  record('path traversal attachment rejected', invalidAttachment.status === 400)

  const emptyUpload = await fetch(`${BASE}/api/conversations/${id}/upload?name=empty.txt`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream' },
    body: Buffer.alloc(0),
  })
  record('empty upload rejected', emptyUpload.status === 400)

  const crossSite = await fetch(`${BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ title: 'hacked' }),
  })
  record('cross-site write rejected', crossSite.status === 403)

  const asset = await fetch(`${BASE}/css/refine.css?v=20`, {
    headers: { 'Accept-Encoding': 'gzip' },
  })
  record('static asset gzip', asset.headers.get('content-encoding') === 'gzip', asset.headers.get('content-encoding') || '')
  const etag = asset.headers.get('etag')
  const cached = await fetch(`${BASE}/css/refine.css?v=20`, {
    headers: { 'If-None-Match': etag },
  })
  record('static ETag returns 304', cached.status === 304, `status=${cached.status}`)

  const traversal = await fetch(`${BASE}/..%2f..%2fconfig.json`)
  record('static traversal rejected', traversal.status === 403 || traversal.status === 404, `status=${traversal.status}`)

  const archive = await fetch(`${BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: true }),
  }).then((r) => r.json())
  record('archive flag persists', archive.conversation.archived === true)
  const archivedList = await fetch(`${BASE}/api/conversations?archived=1&limit=100`, { headers: { Cookie: cookie } }).then((r) => r.json())
  record('archived list contains conversation', archivedList.conversations.some((conv) => conv.id === id))
  await fetch(`${BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: false }),
  })

  const duplicate = await fetch(`${BASE}/api/conversations/${id}/duplicate`, { method: 'POST', headers: { Cookie: cookie } })
  const duplicateData = await duplicate.json()
  record('duplicate creates copy', duplicate.status === 201 && /副本/.test(duplicateData.conversation.title), duplicateData.conversation?.title)
  if (duplicateData.conversation?.id) {
    await fetch(`${BASE}/api/conversations/${duplicateData.conversation.id}`, { method: 'DELETE', headers: { Cookie: cookie } })
  }

  const backup = await fetch(`${BASE}/api/backup`, { headers: { Cookie: cookie } })
  const backupData = await backup.json()
  record('backup returns conversations', backup.status === 200 && backupData.count > 0 && Array.isArray(backupData.conversations), `count=${backupData.count}`)

  const fallback = await fetch(`${BASE}/c/${id}`)
  record('deep link SPA fallback', fallback.status === 200 && (await fallback.text()).includes('id="shell"'))

  await fetch(`${BASE}/api/conversations/${id}`, { method: 'DELETE', headers: { Cookie: cookie } })

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  const fs = await import('node:fs')
  fs.writeFileSync('/tmp/dsh-api.json', JSON.stringify({ base: BASE, sandbox: Boolean(sandbox), results }, null, 2))
  await sandbox?.stop().catch(() => {})
  process.exit(failed.length ? 2 : 0)
}

main().catch(async (error) => {
  console.error(error)
  await sandbox?.stop().catch(() => {})
  process.exit(1)
})
