// Cycle-2 E2E: deep links, find, scroll restore, archive, batch, quick switch, settings, stats, duplicate.
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

  const convs = await cdp.eval(`fetch('/api/conversations?limit=5', {credentials:'same-origin'}).then(r=>r.json())`)
  const target = convs.conversations.find((conv) => conv.messageCount >= 6) || convs.conversations[0]

  // deep link
  await cdp.navigate(`http://127.0.0.1:8787/c/${target.id}`)
  await new Promise((r) => setTimeout(r, 1600))
  const deep = await cdp.eval(`({
    path: location.pathname,
    title: document.querySelector('#topbarName').textContent,
    msgs: document.querySelectorAll('#thread .msg').length,
    active: document.querySelector('#convList .conv-item.active')?.dataset.id || '',
    daySeps: document.querySelectorAll('#thread .day-separator, #thread .day-sep').length,
  })`)
  record('deep link opens conversation', deep.path === `/c/${target.id}` && deep.title === target.title, JSON.stringify(deep))
  record('active item matches route', deep.active === target.id)
  record('day separators render', deep.daySeps >= 1, `n=${deep.daySeps}`)

  // find
  const find = await cdp.eval(`(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 200))
    const bar = document.querySelector('#findBar')
    const opened = !bar.hidden
    const input = document.querySelector('#findInput')
    const sample = (document.querySelector('#thread .md, #thread .bubble-text')?.innerText || 'OK').trim().slice(0, 1) || 'OK'
    input.value = sample
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 500))
    const count = document.querySelector('#findCount').textContent
    const marks = document.querySelectorAll('mark.find-hit').length
    const active = document.querySelectorAll('mark.find-hit.active').length
    document.querySelector('#findNext').click()
    await new Promise(r => setTimeout(r, 120))
    const count2 = document.querySelector('#findCount').textContent
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 200))
    return { opened, sample: input.value, count, marks, active, count2, closed: bar.hidden, remaining: document.querySelectorAll('mark.find-hit').length }
  })()`)
  record('find bar opens with Cmd+F', find.opened)
  record('find highlights hits', find.marks > 0 && find.active === 1, JSON.stringify(find))
  record(
    'find next updates counter',
    find.count !== find.count2 || /\/1$/.test(find.count),
    `${find.count} → ${find.count2}`,
  )
  record('find closes and clears marks', find.closed && find.remaining === 0)

  // scroll restore
  const scroll = await cdp.eval(`(async () => {
    const area = document.querySelector('#scrollArea')
    area.scrollTop = Math.min(420, area.scrollHeight - area.clientHeight - 10)
    const before = area.scrollTop
    await new Promise(r => setTimeout(r, 500))
    const items = [...document.querySelectorAll('#convList .conv-item')]
    const other = items.find(el => el.dataset.id !== '${target.id}')
    other?.querySelector('.conv-main').click()
    await new Promise(r => setTimeout(r, 900))
    history.back()
    await new Promise(r => setTimeout(r, 1400))
    return { before, after: area.scrollTop, path: location.pathname }
  })()`)
  record('scroll position restores after back', Math.abs(scroll.after - scroll.before) < 60, JSON.stringify(scroll))

  // message link + stats
  const stats = await cdp.eval(`(async () => {
    document.querySelector('#thread .msg.user')?.scrollIntoView()
    const item = document.querySelector('#convList .conv-item.active')
    item.querySelector('.conv-more').click()
    await new Promise(r => setTimeout(r, 120))
    document.querySelector('#convPopover [data-action="stats"]').click()
    await new Promise(r => setTimeout(r, 500))
    const open = !document.querySelector('#statsModal').hidden
    const rows = document.querySelectorAll('#statsList .stats-row').length
    document.querySelector('#statsClose').click()
    await new Promise(r => setTimeout(r, 150))
    return { open, rows, closed: document.querySelector('#statsModal').hidden }
  })()`)
  record('conversation stats opens', stats.open && stats.rows >= 6, JSON.stringify(stats))

  // duplicate
  const beforeCount = Number((await cdp.eval(`fetch('/api/conversations?limit=1',{credentials:'same-origin'}).then(r=>r.json())`)).total)
  const dup = await cdp.eval(`(async () => {
    const item = document.querySelector('#convList .conv-item.active')
    item.querySelector('.conv-more').click()
    await new Promise(r => setTimeout(r, 120))
    document.querySelector('#convPopover [data-action="duplicate"]').click()
    await new Promise(r => setTimeout(r, 1400))
    return { title: document.querySelector('#topbarName').textContent, path: location.pathname }
  })()`)
  const afterCount = Number((await cdp.eval(`fetch('/api/conversations?limit=1',{credentials:'same-origin'}).then(r=>r.json())`)).total)
  record('duplicate creates a copy', afterCount === beforeCount + 1 && /副本/.test(dup.title), JSON.stringify({ beforeCount, afterCount, dup }))

  // settings
  const settings = await cdp.eval(`(async () => {
    document.querySelector('#settingsBtn').click()
    await new Promise(r => setTimeout(r, 200))
    const sheet = document.querySelector('#settingsSheet')
    const open = !sheet.hidden
    sheet.querySelector('[data-density="compact"]').click()
    sheet.querySelector('[data-font="1.1"]').click()
    sheet.querySelector('[data-theme-option="dark"]').click()
    await new Promise(r => setTimeout(r, 200))
    const state = {
      density: document.documentElement.dataset.density,
      scale: getComputedStyle(document.documentElement).getPropertyValue('--reading-scale').trim(),
      theme: document.documentElement.dataset.theme,
      notify: sheet.querySelector('#notifyToggle').getAttribute('aria-checked'),
    }
    sheet.querySelector('[data-settings-close]').click()
    await new Promise(r => setTimeout(r, 200))
    return { open, ...state, closed: sheet.hidden, stored: JSON.parse(localStorage.getItem('dsh.prefs.v1') || '{}') }
  })()`)
  record('settings apply density/font/theme', settings.density === 'compact' && settings.scale === '1.1' && settings.theme === 'dark', JSON.stringify(settings))
  record('settings persist to localStorage', settings.stored.density === 'compact' && Number(settings.stored.fontScale) === 1.1 && settings.closed)

  // quick switcher
  const quick = await cdp.eval(`(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true, bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 250))
    const modal = document.querySelector('#quickSwitcher')
    const open = !modal.hidden
    const input = document.querySelector('#quickInput')
    input.value = ${JSON.stringify(target.title.slice(0, 1))}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 200))
    const items = document.querySelectorAll('#quickList .quick-item').length
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 200))
    return { open, items, closed: modal.hidden }
  })()`)
  record('quick switcher opens and filters', quick.open && quick.items > 0 && quick.closed, JSON.stringify(quick))

  // archive
  const archived = await cdp.eval(`(async () => {
    const item = document.querySelector('#convList .conv-item.active')
    const id = item.dataset.id
    item.querySelector('.conv-more').click()
    await new Promise(r => setTimeout(r, 120))
    document.querySelector('#convPopover [data-action="archive"]').click()
    await new Promise(r => setTimeout(r, 900))
    const gone = !document.querySelector('#convList .conv-item[data-id="' + id + '"]')
    document.querySelector('#archiveBtn').click()
    await new Promise(r => setTimeout(r, 700))
    const rows = document.querySelectorAll('#archiveList .archive-row').length
    const restored = await fetch('/api/conversations/' + id, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: false }) }).then(r => r.ok)
    document.querySelector('[data-archive-close]').click()
    await new Promise(r => setTimeout(r, 300))
    return { gone, rows, restored, sheetClosed: document.querySelector('#archiveSheet').hidden }
  })()`)
  record('archive hides and lists conversation', archived.gone && archived.rows >= 1, JSON.stringify(archived))
  record('archive sheet restores', archived.restored && archived.sheetClosed)

  // batch select
  const batch = await cdp.eval(`(async () => {
    document.querySelector('#manageBtn').click()
    await new Promise(r => setTimeout(r, 200))
    const items = [...document.querySelectorAll('#convList .conv-item')].slice(0, 2)
    items.forEach(el => el.querySelector('.conv-main').click())
    await new Promise(r => setTimeout(r, 200))
    const count = document.querySelector('#batchCount').textContent
    document.querySelector('#batchCancel').click()
    await new Promise(r => setTimeout(r, 200))
    return { count, selecting: document.querySelectorAll('#convList .conv-item.selecting').length, barHidden: document.querySelector('#batchBar').hidden }
  })()`)
  record('batch select shows count', /已选 2/.test(batch.count), JSON.stringify(batch))
  record('batch cancel exits mode', batch.selecting === 0 && batch.barHidden)

  console.log('\nERRORS', JSON.stringify(errors.slice(0, 8), null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  cdp.close()
  await closeTab(tab.id)
  const fs = await import('node:fs')
  fs.writeFileSync('/tmp/dsh-e2e2.json', JSON.stringify({ results, errors }, null, 2))
  process.exit(failed.length ? 2 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
