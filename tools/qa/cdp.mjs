// Minimal CDP driver for DSH Chat UX/QA runs.
// Usage: node tools/qa/cdp.mjs <action> [args]
// Requires a Chrome/Chromium with --remote-debugging-port (default 9222).
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.CDP_PORT || 9222)
const BASE = `http://127.0.0.1:${PORT}`
export const APP = process.env.APP_URL || 'http://127.0.0.1:8787'
const ACCESS_CODE = process.env.ACCESS_CODE || ''

export async function newTab(url = 'about:blank') {
  const res = await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!res.ok) throw new Error(`new tab failed: ${res.status}`)
  return res.json()
}

export async function closeTab(id) {
  await fetch(`${BASE}/json/close/${id}`).catch(() => {})
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.id = 0
    this.pending = new Map()
    this.events = []
    this.listeners = new Map()
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve
      this.ws.onerror = reject
    })
    this.ws.onmessage = (message) => {
      const data = JSON.parse(message.data)
      if (data.id) {
        const pending = this.pending.get(data.id)
        if (!pending) return
        this.pending.delete(data.id)
        if (data.error) pending.reject(new Error(data.error.message))
        else pending.resolve(data.result)
        return
      }
      this.events.push(data)
      for (const listener of this.listeners.get(data.method) || []) listener(data.params)
    }
    return this
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 60_000)
    })
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    }
    return result.result?.value
  }

  async screenshot(file, { fullPage = false } = {}) {
    const params = { format: 'png', fromSurface: true, captureBeyondViewport: fullPage }
    if (fullPage) {
      const metrics = await this.send('Page.getLayoutMetrics')
      const size = metrics.cssContentSize || metrics.contentSize
      params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 }
    }
    const { data } = await this.send('Page.captureScreenshot', params)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  }

  async viewport(width, height, { mobile = false, scale = 2 } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile,
      screenWidth: width,
      screenHeight: height,
    })
    if (mobile) {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
      await this.send('Emulation.setUserAgentOverride', {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      })
    }
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
    await this.waitFor(() => this.eval('document.readyState === "complete"'), 15_000)
  }

  async waitFor(fn, timeout = 10_000, interval = 120) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        if (await fn()) return true
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
    throw new Error('waitFor timeout')
  }

  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

export async function openApp({ width = 1280, height = 900, mobile = false } = {}) {
  const tab = await newTab('about:blank')
  const cdp = await new CDP(tab.webSocketDebuggerUrl).open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.viewport(width, height, { mobile, scale: 2 })
  await cdp.navigate(APP)
  return { cdp, tab }
}

export async function login(cdp, code = ACCESS_CODE) {
  await cdp.waitFor(() => cdp.eval('!!document.querySelector("#loginView:not([hidden])")'), 8000).catch(() => {})
  const visible = await cdp.eval('!document.querySelector("#loginView")?.hidden')
  if (!visible) return false
  await cdp.eval(`(() => {
    const input = document.querySelector('#accessCode')
    input.value = ${JSON.stringify(code)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('#loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    return true
  })()`)
  await cdp.waitFor(() => cdp.eval('!!document.querySelector("#shell") && !document.querySelector("#shell").hidden'), 10_000)
  return true
}

export async function run(name, args) {
  if (name === 'shot') {
    const [url, file, w = '390', h = '844', mobile = '1'] = args
    const { cdp, tab } = await openApp({
      width: Number(w),
      height: Number(h),
      mobile: mobile === '1',
    })
    if (url && url !== '-') await cdp.navigate(url)
    await login(cdp).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 1200))
    console.log(await cdp.screenshot(file, { fullPage: false }))
    cdp.close()
    await closeTab(tab.id)
    return
  }
  if (name === 'eval') {
    const [expression] = args
    const { cdp, tab } = await openApp({ width: 1280, height: 900 })
    console.log(JSON.stringify(await cdp.eval(expression), null, 2))
    cdp.close()
    await closeTab(tab.id)
    return
  }
  throw new Error(`unknown action: ${name}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , name, ...args] = process.argv
  run(name, args).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
