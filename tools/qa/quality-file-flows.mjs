import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'apple-before'
const out = path.join(ROOT, 'reports/quality', label); fs.mkdirSync(out, { recursive: true })
const id = 'qa-file-flow', other = 'qa-file-other'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8801), label: `${label}-files`, seedConversations: [{ id, title: 'QA file workflow', messages: [{ role: 'user', text: 'QA file workflow fixture' }] }, { id: other, title: 'QA history other', messages: [{ role: 'user', text: 'QA other fixture' }] }] })
const browser = await launchBrowser(), context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] }), page = await context.newPage(); page.setDefaultTimeout(6000)
const results = [], errors = []; page.on('pageerror', e => errors.push(e.message))
const test = async (name, fn) => { try { const { ok, ...evidence } = await fn(); results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(evidence)}`) } catch (error) { results.push({ name, status: 'blocked', evidence: { error: error.message } }); console.log(`BLOCKED ${name} ${error.message.slice(0, 160)}`); await page.reload(); await page.locator('#shell').waitFor({ state: 'visible' }) } }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0q8AAAAASUVORK5CYII=', 'base64')
const stream = 'BT /F1 18 Tf 30 110 Td (QA PDF Preview) Tj ET'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
let pdf = '%PDF-1.4\n'; const offsets = [0]
objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n` })
const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
const upload = (name, body) => sandbox.api(`/api/conversations/${id}/upload?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body })
const open = async () => { await page.goto(`${sandbox.base}/c/${id}`); await page.locator('#thread .msg').first().waitFor() }
const preview = async name => { await page.locator('#filesBtn').click(); await page.getByRole('button', { name: `预览 ${name}`, exact: true }).click() }
const clearAttachments = async () => { while (await page.locator('.attachment-remove').count()) await page.locator('.attachment-remove').first().click() }
try {
  for (const [name, data] of [['QA-image.png', png], ['QA-document.pdf', Buffer.from(pdf)], ['QA-unsupported.bin', Buffer.from([1,2,3])], ['QA-safe.html', '<script>window.__QA_HTML_EXECUTED__=true</script><h1>QA HTML remains text</h1>']]) {
    const response = await upload(name, data); if (response.status !== 201) throw new Error(`Fixture upload failed: ${name} ${response.status}`)
  }
  await loginPage(page, sandbox); await open()
  await test('real PNG upload decodes in the image preview', async () => {
    await preview('QA-image.png'); await page.locator('#filePreviewBody img').waitFor(); await page.waitForFunction(() => document.querySelector('#filePreviewBody img')?.complete)
    const image = await page.locator('#filePreviewBody img').evaluate(el => ({ complete: el.complete, width: el.naturalWidth, height: el.naturalHeight, alt: el.alt }))
    await page.screenshot({ path: path.join(out, 'files-image-preview.png'), fullPage: true }); await page.keyboard.press('Escape')
    return { ok: image.complete && image.width === 1 && image.height === 1 && image.alt === 'QA-image.png', image }
  })
  await test('closing a file preview restores a visible keyboard focus target', async () => {
    await preview('QA-image.png'); await page.keyboard.press('Escape'); const focus = await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, visible: document.activeElement !== document.body && document.activeElement.getClientRects().length > 0 }))
    return { ok: focus.visible, focus }
  })
  await test('PDF preview loads a real PDF viewer instead of a blank frame', async () => {
    const pending = page.waitForResponse(response => response.url().includes('/files/raw?') && response.url().includes('QA-document.pdf'))
    await preview('QA-document.pdf'); const response = await pending; await page.locator('#filePreviewBody iframe').waitFor(); await page.waitForTimeout(900)
    const frames = page.frames().map(frame => frame.url()); const frame = page.locator('#filePreviewBody iframe')
    const frameInfo = await frame.evaluate(el => ({ title: el.title, width: el.clientWidth, height: el.clientHeight }))
    const viewer = frames.some(url => url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai'))
    await page.screenshot({ path: path.join(out, 'files-pdf-preview.png'), fullPage: true }); await page.keyboard.press('Escape')
    return { ok: response.status() === 200 && response.headers()['content-type'] === 'application/pdf' && frameInfo.width > 200 && frameInfo.height > 150 && viewer, status: response.status(), contentType: response.headers()['content-type'], frameInfo, nativeViewerFrame: viewer, frames }
  })
  await test('unsupported files show a clear download fallback', async () => {
    await preview('QA-unsupported.bin'); const text = await page.locator('#filePreviewBody').innerText(); const href = await page.locator('#filePreviewDownload').getAttribute('href'); await page.keyboard.press('Escape')
    return { ok: text.includes('不支持在线预览') && text.includes('下载') && href.includes('download=1'), text, href }
  })
  await test('HTML file cannot execute and offers a safe download or text preview', async () => {
    await preview('QA-safe.html'); const body = await page.locator('#filePreviewBody').innerText(); const executed = await page.evaluate(() => Boolean(window.__QA_HTML_EXECUTED__)); const downloadable = (await page.locator('#filePreviewDownload').getAttribute('href')).includes('download=1'); await page.keyboard.press('Escape')
    return { ok: !executed && downloadable && (body.includes('<script>') || body.includes('不支持在线预览')), executed, sourceVisible: body.includes('<script>'), unsupportedFallback: body.includes('不支持在线预览'), downloadable }
  })
  await test('file download preserves actual uploaded PNG bytes', async () => {
    await page.locator('#filesBtn').click(); const pending = page.waitForEvent('download'); await page.getByRole('link', { name: '下载 QA-image.png', exact: true }).click(); const download = await pending; const file = path.join(out, 'downloaded-fixture.png'); await download.saveAs(file); const bytes = fs.readFileSync(file); await page.keyboard.press('Escape')
    return { ok: bytes.equals(png), filename: download.suggestedFilename(), bytes: bytes.length, expectedBytes: png.length }
  })
  await test('file input caps six selected files at five and reports the limit', async () => {
    await page.locator('#fileInput').setInputFiles(Array.from({ length: 6 }, (_, i) => ({ name: `QA-selected-${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('x') })))
    const count = await page.locator('.attachment-chip').count(), toast = await page.locator('#toast').innerText(); await clearAttachments()
    return { ok: count === 5 && toast.includes('最多 5 个'), count, toast }
  })
  await test('file input accepts 25MB and rejects a file one byte larger', async () => {
    await page.locator('#fileInput').setInputFiles({ name: 'QA-boundary.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(25 * 1024 * 1024, 1) }); const boundary = await page.locator('.attachment-chip').count(); await clearAttachments()
    await page.locator('#fileInput').setInputFiles({ name: 'QA-too-large.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(25 * 1024 * 1024 + 1, 1) }); const rejected = await page.locator('.attachment-chip').count() === 0, toast = await page.locator('#toast').innerText()
    return { ok: boundary === 1 && rejected && toast.includes('超过 25MB'), boundaryAccepted: boundary === 1, oversizedRejected: rejected, toast }
  })
  await test('API enforces 25MB upload boundary without creating rejected file', async () => {
    const accepted = await upload('QA-api-boundary.bin', Buffer.alloc(25 * 1024 * 1024, 1)); const rejected = await upload('QA-api-oversized.bin', Buffer.alloc(25 * 1024 * 1024 + 1, 1)); const list = (await sandbox.api(`/api/conversations/${id}/files`)).body.files
    const missing = !list.some(file => file.name === 'QA-api-oversized.bin')
    if (accepted.body.file) await sandbox.api(`/api/conversations/${id}/files/delete`, { method: 'POST', body: JSON.stringify({ path: accepted.body.file.path }) })
    return { ok: accepted.status === 201 && accepted.body.file.size === 25 * 1024 * 1024 && rejected.status === 413 && missing, acceptedStatus: accepted.status, acceptedBytes: accepted.body.file?.size, rejectedStatus: rejected.status, rejectedFileAbsent: missing }
  })
  await test('browser file drag events reveal drop target and stage attachment', async () => {
    const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(['QA drag content'], 'QA-dropped.txt', { type: 'text/plain' })); return data })
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer }); const shown = await page.locator('#dropOverlay').isVisible(); await page.dispatchEvent('body', 'drop', { dataTransfer: transfer }); const staged = await page.locator('.attachment-chip').innerText(); const hidden = !await page.locator('#dropOverlay').isVisible(); await clearAttachments(); await transfer.dispose()
    return { ok: shown && hidden && staged.includes('QA-dropped.txt'), dropTargetShown: shown, dropTargetClosed: hidden, staged, scope: 'Real browser DataTransfer events; not an OS file-manager drag' }
  })
  await test('real browser clipboard image paste stages an image attachment', async () => {
    await page.evaluate(async () => { const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0868df'; ctx.fillRect(0, 0, 8, 8); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]) })
    await page.locator('#input').focus(); await page.keyboard.press('Meta+v'); await page.locator('.attachment-chip').waitFor(); const count = await page.locator('.attachment-chip').count(), thumb = await page.locator('.attachment-thumb').count(), toast = await page.locator('#toast').innerText(); await clearAttachments()
    return { ok: count === 1 && thumb === 1 && toast.includes('粘贴'), count, thumbnails: thumb, toast }
  })
  await test('file path insertion preserves the existing composer text', async () => {
    await page.locator('#input').fill('QA existing question'); await page.locator('#filesBtn').click(); await page.getByRole('button', { name: '把 QA-image.png 的路径插入输入框', exact: true }).click(); await page.keyboard.press('Escape'); const value = await page.locator('#input').inputValue()
    return { ok: value.startsWith('QA existing question ') && value.endsWith('QA-image.png'), value }
  })
  await test('file deletion cancel keeps file and confirm removes only that fixture', async () => {
    await page.locator('#filesBtn').click(); await page.getByRole('button', { name: '删除文件 QA-unsupported.bin', exact: true }).click(); await page.locator('#confirmCancel').click(); const before = await sandbox.api(`/api/conversations/${id}/files`)
    await page.getByRole('button', { name: '删除文件 QA-unsupported.bin', exact: true }).click(); await page.locator('#confirmOk').click(); await page.getByRole('button', { name: '删除文件 QA-unsupported.bin', exact: true }).waitFor({ state: 'detached' }); const after = await sandbox.api(`/api/conversations/${id}/files`); await page.keyboard.press('Escape')
    return { ok: before.body.files.some(file => file.name === 'QA-unsupported.bin') && !after.body.files.some(file => file.name === 'QA-unsupported.bin') && after.body.files.some(file => file.name === 'QA-image.png'), before: before.body.files.length, after: after.body.files.length }
  })
  await test('file path traversal cannot read outside the QA workspace', async () => { const result = await sandbox.api(`/api/conversations/${id}/files/raw?path=../../config.json`); return { ok: result.status === 404, status: result.status } })
  await test('slash menu keyboard chooses real commands without a model call', async () => {
    const observed = [], calls = []; const listener = req => { if (req.method() === 'POST' && /\/chat(?:\?|$)/.test(req.url())) calls.push(req.url()) }; page.on('request', listener)
    for (const [command, selector] of [['files','#filesSheet'], ['shortcuts','#shortcutsSheet'], ['permission','#permissionMenu'], ['scenario','#scenarioSheet']]) { await page.locator('#input').fill('/' + command); await page.locator('#commandMenu').waitFor({ state: 'visible' }); await page.keyboard.press('Enter'); observed.push({ command, opened: await page.locator(selector).isVisible(), cleared: await page.locator('#input').inputValue() === '' }); await page.keyboard.press('Escape') }
    page.off('request', listener); return { ok: observed.every(item => item.opened && item.cleared) && calls.length === 0, observed, modelCalls: calls.length }
  })
  await test('slash menu arrow navigation and Escape preserve typed command', async () => {
    await page.locator('#input').fill('/'); await page.keyboard.press('ArrowDown'); const command = await page.locator('#commandMenu [aria-selected="true"]').getAttribute('data-command'); await page.keyboard.press('Escape'); return { ok: command === 'scenario' && !await page.locator('#commandMenu').isVisible() && await page.locator('#input').inputValue() === '/', command }
  })
  await test('browser Back and Forward restore conversation and separate drafts', async () => {
    await open(); await page.locator('#input').fill('QA draft one'); await page.waitForTimeout(400); await page.locator(`.conv-item[data-id="${other}"] .conv-main`).click(); await page.waitForFunction(() => document.querySelector('#topbarName').textContent.includes('QA history other')); await page.locator('#input').fill('QA draft two'); await page.waitForTimeout(400)
    await page.goBack(); await page.waitForFunction(() => document.querySelector('#topbarName').textContent.includes('QA file workflow')); const back = { path: new URL(page.url()).pathname, draft: await page.locator('#input').inputValue() }
    await page.goForward(); await page.waitForFunction(() => document.querySelector('#topbarName').textContent.includes('QA history other')); const forward = { path: new URL(page.url()).pathname, draft: await page.locator('#input').inputValue() }
    return { ok: back.path.endsWith(id) && back.draft === 'QA draft one' && forward.path.endsWith(other) && forward.draft === 'QA draft two', back, forward }
  })
  results.push({ name: 'file and navigation flows have no uncaught browser exceptions', status: errors.length ? 'failed' : 'passed', evidence: { errors } })
} finally {
  fs.writeFileSync(path.join(out, 'file-flows.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, results }, null, 2)); await browser.close(); await sandbox.stop()
}
