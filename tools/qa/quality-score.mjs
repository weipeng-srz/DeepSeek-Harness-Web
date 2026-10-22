import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const label = process.env.QA_LABEL || process.argv[2] || 'baseline'
const dir = path.join(root, 'reports/quality', label)
const read = file => { try { return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) } catch { return null } }
const byName = new Map()
for (const file of ['results.json', 'exploration.json', 'batch.json', 'external-verification.json']) for (const item of read(file)?.results || []) byName.set(item.name, { ...item, source: file })
const performance = read('performance.json')
const rubric = [
  { dimension: '功能完整性', weight: 20, checks: [
    'login shell and fixture list', 'conversation opens with messages and route', 'rename saves title and closes modal', 'API archive appears in archive list', 'API duplicate preserves conversation messages', 'API delete can be undone in window', 'API backup returns all synthetic conversations', 'attachment can be staged', 'file upload, listing and raw download', 'file sheet and preview display text', 'custom prompt persists and inserts', 'message bookmark opens original message',
    'EXTERNAL:真实 DSR 生成/停止/续接', 'EXTERNAL:真实 Codex 生成/工具审批',
  ] },
  { dimension: 'UX用户体验', weight: 20, checks: [
    'authenticated logout control discoverable', 'title and message search', 'per-conversation draft restoration', 'newly created conversation updates deep-link route', 'chat failure presents retry action', 'prompt insertion preserves existing draft or asks', 'long conversation find reaches older messages', 'quick switcher supports keyboard select', 'settings Escape close', 'batch archive partial failure reports exact counts',
    'EXTERNAL:真人首次使用任务验证',
  ] },
  { dimension: 'UI视觉品质', weight: 15, checks: [
    'dark theme selection', 'theme persists after reload', 'Codex model settings measured controls and text', 'layout has no horizontal overflow at 1440', 'mobile model dialog stays in viewport',
    'EXTERNAL:浅色全页面文本对比度审计', 'EXTERNAL:深色全页面文本对比度审计',
  ] },
  { dimension: '性能和响应速度', weight: 15, checks: [
    'METRIC:localLoadUnder1000ms', 'METRIC:encodedResourcesUnder500KB', 'long conversation initial DOM remains bounded',
    'EXTERNAL:低端移动设备性能采样', 'EXTERNAL:真实慢速网络交互采样', 'EXTERNAL:十分钟持续流式内存稳定性',
  ] },
  { dimension: '稳定性与可靠性', weight: 15, checks: [
    'latest conversation selection wins response race', 'invalid conversation ends loading state', 'repeated Meta+k does not leave page inert', 'repeated Meta+p does not leave page inert', 'no uncaught browser exceptions', 'API rejects unauthenticated requests', 'API rejects blank conversation titles', 'API rejects cross-origin mutation', 'batch undo failure does not claim restored', 'batch all failures preserve selection and allow retry', 'batch double click sends each mutation once', 'batch deletion all failures remain recoverable', 'batch failure leaves page interactive',
    'EXTERNAL:真实引擎断线重连与服务重启恢复',
  ] },
  { dimension: '移动端和响应式体验', weight: 10, checks: [
    'layout has no horizontal overflow at 320', 'layout has no horizontal overflow at 390', 'layout has no horizontal overflow at 768', 'sidebar opens at 320', 'sidebar Escape close at 390', 'sidebar opens at 768', 'mobile model trigger has 44px touch target', 'mobile model dialog stays in viewport',
    'EXTERNAL:真实iOS Safari和软键盘', 'EXTERNAL:真实Android Chrome和软键盘',
  ] },
  { dimension: '无障碍与易用性', weight: 5, checks: [
    'settings opens accessible dialog', 'settings traps Tab focus', 'settings radio uses arrow-key navigation', 'settings Escape restores opener focus', 'model dialog Escape restores focus to trigger', 'quick switcher supports keyboard select', 'prompt form rejects missing content', 'mobile model trigger has 44px touch target',
    'EXTERNAL:VoiceOver或其他屏幕阅读器完整任务',
  ] },
]
function result(name) {
  if (name.startsWith('METRIC:')) {
    const value = name.endsWith('localLoadUnder1000ms') ? performance?.loadMs : performance?.encodedBytes
    const threshold = name.endsWith('localLoadUnder1000ms') ? 1000 : 500 * 1024
    return { name, status: value == null ? 'untested' : value < threshold ? 'passed' : 'failed', evidence: { value, threshold, note: '单机本地样本，不是现场Core Web Vitals' }, source: 'performance.json' }
  }
  return byName.get(name) || { name, status: name.startsWith('EXTERNAL:') ? 'blocked' : 'untested', evidence: { reason: name.startsWith('EXTERNAL:') ? '本地隔离环境尚无该独立验收证据' : '该轮套件尚未执行或证据缺失' } }
}
const dimensions = rubric.map(group => {
  const checks = group.checks.map(result)
  const passed = checks.filter(x => x.status === 'passed').length
  const score = Math.round(passed / checks.length * 1000) / 10
  return { dimension: group.dimension, weight: group.weight, passed, denominator: checks.length, score, checks }
})
const weighted = Math.round(dimensions.reduce((total, item) => total + item.score * item.weight / 100, 0) * 10) / 10
const resultDoc = { label, version: 1, definition: '固定有限检查表的证据完成分。通过=1，失败/阻塞/未测=0，并始终计入分母。同一证据可影响不同质量维度；不是WCAG认证、用户满意度或商业发布认证。', weighted, dimensions }
fs.writeFileSync(path.join(dir, 'score.json'), JSON.stringify(resultDoc, null, 2))
console.log(JSON.stringify({ label, weighted, dimensions: dimensions.map(({ dimension, passed, denominator, score }) => ({ dimension, passed, denominator, score })) }, null, 2))
