import fs from 'node:fs'
import path from 'node:path'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'

const label = process.env.QA_LABEL || 'r5-image-preview'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8796), label })
const browser = await launchBrowser()
const results = []
try {
  await sandbox.api('/api/backup/import', { method: 'POST', body: JSON.stringify({ conversations: [{ title: 'QA image preview race', messages: [{ role: 'user', text: 'Synthetic image fixture only' }] }] }) })
  const conversation = (await sandbox.api('/api/conversations')).body.conversations[0]
  // Known valid 1x1 PNG, generated as a test fixture; no user image is involved.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP2sAAAAASUVORK5CYII=', 'base64')
  for (const name of ['delayed-a.png', 'current-b.png']) {
    const uploaded = await sandbox.api(`/api/conversations/${conversation.id}/upload?name=${name}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: png })
    if (uploaded.status < 200 || uploaded.status >= 300) throw new Error(`Upload fixture failed: ${uploaded.status}`)
  }
  for (const mode of ['load', 'error']) for (const action of ['close', 'switch']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    const pending = new Map()
    await page.route('**/files/raw?**', async route => {
      const url = new URL(route.request().url())
      const name = path.basename(url.searchParams.get('path') || '')
      const response = await route.fetch()
      await new Promise(resolve => pending.set(name, resolve))
      if (name === 'delayed-a.png' && mode === 'error') await route.fulfill({ status: 500, contentType: 'text/plain', body: 'Synthetic image failure' })
      else await route.fulfill({ response })
    })
    const waitPending = async name => {
      const started = Date.now()
      while (!pending.has(name)) {
        if (Date.now() - started > 6000) throw new Error(`Image request not observed: ${name}`)
        await page.waitForTimeout(20)
      }
    }
    const open = async name => {
      await page.locator('#filesBtn').click()
      await page.getByRole('button', { name: `预览 ${name}`, exact: true }).click()
      await waitPending(name)
      // Retain each actual image node so the test can observe its real browser
      // load/error after it is detached; do not synthesize events or callbacks.
      await page.locator('#filePreviewBody img').evaluate(img => {
        window.imageRaceNodes ||= []
        window.imageRaceEvents ||= []
        window.imageRaceNodes.push(img)
        for (const type of ['load', 'error']) img.addEventListener(type, () => window.imageRaceEvents.push({ file: img.alt, type, naturalWidth: img.naturalWidth, connected: img.isConnected }), { once: true })
      })
    }
    try {
      await loginPage(page, sandbox)
      await page.goto(`${sandbox.base}/c/${conversation.id}`)
      await page.locator('#thread .msg').first().waitFor()
      await open('delayed-a.png')
      await page.keyboard.press('Escape')
      if (action === 'switch') await open('current-b.png')
      pending.get('delayed-a.png')()
      await page.waitForFunction(({ type }) => window.imageRaceEvents?.some(event => event.file === 'delayed-a.png' && event.type === type), { type: mode })
      const afterA = await page.evaluate(() => ({
        hidden: document.querySelector('#filePreview').hidden,
        children: document.querySelector('#filePreviewBody').childElementCount,
        text: document.querySelector('#filePreviewBody').innerText,
        title: document.querySelector('#filePreviewTitle').textContent,
        imageNames: [...document.querySelectorAll('#filePreviewBody img')].map(img => img.alt),
        loading: !!document.querySelector('#filePreviewBody .file-preview-loading'),
        error: !!document.querySelector('#filePreviewBody .file-preview-error'),
        download: document.querySelector('#filePreviewDownload').href,
        filename: document.querySelector('#filePreviewDownload').download,
        events: window.imageRaceEvents,
      }))
      let ok = afterA.events.some(event => event.file === 'delayed-a.png' && event.type === mode && !event.connected)
      let afterB = null
      if (action === 'close') ok &&= afterA.hidden && afterA.children === 0 && !afterA.error
      else {
        ok &&= !afterA.hidden && afterA.title === 'current-b.png' && afterA.imageNames.join() === 'current-b.png' && afterA.loading && !afterA.error && afterA.filename === 'current-b.png' && new URL(afterA.download).searchParams.get('path').endsWith('current-b.png') && new URL(afterA.download).searchParams.get('download') === '1'
        pending.get('current-b.png')()
        await page.waitForFunction(() => window.imageRaceEvents?.some(event => event.file === 'current-b.png' && event.type === 'load'))
        afterB = await page.locator('#filePreviewBody').evaluate(body => ({ images: [...body.querySelectorAll('img')].map(img => ({ name: img.alt, width: img.naturalWidth })), loading: !!body.querySelector('.file-preview-loading'), error: !!body.querySelector('.file-preview-error') }))
        ok &&= afterB.images.length === 1 && afterB.images[0].name === 'current-b.png' && afterB.images[0].width === 1 && !afterB.loading && !afterB.error
      }
      await page.screenshot({ path: path.join(out, `${mode}-${action}.png`), fullPage: true })
      results.push({ name: `Image A delayed ${mode} after ${action} cannot alter current preview`, status: ok ? 'passed' : 'failed', evidence: { afterA, afterB } })
      console.log(`${ok ? 'PASS' : 'FAIL'} image ${mode} after ${action}`)
    } catch (error) {
      results.push({ name: `Image A delayed ${mode} after ${action} cannot alter current preview`, status: 'blocked', evidence: { error: error.message } })
      console.log(`BLOCKED ${mode} ${action}: ${error.message}`)
    } finally {
      for (const release of pending.values()) release()
      await context.close()
    }
  }
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ label, generatedAt: new Date().toISOString(), sourceSnapshot: sandbox.dir, sourceFiles: sandbox.sourceFiles, scope: 'Real Chrome image load/error races using two uploaded synthetic 1x1 PNGs, delayed HTTP and an explicit 500 image failure. No PDF, drag/drop, image format matrix or real-device claims.', results }, null, 2))
  await browser.close(); await sandbox.stop()
}
