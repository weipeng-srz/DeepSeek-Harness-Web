// Cycle-3 E2E: bookmarks, prompt library, unread, progress, find hash, summary entry.
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

  const convs = await cdp.eval(`fetch('/api/conversations?limit=10',{credentials:'same-origin'}).then(r=>r.json())`)
  const target = [...convs.conversations].sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))[0]
  await cdp.viewport(1280, 520, { mobile: false })
  await cdp.navigate(`http://127.0.0.1:8787/c/${target.id}`)
  await new Promise((r) => setTimeout(r, 1500))

  // bookmark assistant message
  const bookmarked = await cdp.eval(`(async () => {
    const bubble = [...document.querySelectorAll('#thread .msg.user')].find(el => (el.dataset.messageId || '').startsWith('m_'))
    const star = bubble?.querySelector('[aria-label="收藏这条消息"]')
    if (!star) return { skipped: true, ids: [...document.querySelectorAll('#thread .msg.user')].map(el => el.dataset.messageId).slice(0,3) }
    if (star.classList.contains('bookmarked')) {
      star.click()
      await new Promise(r => setTimeout(r, 400))
    }
    star.click()
    await new Promise(r => setTimeout(r, 600))
    const stored = JSON.parse(localStorage.getItem('dsh.bookmarks.v1') || '[]')
    document.querySelector('#bookmarksBtn').click()
    await new Promise(r => setTimeout(r, 300))
    const rows = document.querySelectorAll('#bookmarksList .bookmark-row').length
    const sheetOpen = !document.querySelector('#bookmarksSheet').hidden
    document.querySelector('[data-bookmarks-close]').click()
    await new Promise(r => setTimeout(r, 200))
    return { stored: stored.length, rows, sheetOpen, active: star.classList.contains('bookmarked') }
  })()`)
  record('bookmark saves and lists', bookmarked.stored >= 1 && bookmarked.rows >= 1 && bookmarked.sheetOpen, JSON.stringify(bookmarked))

  // bookmark jumps back
  const jump = await cdp.eval(`(async () => {
    document.querySelector('#bookmarksBtn').click()
    await new Promise(r => setTimeout(r, 300))
    const rows = [...document.querySelectorAll('#bookmarksList .bookmark-main')]
    const row = rows.find(el => el.textContent.includes(${JSON.stringify(target.title.slice(0, 20))}))
    if (!row) return { missing: true, rows: rows.length }
    row.click()
    await new Promise(r => setTimeout(r, 1200))
    return { sheetClosed: document.querySelector('#bookmarksSheet').hidden, path: location.pathname, flashOrHits: document.querySelectorAll('.msg-flash').length }
  })()`)
  record('bookmark opens conversation', jump.sheetClosed && jump.path === `/c/${target.id}`, JSON.stringify(jump))

  // prompt library
  const prompts = await cdp.eval(`(async () => {
    document.querySelector('#promptsBtn').click()
    await new Promise(r => setTimeout(r, 300))
    const open = !document.querySelector('#promptSheet').hidden
    const initial = document.querySelectorAll('#promptList .prompt-card').length
    const before = JSON.parse(localStorage.getItem('dsh.prompts.v1') || '[]').length
    document.querySelector('#promptName').value = 'E2E 提示词'
    document.querySelector('#promptText').value = '请只回复 E2E-OK'
    document.querySelector('#promptForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 300))
    const after = document.querySelectorAll('#promptList .prompt-card').length
    const last = [...document.querySelectorAll('#promptList .prompt-card')].find(card => card.textContent.includes('E2E 提示词'))
    last?.querySelector('.insert').click()
    await new Promise(r => setTimeout(r, 300))
    return { open, initial, after, input: document.querySelector('#input').value, closed: document.querySelector('#promptSheet').hidden, before }
  })()`)
  record('prompt library seeds defaults', prompts.open && prompts.initial >= 3, JSON.stringify(prompts))
  record('prompt saves and inserts', prompts.after === prompts.initial + 1 && prompts.input === '请只回复 E2E-OK' && prompts.closed, JSON.stringify(prompts))

  // find hash
  const hash = await cdp.eval(`(async () => {
    document.querySelector('#input').value = ''
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 200))
    const input = document.querySelector('#findInput')
    input.value = '的'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 500))
    const withHash = location.hash
    const count = document.querySelector('#findCount').textContent
    document.querySelector('#findClose').click()
    await new Promise(r => setTimeout(r, 200))
    return { withHash, count, after: location.hash }
  })()`)
  record('find query writes hash', hash.withHash.startsWith('#q=') && hash.after === '', JSON.stringify(hash))

  // progress
  const progress = await cdp.eval(`(async () => {
    const area = document.querySelector('#scrollArea')
    const thread = document.querySelector('#thread')
    const previous = thread.style.minHeight
    thread.style.minHeight = '3000px'
    window.dispatchEvent(new Event('resize'))
    area.scrollTop = Math.round((area.scrollHeight - area.clientHeight) * 0.4)
    area.dispatchEvent(new Event('scroll', { bubbles: true }))
    await new Promise(r => setTimeout(r, 300))
    const result = { width: document.querySelector('#readProgress').style.width, hidden: document.querySelector('#readProgress').hidden }
    thread.style.minHeight = previous
    window.dispatchEvent(new Event('resize'))
    return result
  })()`)
  record('reading progress tracks scroll', progress.width && progress.width !== '0%' && !progress.hidden, JSON.stringify(progress))

  // unread dot
  const unread = await cdp.eval(`(async () => {
    const other = [...document.querySelectorAll('#convList .conv-item')].find(el => el.dataset.id !== '${target.id}')
    if (!other) return { skipped: true }
    localStorage.setItem('dsh.read.' + other.dataset.id, '1')
    await fetch('/api/conversations/' + other.dataset.id, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: false }) })
    window.dispatchEvent(new Event('focus'))
    await new Promise(r => setTimeout(r, 900))
    document.querySelector('#menuBtn').click()
    await new Promise(r => setTimeout(r, 300))
    return { dots: document.querySelectorAll('#convList .conv-unread').length }
  })()`)
  record('unread dot appears for updated conversation', unread.dots >= 1, JSON.stringify(unread))
  await cdp.eval(`document.querySelector('#scrim')?.click()`)

  // summary entry opens confirm only
  const summary = await cdp.eval(`(async () => {
    const item = document.querySelector('#convList .conv-item.active')
    item.querySelector('.conv-more').click()
    await new Promise(r => setTimeout(r, 150))
    const entry = document.querySelector('#convPopover [data-action="summarize"]')
    entry.click()
    await new Promise(r => setTimeout(r, 250))
    const modal = !document.querySelector('#confirmModal').hidden
    const title = document.querySelector('#confirmTitle').textContent
    document.querySelector('#confirmCancel').click()
    return { entry: Boolean(entry), modal, title }
  })()`)
  record('summary asks for confirmation', summary.entry && summary.modal && /总结/.test(summary.title), JSON.stringify(summary))

  console.log('\nERRORS', JSON.stringify(errors.slice(0, 6), null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  cdp.close()
  await closeTab(tab.id)
  const fs = await import('node:fs')
  fs.writeFileSync('/tmp/dsh-e2e3.json', JSON.stringify({ results, errors }, null, 2))
  process.exit(failed.length ? 2 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
