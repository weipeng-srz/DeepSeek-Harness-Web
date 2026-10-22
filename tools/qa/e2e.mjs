// End-to-end UX regression for the cycle-1 feature set.
import { openApp, login, closeTab } from './cdp.mjs'

const results = []
const errors = []

function record(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const { cdp, tab } = await openApp({ width: 390, height: 844, mobile: true })
  cdp.on('Runtime.exceptionThrown', (params) => {
    errors.push((params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || '').slice(0, 300))
  })

  await cdp.waitFor(() => cdp.eval('document.readyState === "complete"'), 15_000)
  await login(cdp)
  await new Promise((r) => setTimeout(r, 900))

  record('shell visible', await cdp.eval('!!document.querySelector("#shell") && !document.querySelector("#shell").hidden'))
  record('5 scenario cards', (await cdp.eval('document.querySelectorAll("#scenarioGrid [data-scenario]").length')) === 5)

  // theme three-state
  const theme = await cdp.eval(`(async () => {
    const start = document.documentElement.dataset.theme || 'auto'
    const seen = []
    for (let i = 0; i < 3; i += 1) {
      document.querySelector('#themeBtn').click()
      await new Promise(r => setTimeout(r, 80))
      seen.push(document.documentElement.dataset.theme || 'auto')
    }
    return { start, seen, back: seen[2] === start }
  })()`)
  record('theme cycles through auto/light/dark', theme.back, JSON.stringify(theme.seen))

  // search
  const search = await cdp.eval(`(async () => {
    const input = document.querySelector('#convSearch')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'OK')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 700))
    return {
      results: document.querySelectorAll('#convList .conv-item').length,
      marks: document.querySelectorAll('#convList .conv-snippet mark').length,
      count: document.querySelector('#convResultCount').textContent,
      clearVisible: !document.querySelector('#convSearchClear').hidden,
    }
  })()`)
  record('full-text search returns hits', search.results > 0, JSON.stringify(search))
  record('search highlights match', search.marks > 0, `marks=${search.marks}`)
  record('search count + clear button', Boolean(search.count) && search.clearVisible, search.count)

  await cdp.eval(`document.querySelector('#convSearchClear').click()`)
  await new Promise((r) => setTimeout(r, 500))

  // open conversation
  const opened = await cdp.eval(`(async () => {
    document.querySelector('#convList .conv-main')?.click()
    await new Promise(r => setTimeout(r, 1100))
    return {
      msgs: document.querySelectorAll('#thread .msg').length,
      actions: document.querySelectorAll('#thread .msg-actions button').length,
      title: document.querySelector('#topbarName').textContent,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }
  })()`)
  record('open conversation renders messages', opened.msgs > 0, JSON.stringify(opened))
  record('message actions present', opened.actions >= 3, `buttons=${opened.actions}`)
  record('no horizontal overflow', !opened.overflow)

  // rename via menu
  const renamed = await cdp.eval(`(async () => {
    const item = document.querySelector('#convList .conv-item.active')
    item.querySelector('.conv-more').click()
    await new Promise(r => setTimeout(r, 120))
    const menu = document.querySelector('#convPopover')
    const menuItems = menu ? menu.querySelectorAll('.conv-popover-item').length : 0
    menu?.querySelector('[data-action="rename"]').click()
    await new Promise(r => setTimeout(r, 180))
    const modal = document.querySelector('#renameModal')
    const input = document.querySelector('#renameInput')
    if (!input || modal.hidden) return { menuItems, input: false }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'E2E 重命名测试')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('#renameSave').click()
    await new Promise(r => setTimeout(r, 800))
    return { menuItems, input: true, title: document.querySelector('#topbarName').textContent, listTitle: document.querySelector('#convList .conv-item.active .conv-title')?.textContent, modalClosed: document.querySelector('#renameModal').hidden }
  })()`)
  record('conversation menu has core actions', renamed.menuItems >= 4, `items=${renamed.menuItems}`)
  record('rename saves and updates topbar', renamed.title === 'E2E 重命名测试', JSON.stringify(renamed))

  // pin
  const pinned = await cdp.eval(`(async () => {
    const toggle = async () => {
      const item = document.querySelector('#convList .conv-item.active')
      item.querySelector('.conv-more').click()
      await new Promise(r => setTimeout(r, 120))
      const btn = document.querySelector('#convPopover [data-action="pin"]')
      const label = btn.textContent
      btn.click()
      await new Promise(r => setTimeout(r, 700))
      return label
    }
    const first = await toggle()
    if (first.includes('取消')) await toggle()
    return {
      first,
      pinnedGroup: Boolean(document.querySelector('#convList .conv-group.pinned')),
      pinIcon: Boolean(document.querySelector('#convList .conv-item.active .conv-pin-dot')),
    }
  })()`)
  record('pin creates pinned group', pinned.pinnedGroup && pinned.pinIcon, JSON.stringify(pinned))

  // draft persistence
  await cdp.eval(`document.querySelector('#newChatTop').click()`)
  await new Promise((r) => setTimeout(r, 400))
  await cdp.eval(`(() => {
    const input = document.querySelector('#input')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, '这是草稿，刷新后应该还在')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await new Promise((r) => setTimeout(r, 500))
  await cdp.navigate('http://127.0.0.1:8787/')
  await new Promise((r) => setTimeout(r, 1500))
  const draft = await cdp.eval(`document.querySelector('#input')?.value || ''`)
  record('draft survives reload', draft === '这是草稿，刷新后应该还在', JSON.stringify(draft))

  // attachment staging via drop
  const staged = await cdp.eval(`(async () => {
    const input = document.querySelector('#input')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const file = new File(['alpha\\nbeta\\n'], 'e2e-note.txt', { type: 'text/plain' })
    const dt = new DataTransfer()
    dt.items.add(file)
    window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }))
    await new Promise(r => setTimeout(r, 100))
    const overlayShown = !document.querySelector('#dropOverlay').hidden
    window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await new Promise(r => setTimeout(r, 300))
    return {
      overlayShown,
      chips: document.querySelectorAll('.attachment-chip').length,
      trayHidden: document.querySelector('#attachmentTray').hidden,
      sendEnabled: !document.querySelector('#sendBtn').disabled,
    }
  })()`)
  record('drag overlay appears', staged.overlayShown)
  record('dropped file becomes staged attachment', staged.chips === 1 && !staged.trayHidden, JSON.stringify(staged))
  record('send enabled by attachment alone', staged.sendEnabled)

  // send with attachment
  await cdp.eval(`(() => {
    const input = document.querySelector('#input')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, '只回复 OK')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('#sendBtn').click()
    return true
  })()`)
  await cdp.waitFor(
    () => cdp.eval(`!document.querySelector('#sendBtn').classList.contains('stop') && !!document.querySelector('#thread .msg.assistant .msg-actions')`),
    45_000,
    250,
  )
  const sent = await cdp.eval(`(() => ({
    userBubbles: document.querySelectorAll('#thread .msg.user').length,
    bubblesWithFiles: document.querySelectorAll('#thread .msg.user .bubble-files .file-chip').length,
    assistantText: document.querySelector('#thread .msg.assistant .md')?.innerText || '',
    usage: Boolean(document.querySelector('#thread .msg.assistant .msg-usage-btn')),
    time: Boolean(document.querySelector('#thread .msg.assistant .msg-time')),
  }))()`)
  record('send with attachment succeeds', sent.userBubbles >= 1 && sent.bubblesWithFiles >= 1, JSON.stringify(sent))
  record('assistant reply is OK', /OK/.test(sent.assistantText), sent.assistantText.slice(0, 40))
  record('usage + timestamp rendered', sent.usage && sent.time, JSON.stringify({ usage: sent.usage, time: sent.time }))

  // regenerate
  await cdp.eval(`document.querySelector('#thread .msg.assistant:last-of-type [aria-label="重新生成回答"]')?.click()`)
  await cdp.waitFor(
    () => cdp.eval(`!document.querySelector('#sendBtn').classList.contains('stop') && document.querySelectorAll('#thread .msg.assistant').length === 1`),
    45_000,
    250,
  ).catch(() => {})
  await new Promise((r) => setTimeout(r, 800))
  const regen = await cdp.eval(`({
    users: document.querySelectorAll('#thread .msg.user').length,
    assistants: document.querySelectorAll('#thread .msg.assistant').length,
    text: document.querySelector('#thread .msg.assistant .md')?.innerText || '',
  })`)
  record('regenerate keeps a single user bubble', regen.users === 1 && regen.assistants === 1, JSON.stringify(regen))

  // edit + resend
  await cdp.eval(`document.querySelector('#thread .msg.user [aria-label="编辑这条提问"]')?.click()`)
  await new Promise((r) => setTimeout(r, 200))
  const editor = await cdp.eval(`(() => {
    const area = document.querySelector('.bubble-edit')
    if (!area) return { open: false }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(area, '只回复 EDITED')
    area.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.user-edit-actions .primary').click()
    return { open: true, modal: !document.querySelector('#confirmModal').hidden }
  })()`)
  record('edit opens with confirmation', editor.open && editor.modal, JSON.stringify(editor))
  await cdp.eval(`document.querySelector('#confirmOk').click()`)
  await cdp.waitFor(
    () => cdp.eval(`!document.querySelector('#sendBtn').classList.contains('stop') && document.querySelector('#thread .msg.assistant .md')?.innerText.includes('EDITED')`),
    45_000,
    250,
  ).catch(() => {})
  const edited = await cdp.eval(`({
    user: document.querySelector('#thread .msg.user .bubble-text')?.textContent || '',
    assistant: document.querySelector('#thread .msg.assistant .md')?.innerText || '',
    count: document.querySelectorAll('#thread .msg').length,
  })`)
  record('edit updates bubble and regenerates', edited.user === '只回复 EDITED' && edited.assistant.length > 0, JSON.stringify(edited))

  // shortcuts
  const shortcuts = await cdp.eval(`(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    await new Promise(r => setTimeout(r, 200))
    const open = !document.querySelector('#shortcutsSheet')[0]?.hidden
    const sheet = document.querySelector('#shortcutsSheet')
    const visible = !sheet.hidden
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 200))
    return { visible, closed: sheet.hidden }
  })()`)
  record('shortcut sheet opens and closes', shortcuts.visible && shortcuts.closed, JSON.stringify(shortcuts))

  // command palette
  const command = await cdp.eval(`(async () => {
    const input = document.querySelector('#input')
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, '/')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 160))
    const items = document.querySelectorAll('#commandMenu .command-item').length
    const open = !document.querySelector('#commandMenu').hidden
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return { items, open }
  })()`)
  record('slash command palette lists commands', command.open && command.items >= 5, JSON.stringify(command))

  // delete + undo
  const deleted = await cdp.eval(`(async () => {
    const item = document.querySelector('#convList .conv-item.active')
    item.querySelector('.conv-more').click()
    await new Promise(r => setTimeout(r, 120))
    document.querySelector('#convPopover [data-action="delete"]').click()
    await new Promise(r => setTimeout(r, 200))
    document.querySelector('#confirmOk').click()
    await new Promise(r => setTimeout(r, 700))
    const toastAction = document.querySelector('.toast-action')
    const presentAfter = Boolean(document.querySelector('#convList .conv-item.active'))
    toastAction?.click()
    await new Promise(r => setTimeout(r, 900))
    return { toast: Boolean(toastAction), presentAfter, restored: document.querySelectorAll('#convList .conv-item').length }
  })()`)
  record('delete offers undo', deleted.toast, JSON.stringify(deleted))
  record('undo restores conversation', deleted.restored > 0)

  // accessibility / layout
  const a11y = await cdp.eval(`(() => {
    const small = [...document.querySelectorAll('button, a[href], input')].filter((el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width && r.height && s.visibility !== 'hidden' && (!el.closest('.sheet[hidden]')) && (!el.closest('.modal[hidden]')) && (r.width < 44 || r.height < 44)
    }).map((el) => ({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 40), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))
    return {
      small,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      skip: Boolean(document.querySelector('.skip-link')),
      toolExpanded: [...document.querySelectorAll('.tool-head')].every((el) => el.hasAttribute('aria-expanded')),
    }
  })()`)
  record('no horizontal overflow (final)', !a11y.overflow)
  record('skip link present', a11y.skip)
  record('small tap targets <= 5', a11y.small.length <= 5, JSON.stringify(a11y.small.slice(0, 8)))

  console.log('\nERRORS', JSON.stringify(errors.slice(0, 10), null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  cdp.close()
  await closeTab(tab.id)
  const fs = await import('node:fs')
  fs.writeFileSync('/tmp/dsh-e2e.json', JSON.stringify({ results, errors }, null, 2))
  process.exit(failed.length ? 2 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
