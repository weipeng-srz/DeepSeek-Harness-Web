// Cycle-5 E2E: file actions, import backup, mark all read, storage info.
import fs from 'node:fs'
import { openApp, closeTab } from './cdp.mjs'

const results = []
const errors = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const { cdp, tab } = await openApp({ width: 1280, height: 900, mobile: false })
  cdp.on('Runtime.exceptionThrown', (p) => {
    errors.push((p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 300))
  })
  await cdp.waitFor(() => cdp.eval('document.readyState === "complete"'), 15_000)
  await new Promise((r) => setTimeout(r, 1000))

  const conv = await cdp.eval(`fetch('/api/conversations', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{"engine":"dsr"}'}).then(r=>r.json()).then(d=>d.conversation)`)
  await cdp.eval(`fetch('/api/conversations/${conv.id}/upload?name=cycle5.txt', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:'hello cycle 5'}).then(r=>r.json())`)
  await cdp.navigate(`http://127.0.0.1:8787/c/${conv.id}`)
  await new Promise((r) => setTimeout(r, 1400))

  const files = await cdp.eval(`(async () => {
    const bar = document.querySelector('#filesBar')
    const visible = bar && !bar.hidden
    document.querySelector('#filesBtn')?.click()
    await new Promise(r => setTimeout(r, 400))
    const rows = document.querySelectorAll('#filesList .file-row').length
    const insert = document.querySelector('#filesList .file-row-actions button[aria-label^="把 "]')
    insert?.click()
    await new Promise(r => setTimeout(r, 300))
    const inputValue = document.querySelector('#input').value
    return { visible, rows, inputValue, sheet: !document.querySelector('#filesSheet').hidden }
  })()`)
  record('file sheet lists uploaded file', files.visible && files.rows >= 1 && files.sheet, JSON.stringify(files))
  record('insert file path into composer', files.inputValue.includes('uploads/cycle5.txt'), files.inputValue)

  const deleted = await cdp.eval(`(async () => {
    const remove = document.querySelector('#filesList .file-row-actions button[aria-label^="删除文件"]')
    remove?.click()
    await new Promise(r => setTimeout(r, 250))
    const modal = !document.querySelector('#confirmModal').hidden
    document.querySelector('#confirmOk').click()
    await new Promise(r => setTimeout(r, 900))
    return { modal, rows: document.querySelectorAll('#filesList .file-row').length, empty: !!document.querySelector('#filesList .files-empty') }
  })()`)
  record('delete file from workspace', deleted.modal && deleted.rows === 0, JSON.stringify(deleted))
  await cdp.eval(`document.querySelector('[data-files-close]')?.click()`)

  // import backup
  const backup = {
    conversations: [
      {
        title: 'E2E 导入',
        engine: 'dsr',
        messages: [
          { role: 'user', text: '导入的问题', createdAt: Date.now() - 5000 },
          { role: 'assistant', text: '导入的回答', status: 'done', createdAt: Date.now() - 4000 },
        ],
      },
    ],
  }
  fs.writeFileSync('/tmp/e2e-import.json', JSON.stringify(backup))
  await cdp.eval(`document.querySelector('#settingsBtn').click()`)
  await new Promise((r) => setTimeout(r, 400))
  const storage = await cdp.eval(`document.querySelector('#storageInfo').textContent`)
  const doc = await cdp.send('DOM.getDocument')
  const inputNode = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#backupInput' })
  await cdp.send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: ['/tmp/e2e-import.json'] })
  await new Promise((r) => setTimeout(r, 1400))
  const imported = await cdp.eval(`fetch('/api/conversations?q=' + encodeURIComponent('E2E 导入'), {credentials:'same-origin'}).then(r=>r.json())`)
  record('storage info shown', /缓存|localStorage/.test(storage), storage)
  record('import backup creates conversation', imported.total >= 1, `total=${imported.total}`)

  // mark all read
  const read = await cdp.eval(`(async () => {
    document.querySelector('#markAllReadBtn').click()
    await new Promise(r => setTimeout(r, 300))
    const dots = document.querySelectorAll('#convList .conv-unread').length
    document.querySelector('[data-settings-close]').click()
    await new Promise(r => setTimeout(r, 200))
    return { dots, closed: document.querySelector('#settingsSheet').hidden }
  })()`)
  record('mark all read clears dots', read.dots === 0 && read.closed, JSON.stringify(read))

  // cleanup imported conversations
  await cdp.eval(`(async () => {
    const d = await fetch('/api/conversations?q=' + encodeURIComponent('E2E 导入'), {credentials:'same-origin'}).then(r=>r.json())
    for (const c of d.conversations) await fetch('/api/conversations/' + c.id, {method:'DELETE',credentials:'same-origin'})
    return true
  })()`)

  console.log('\nERRORS', JSON.stringify(errors.slice(0, 6), null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  cdp.close()
  await closeTab(tab.id)
  fs.writeFileSync('/tmp/dsh-e2e5.json', JSON.stringify({ results, errors }, null, 2))
  process.exit(failed.length ? 2 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
