/**
 * Long-term memory checks: extraction rules, credential screening, storage,
 * dedupe, limits and prompt rendering. Runs offline — no server needed.
 *
 *   node tools/qa/memory.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildMemoryPromptBlock,
  extractMemoryCandidates,
  isSensitiveMemory,
} from '../../server/memory.mjs'
import { MemoryStore } from '../../server/memory-store.mjs'

let failures = 0
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('capture rules')
const CASES = [
  ['记住我在杭州，偏好先给结论', 1],
  ['请记住：我对花生过敏', 1],
  ['以后回答我时先给结论，再解释原因。', 1],
  ['嗯，以后请用中文回答', 1],
  ['我更喜欢简洁的回答', 1],
  ['我的时区是东八区', 1],
  ['我一直想学吉他', 1],
  ['哦，我对海鲜过敏', 1],
  ['总结这篇文章', 0],
  ['帮我查一下明天天气', 0],
  ['下次再聊', 0],
  ['你还记得我喜欢什么吗？', 0],
  ['你还记得我喜欢什么', 0],
  ['为什么我总是遇到这个问题？', 0],
  ['今天一直下雨，出门记得带伞', 0],
  ['系统一直报错，帮我看看', 0],
  ['我的电脑一直很卡', 0],
]
for (const [text, wanted] of CASES) {
  const got = extractMemoryCandidates(text)
  check(JSON.stringify(text), (got.length > 0) === Boolean(wanted), JSON.stringify(got))
}

console.log('credential screening')
check('password rejected', isSensitiveMemory('我的密码是 hunter2xyz'))
check('token rejected', isSensitiveMemory('key: sk-abcdefgh12345678'))
check('id number rejected', isSensitiveMemory('身份证：330101199001011234'))
check('normal preference allowed', !isSensitiveMemory('我在杭州，偏好先给结论'))

console.log('prompt block')
const block = buildMemoryPromptBlock([
  { text: '我在杭州' },
  { text: '偏好先给结论', pinned: true },
  { text: '这条已暂停', disabled: true },
])
check('wrapped and labelled', block.startsWith('[长期记忆]') && block.endsWith('[/长期记忆]'))
check('contains active memories', block.includes('我在杭州') && block.includes('偏好先给结论'))
check('skips disabled memory', !block.includes('这条已暂停'))
check('empty list yields empty block', buildMemoryPromptBlock([]) === '')

console.log('store')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-'))
const file = path.join(dir, 'memory.json')
const store = new MemoryStore({ filePath: file })
try {
  let result = store.add('owner', '我在杭州，偏好先给结论')
  check('create', result.created && store.count('owner') === 1)
  result = store.add('owner', ' 我在杭州，偏好先给结论。 ')
  check('exact duplicate folded', !result.created && store.count('owner') === 1)
  store.add('owner', '我在杭州，偏好先给结论，并且喜欢简洁排版')
  check('longer phrasing replaces shorter', store.list('owner').length === 1 && store.list('owner')[0].text.includes('简洁排版'))
  store.add('other', '我在杭州，偏好先给结论')
  check('owners isolated', store.count('owner') === 1 && store.count('other') === 1)
  let rejected = 0
  for (const bad of ['', 'a', '我的密码是 hunter2xyz']) {
    try { store.add('owner', bad) } catch { rejected += 1 }
  }
  check('invalid and secret input rejected', rejected === 3)
  store.setSettings({ autoCapture: false })
  check('auto capture respects toggle', store.capture('owner', '记住我对花生过敏').length === 0)
  store.setSettings({ autoCapture: true })
  check('auto capture works', store.capture('owner', '记住我对花生过敏').length === 1)
  const item = store.list('owner')[0]
  store.update('owner', item.id, { pinned: true })
  const pinnedBlock = store.promptBlock('owner')
  const sibling = store.list('owner').find((entry) => entry.id !== item.id)
  check('pinned memory leads the prompt', pinnedBlock.indexOf(item.text) < pinnedBlock.indexOf(sibling.text))
  store.update('owner', item.id, { disabled: true })
  check('disabled memory leaves the prompt', !store.promptBlock('owner').includes(item.text))
  store.setSettings({ enabled: false })
  check('master switch suppresses prompt', store.promptBlock('owner') === '')
  store.setSettings({ enabled: true })
  const exported = store.export('owner')
  const restored = new MemoryStore({ filePath: path.join(dir, 'restored.json') })
  const imported = restored.import('owner', exported)
  check('export/import round-trip', imported.imported === exported.items.length && restored.count('owner') === exported.items.length)
  await store.flush()
  check('persisted to disk', fs.existsSync(file))
  check('file is private', (fs.statSync(file).mode & 0o777) === 0o600, `mode=${(fs.statSync(file).mode & 0o777).toString(8)}`)
  const cleared = store.clear('owner')
  check('clear owner', cleared > 0 && store.count('owner') === 0)
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
process.exitCode = failures ? 1 : 0
