import fs from 'node:fs'
import assert from 'node:assert/strict'

// Exercise the actual client functions with injected API outcomes. This is a
// narrow unit test; independent browser tests cover DOM and interaction wiring.
const source = fs.readFileSync('public/js/app.js', 'utf8')
const start = source.indexOf('  async function runConversationBatch')
const end = source.indexOf("  els.manageBtn?.addEventListener", start)
assert(start >= 0 && end > start, 'Batch function section must exist')
const section = source.slice(start, end)

function harness(initialFailures = [], refreshFails = false) {
  const failures = new Set(initialFailures)
  const notices = [], calls = []
  const state = { selected: new Set(['a', 'b']), conversations: [{ id: 'a' }, { id: 'b' }], searchResults: [], currentId: 'a', selectMode: true }
  const button = () => ({ disabled: false })
  const els = { manageBtn: button(), batchCancel: button(), batchArchive: button(), batchDelete: button(), batchBar: { setAttribute() {}, removeAttribute() {} }, convList: { inert: false }, confirmModal: { hidden: true } }
  let emptied = false, confirmRun
  const api = async (url, options) => {
    calls.push({ url, options })
    if (failures.has(url.split('/')[3])) throw Error('Injected mutation failure')
    await Promise.resolve()
    return {}
  }
  const functions = new Function('state', 'els', 'api', 'setSelectMode', 'refreshConversations', 'showToast', 'askConfirm', 'showEmptyChat', 'updateBatchBar', 'renderConversations', `${section}\nreturn {batchArchive,batchDelete}`)(
    state, els, api,
    (value) => { state.selectMode = value; state.selected.clear() },
    async () => { if (refreshFails) throw Error('Injected refresh failure') },
    (text, options) => notices.push({ text, options }),
    (options) => { confirmRun = options.onOk() },
    () => { emptied = true },
    () => { els.batchArchive.disabled = els.batchDelete.disabled = !state.selected.size },
    () => {},
  )
  return { state, els, notices, calls, functions, failures, get emptied() { return emptied }, confirm: async () => { await confirmRun } }
}

const results = []
for (const operation of ['batchArchive', 'batchDelete']) {
  for (const failures of [[], ['a'], ['a', 'b']]) {
    const h = harness(failures)
    await h.functions[operation]()
    await h.confirm()
    assert.equal(h.notices.length, 1)
    assert.equal(h.state.selected.size, failures.length)
    assert.equal(h.emptied, operation === 'batchDelete' && !failures.includes('a'))
    if (failures.length === 2) assert(!h.notices[0].text.startsWith('已'))
    if (failures.length === 1) assert(h.notices[0].text.includes('1 段失败'))
    assert.equal(h.els.convList.inert, false)
    assert.equal(h.state.batchBusy, false)
    const primaryCalls = h.calls.length
    if (h.notices[0].options.onAction) {
      await h.notices[0].options.onAction()
      assert.equal(h.calls.length - primaryCalls, 2 - failures.length)
    }
    results.push({ operation, failures, result: h.notices.map((notice) => notice.text), passed: true })
  }
}

for (const failedUndo of [['a'], ['a', 'b']]) {
  const h = harness()
  await h.functions.batchArchive()
  failedUndo.forEach((id) => h.failures.add(id))
  await h.notices[0].options.onAction()
  const message = h.notices[1].text
  assert(failedUndo.length === 2 ? message.startsWith('恢复失败') : message.includes('1 段失败'))
  results.push({ case: 'undo failure reported accurately', failedUndo, message, passed: true })
}

const refresh = harness([], true)
await refresh.functions.batchArchive()
assert(refresh.notices[0].text.startsWith('已归档 2'))
assert(refresh.notices[0].text.includes('列表刷新失败'))
results.push({ case: 'refresh failure preserves mutation result', passed: true })

const busy = harness()
await Promise.all([busy.functions.batchArchive(), busy.functions.batchArchive()])
assert.equal(busy.calls.length, 2)
assert.equal(busy.notices.length, 1)
results.push({ case: 'concurrent archive only sends one batch', passed: true })

const report = { testType: 'Actual client helper and function unit test with injected API outcomes; not browser E2E', results }
fs.mkdirSync('docs/product/quality-2026-10-22/evidence', { recursive: true })
fs.writeFileSync('docs/product/quality-2026-10-22/evidence/frontend-batch-unit.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(`${results.length} batch unit scenarios passed`)
