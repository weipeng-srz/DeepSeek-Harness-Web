// The production bundle function over real HTTP with filesystem counters.
// Assets are copied into a temporary directory; the local service is untouched.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import vm from 'node:vm'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourceRoot = process.env.QA_SOURCE_ROOT || root
const source = fs.readFileSync(path.join(sourceRoot, 'server/index.mjs'), 'utf8')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-css-cache-'))
fs.cpSync(path.join(sourceRoot, 'public/css'), path.join(temp, 'css'), { recursive: true })
let reads = 0, bytes = 0, stats = 0, compressions = 0
const reset = () => { reads = 0; bytes = 0; stats = 0; compressions = 0 }
const metrics = () => ({ contentReads: reads, contentBytes: bytes, statCalls: stats, compressions })
const context = {
  fs: { ...fs, statSync(...args) { stats += 1; return fs.statSync(...args) }, readFileSync(...args) { const value = fs.readFileSync(...args); reads += 1; bytes += value.length; return value } },
  zlib: { ...zlib, gzipSync(...args) { compressions += 1; return zlib.gzipSync(...args) } },
  path, crypto, Buffer, PUBLIC_DIR: temp,
  sendJson(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) },
}
vm.createContext(context)
vm.runInContext(source.slice(source.indexOf('const CSS_BUNDLE_FILES'), source.indexOf('\nfunction serveStatic')), context)
// Keep coverage tied to the real manifest as the design layer evolves. A duplicate
// manifest entry is a defect, not an extra asset to count as successful coverage.
const bundleFiles = Array.from(vm.runInContext('CSS_BUNDLE_FILES', context))
assert.ok(bundleFiles.length > 0, 'CSS bundle manifest must not be empty')
assert.equal(new Set(bundleFiles).size, bundleFiles.length, 'CSS assets must be included exactly once')
const fileCount = bundleFiles.length
const sourceAssetHashes = Object.fromEntries(bundleFiles.map(relative => [relative, crypto.createHash('sha256').update(fs.readFileSync(path.join(temp, relative))).digest('hex')]))
const expectedContent = () => Buffer.concat(bundleFiles.flatMap(rel => [fs.readFileSync(path.join(temp, rel)), Buffer.from('\n')]))
const server = http.createServer((req, res) => context.serveCssBundle(req, res))
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const port = server.address().port
const request = (headers = {}, method = 'GET', url = '/css/bundle.css?v=quality') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: url, headers, method }, res => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); res.on('error', reject)
  }); req.on('error', reject); req.end()
})
const results = []
async function check(name, fn) {
  try { const detail = await fn(); results.push({ name, passed: true, ...detail }); console.log(`PASS ${name}`) }
  catch (error) { results.push({ name, passed: false, error: error.message, metrics: metrics() }); console.log(`FAIL ${name}: ${error.message}`) }
}
let initial
try {
  await check(`cold gzip response reads all ${fileCount} manifest files once`, async () => {
    reset(); initial = await request({ 'Accept-Encoding': 'gzip' })
    assert.equal(initial.status, 200); assert.equal(reads, fileCount); assert.equal(stats, fileCount); assert.equal(compressions, 1)
    assert.equal(initial.headers['content-encoding'], 'gzip'); assert.equal(initial.headers.vary, 'Accept-Encoding')
    assert.equal(Number(initial.headers['content-length']), initial.body.length)
    assert.match(initial.headers['cache-control'], /immutable/)
    const decoded = zlib.gunzipSync(initial.body)
    assert.ok(decoded.length > 100_000)
    assert.deepEqual(decoded, expectedContent(), 'bundle bytes must match all sources in manifest order')
    return { ...metrics(), rawBytes: decoded.length, gzipBytes: initial.body.length }
  })
  await check('100 warm 200 responses read and compress no content', async () => {
    reset(); const durations = []
    for (let i = 0; i < 100; i++) { const at = performance.now(); const response = await request({ 'Accept-Encoding': 'gzip' }); durations.push(performance.now() - at); assert.equal(response.status, 200); assert.equal(response.headers.etag, initial.headers.etag); assert.deepEqual(response.body, initial.body) }
    const measured = metrics(); assert.equal(reads, 0); assert.equal(compressions, 0); assert.equal(stats, 100 * fileCount); durations.sort((a, b) => a - b)
    return { ...measured, requests: 100, medianHttpMs: durations[50], p95HttpMs: durations[95] }
  })
  await check('100 conditional 304 responses read and compress no content', async () => {
    reset(); const durations = []
    for (let i = 0; i < 100; i++) { const at = performance.now(); const response = await request({ 'If-None-Match': initial.headers.etag }); durations.push(performance.now() - at); assert.equal(response.status, 304); assert.equal(response.body.length, 0); assert.equal(response.headers.etag, initial.headers.etag) }
    const measured = metrics(); assert.equal(reads, 0); assert.equal(compressions, 0); assert.equal(stats, 100 * fileCount); durations.sort((a, b) => a - b)
    return { ...measured, requests: 100, medianHttpMs: durations[50], p95HttpMs: durations[95] }
  })
  await check('identity and HEAD preserve content length and unversioned cache policy', async () => {
    reset(); const raw = await request({}, 'GET', '/css/bundle.css'), head = await request({}, 'HEAD')
    assert.deepEqual(raw.body, zlib.gunzipSync(initial.body)); assert.equal(raw.headers['content-encoding'], undefined)
    assert.equal(raw.headers['cache-control'], 'no-cache'); assert.equal(head.body.length, 0)
    assert.equal(Number(head.headers['content-length']), raw.body.length); assert.equal(reads, 0); assert.equal(stats, 2 * fileCount)
    return metrics()
  })
  await check('same-size edits to every manifest file invalidate ETag and exact bytes', async () => {
    let previous = initial
    const sources = []
    for (const [position, relative] of bundleFiles.entries()) {
      const file = path.join(temp, relative), before = fs.readFileSync(file), after = Buffer.from(before)
      const index = after.indexOf(' '); assert.ok(index >= 0, `${relative} has an editable whitespace byte`); after[index] = 9
      fs.writeFileSync(file, after); const changedAt = new Date(Date.now() + 2000 + position * 2000); fs.utimesSync(file, changedAt, changedAt)
      reset(); const response = await request({ 'Accept-Encoding': 'gzip', 'If-None-Match': previous.headers.etag })
      assert.equal(response.status, 200); assert.notEqual(response.headers.etag, previous.headers.etag)
      const decoded = zlib.gunzipSync(response.body)
      assert.equal(decoded.length, zlib.gunzipSync(previous.body).length)
      assert.deepEqual(decoded, expectedContent()); assert.notDeepEqual(response.body, previous.body)
      assert.equal(reads, fileCount); assert.equal(stats, fileCount); assert.equal(compressions, 1)
      const invalidation = metrics(); reset(); const conditional = await request({ 'If-None-Match': response.headers.etag })
      assert.equal(conditional.status, 304); assert.equal(reads, 0); assert.equal(compressions, 0); assert.equal(stats, fileCount)
      sources.push({ file: relative, invalidation, nextConditional: metrics() }); previous = response
    }
    return { sources }
  })
  await check('missing source returns error and restoring it recovers', async () => {
    const relative = bundleFiles.at(-1), file = path.join(temp, relative), data = fs.readFileSync(file); fs.unlinkSync(file)
    const failed = await request(); assert.equal(failed.status, 500)
    fs.writeFileSync(file, data); reset(); const recovered = await request(); assert.equal(recovered.status, 200)
    assert.deepEqual(recovered.body, expectedContent()); assert.equal(reads, fileCount); assert.equal(compressions, 1)
    return { file: relative, missingStatus: failed.status, recoveredStatus: recovered.status, recovery: metrics() }
  })
} finally {
  await new Promise(resolve => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true })
  const label = process.env.QA_LABEL || 'backend-R4-cache'
  const report = { capturedAt: new Date().toISOString(), scope: 'Original CSS bundle function, actual HTTP over localhost, copied real CSS assets, instrumented filesystem reads. Local timings are not browser Core Web Vitals.', sourceHash: crypto.createHash('sha256').update(source).digest('hex'), bundleFiles, sourceAssetHashes, results, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length }
  const output = path.join(process.env.QA_REPORT_DIR || path.join(root, 'docs/product/quality-2026-10-22/evidence'), `${label}.json`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.log(`${report.passed}/${results.length} passed`)
  process.exitCode = report.failed ? 1 : 0
}
