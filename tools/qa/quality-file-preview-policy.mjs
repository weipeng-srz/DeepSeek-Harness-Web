import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'apple-file-policy-after'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const id = 'qa-file-policy'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8796), label, seedConversations: [{ id, title: 'QA isolated file policy', messages: [{ role: 'user', text: 'Synthetic file policy fixtures only.' }] }] })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(7000)
const results = [], executionRequests = []
context.on('request', request => { if (request.url().includes('__qa_file_script_executed__')) executionRequests.push(request.url()) })
const test = async (name, run) => {
  try { const { ok, ...evidence } = await run(); results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`) }
  catch (error) { results.push({ name, status: 'blocked', evidence: { error: error.message } }); console.log(`BLOCKED ${name}: ${error.message}`) }
}
const stream = 'BT /F1 18 Tf 30 110 Td (QA PDF Policy) Tj ET'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
let pdf = '%PDF-1.4\n'; const offsets = [0]
objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n` })
const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
const fixtures = new Map([
  ['policy.pdf', Buffer.from(pdf)],
  ['policy.html', Buffer.from('<!doctype html><script>window.__qaFileExecuted=true;fetch("/__qa_file_script_executed__?html")</script><h1>Active HTML test fixture</h1>')],
  ['policy.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>window.__qaFileExecuted=true;fetch("/__qa_file_script_executed__?svg")</script><rect width="100" height="100" fill="blue"/></svg>')],
])
const uploaded = new Map()
const raw = name => `/api/conversations/${id}/files/raw?path=${encodeURIComponent(uploaded.get(name))}`
const headers = async url => {
  const response = await sandbox.api(url)
  return { status: response.status, type: response.headers.get('content-type'), disposition: response.headers.get('content-disposition'), csp: response.headers.get('content-security-policy'), framing: response.headers.get('x-frame-options'), nosniff: response.headers.get('x-content-type-options') }
}
const preview = async name => {
  await page.locator('#filesBtn').click()
  await page.getByRole('button', { name: `预览 ${name}`, exact: true }).click()
}
let crossOriginServer
try {
  for (const [name, bytes] of fixtures) {
    const response = await sandbox.api(`/api/conversations/${id}/upload?name=${name}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })
    if (response.status !== 201) throw new Error(`Fixture upload: ${response.status}`)
    uploaded.set(name, response.body.file.path)
  }
  await loginPage(page, sandbox)
  await page.goto(`${sandbox.base}/c/${id}`); await page.locator('#thread .msg').first().waitFor()
  await test('same-origin PDF opens the real Chrome viewer with restrictive frame ancestors', async () => {
    const response = await headers(raw('policy.pdf'))
    await preview('policy.pdf')
    await page.waitForTimeout(1000)
    const frames = page.frames().map(frame => frame.url())
    const viewer = frames.some(url => url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai'))
    const rejected = frames.some(url => url.startsWith('chrome-error://'))
    await page.screenshot({ path: path.join(out, 'same-origin-pdf.png'), fullPage: true })
    await page.keyboard.press('Escape')
    return { ok: response.status === 200 && response.type === 'application/pdf' && response.framing === 'SAMEORIGIN' && response.csp.includes("frame-ancestors 'self'") && !response.csp.includes('sandbox') && response.nosniff === 'nosniff' && viewer && !rejected, response, viewer, frames }
  })
  await test('explicit PDF download remains an isolated attachment with unchanged bytes', async () => {
    const response = await headers(raw('policy.pdf') + '&download=1')
    await preview('policy.pdf')
    const pending = page.waitForEvent('download'); await page.locator('#filePreviewDownload').click(); const download = await pending
    const file = path.join(out, 'downloaded-policy.pdf'); await download.saveAs(file)
    const sameBytes = fs.readFileSync(file).equals(fixtures.get('policy.pdf'))
    await page.keyboard.press('Escape')
    return { ok: response.disposition.startsWith('attachment') && response.framing === 'DENY' && response.csp === "default-src 'none'; sandbox" && sameBytes, response, sameBytes }
  })
  for (const name of ['policy.html', 'policy.svg']) await test(`${name}: remains sandboxed, non-executable and download-only`, async () => {
    const response = await headers(raw(name))
    await preview(name)
    const previewText = await page.locator('#filePreviewBody').innerText()
    const pending = page.waitForEvent('download'); await page.locator('#filePreviewDownload').click(); const download = await pending
    const file = path.join(out, 'downloaded-' + name); await download.saveAs(file)
    const sameBytes = fs.readFileSync(file).equals(fixtures.get(name))
    await page.waitForTimeout(100)
    const executed = await page.evaluate(() => Boolean(window.__qaFileExecuted))
    await page.keyboard.press('Escape')
    return { ok: response.type === 'application/octet-stream' && response.disposition.startsWith('attachment') && response.csp === "default-src 'none'; sandbox" && response.framing === 'DENY' && response.nosniff === 'nosniff' && previewText.includes('不支持在线预览') && sameBytes && !executed && executionRequests.length === 0, response, previewText, sameBytes, executed, executionRequests: [...executionRequests] }
  })
  await test('cross-origin frame still cannot embed the same authenticated PDF', async () => {
    const pdfUrl = sandbox.base + raw('policy.pdf')
    crossOriginServer = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<iframe src="${pdfUrl}"></iframe>`) })
    crossOriginServer.listen(0, '127.0.0.1'); await once(crossOriginServer, 'listening')
    const foreign = await context.newPage(), messages = []
    foreign.on('console', message => messages.push(message.text()))
    const responsePending = foreign.waitForResponse(response => response.url() === pdfUrl)
    await foreign.goto(`http://127.0.0.1:${crossOriginServer.address().port}`)
    const response = await responsePending
    await foreign.waitForTimeout(400)
    const frames = foreign.frames().map(frame => frame.url())
    const blocked = frames.some(url => url.startsWith('chrome-error://')) && !frames.some(url => url.startsWith('chrome-extension://'))
    await foreign.screenshot({ path: path.join(out, 'cross-origin-blocked.png'), fullPage: true })
    await foreign.close()
    return { ok: response.status() === 200 && blocked && messages.some(message => message.includes('frame-ancestors') || message.includes('X-Frame-Options')), status: response.status(), blocked, frames, messages }
  })
  await test('main application document keeps framing denied', async () => {
    const response = await headers('/')
    return { ok: response.framing === 'DENY' && response.csp.includes("frame-ancestors 'none'"), response }
  })
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, scope: 'Real isolated HTTP and Chrome viewer/downloads. Synthetic PDF, script-bearing HTML/SVG. No user files, model calls or broad PDF security certification.', results }, null, 2))
  await context.close(); await browser.close(); if (crossOriginServer) await new Promise(resolve => crossOriginServer.close(resolve)); await sandbox.stop()
}
