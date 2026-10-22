/* DSH Chat · Codex controls
   Adds native-Codex model / reasoning-effort selection, a one-click "open in
   Codex Desktop" action, and keeps the bridge selection in sync with the
   conversation. This file is intentionally self-contained so the main client
   stays focused on rendering the chat. */
(function () {
  'use strict'

  const MODEL_KEY = 'dsh.codex.model'
  const EFFORT_KEY = 'dsh.codex.effort'
  const CATALOG_KEY = 'dsh.codex.catalog.v1'
  const CATALOG_TTL = 12 * 60 * 60 * 1000

  const $ = (sel, root = document) => root.querySelector(sel)
  const el = (tag, cls, text) => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }

  const state = {
    catalog: readCachedCatalog(),
    currentId: null,
    conversation: null,
    conversationAt: 0,
    popover: null,
    toastTimer: null,
    loading: false,
    catalogRetry: 0,
    catalogAttemptAt: 0,
  }

  function readCachedCatalog() {
    try {
      const raw = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null')
      if (!raw || !Array.isArray(raw.models) || !raw.models.length) return null
      if (Date.now() - Number(raw.at || 0) > CATALOG_TTL) return null
      return raw
    } catch {
      return null
    }
  }

  function writeCachedCatalog(value) {
    try {
      localStorage.setItem(CATALOG_KEY, JSON.stringify(value))
    } catch {}
  }

  function modelById(id) {
    const models = state.catalog?.models || []
    return models.find((model) => model.id === id) || models.find((model) => model.default) || models[0] || null
  }

  function effortOf(model, value) {
    if (!model) return null
    return (model.efforts || []).find((effort) => effort.value === value) || null
  }

  function selection() {
    const conversation = state.conversation
    const convIsCurrent = conversation && conversation.id === state.currentId
    const storedModel = localStorage.getItem(MODEL_KEY)
    const storedEffort = localStorage.getItem(EFFORT_KEY)
    const modelId = (convIsCurrent && conversation.codexModel) || storedModel
    const model = modelById(modelId)
    if (!model) return { model: null, effort: null }
    let effortValue = (convIsCurrent && conversation.codexEffort) || storedEffort
    if (!effortOf(model, effortValue)) effortValue = model.defaultEffort || model.efforts?.[0]?.value || 'medium'
    return { model, effort: effortOf(model, effortValue) }
  }

  function remember(modelId, effortValue) {
    try {
      if (modelId) localStorage.setItem(MODEL_KEY, modelId)
      if (effortValue) localStorage.setItem(EFFORT_KEY, effortValue)
    } catch {}
  }

  function codexContext() {
    const engineBar = $('#engineBar')
    if (engineBar && !engineBar.hidden && $('#engineCodex')?.classList.contains('active')) return true
    const badge = $('#modeBadge')
    if (badge?.classList.contains('codex')) return true
    return /Codex/.test($('#topbarSub')?.textContent || '') && !$('#emptyState')?.hidden
      ? true
      : /Codex/.test($('#topbarSub')?.textContent || '') && Boolean(state.currentId)
  }

  function currentConversationId() {
    return localStorage.getItem('dsh.current') || null
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `请求失败（${response.status}）`)
    }
    return response.json()
  }

  function showMessage(text, tone = 'normal') {
    let node = $('#codexToast')
    if (!node) {
      node = el('div', 'codex-toast')
      node.id = 'codexToast'
      node.setAttribute('role', 'status')
      node.setAttribute('aria-live', 'polite')
      document.body.appendChild(node)
    }
    node.textContent = text
    node.dataset.tone = tone
    node.classList.add('show')
    clearTimeout(state.toastTimer)
    state.toastTimer = setTimeout(() => node.classList.remove('show'), 2600)
  }

  async function loadCatalog(force = false) {
    if (state.loading) return
    if (!force && Date.now() - state.catalogAttemptAt < 5000) return
    if (!force && state.catalog?.models?.length && Date.now() - Number(state.catalog.at || 0) < 60_000) return
    state.catalogAttemptAt = Date.now()
    state.loading = true
    try {
      const data = await api('/api/codex/models')
      if (Array.isArray(data.models) && data.models.length) {
        state.catalog = { models: data.models, at: Date.now(), source: data.source }
        writeCachedCatalog(state.catalog)
        render()
        if (data.source === 'fallback' && state.catalogRetry < 3) {
          state.catalogRetry += 1
          setTimeout(() => void loadCatalog(true), 1800 * state.catalogRetry)
        }
      }
    } catch {
      state.catalogAttemptAt = 0
    } finally {
      state.loading = false
    }
  }

  async function refreshCurrent(force = false) {
    const id = currentConversationId()
    if (!id) {
      state.currentId = null
      state.conversation = null
      render()
      return
    }
    if (!force && id === state.currentId && Date.now() - state.conversationAt < 2500) {
      render()
      return
    }
    state.currentId = id
    try {
      const data = await api(`/api/conversations/${id}?summary=1`)
      state.conversation = data.conversation
    } catch {
      state.conversation = null
    }
    state.conversationAt = Date.now()
    render()
  }

  async function patchSelection(modelId, effortValue) {
    remember(modelId, effortValue)
    if (!state.currentId || state.conversation?.engine !== 'codex') {
      render()
      return
    }
    try {
      const data = await api(`/api/conversations/${state.currentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ codexModel: modelId, codexEffort: effortValue }),
      })
      state.conversation = data.conversation
      state.conversationAt = Date.now()
    } catch (error) {
      showMessage(error.message || '保存 Codex 设置失败', 'error')
    }
    render()
  }

  /* ── controls ─────────────────────────────────────────────────────── */

  function ensureControls() {
    const engineBar = $('#engineBar')
    if (engineBar && !$('#codexSettingsBtn')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = 'codexSettingsBtn'
      button.className = 'codex-pill codex-inline'
      button.setAttribute('aria-haspopup', 'dialog')
      button.setAttribute('aria-expanded', 'false')
      button.title = 'Codex 模型与思考强度'
      button.innerHTML =
        '<span class="codex-pill-dot" aria-hidden="true"></span>' +
        '<span class="codex-pill-text">Codex</span>' +
        '<svg aria-hidden="true"><use href="#i-chevron"></use></svg>'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        togglePopover(button)
      })
      engineBar.appendChild(button)
    }

    const composerFoot = $('.composer-foot')
    if (composerFoot && !$('#codexFootBtn')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = 'codexFootBtn'
      button.className = 'codex-pill codex-foot'
      button.hidden = true
      button.setAttribute('aria-haspopup', 'dialog')
      button.setAttribute('aria-expanded', 'false')
      button.innerHTML =
        '<span class="codex-pill-text">Codex</span>' +
        '<svg aria-hidden="true"><use href="#i-chevron"></use></svg>'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        togglePopover(button)
      })
      composerFoot.appendChild(button)
    }

    const topbarActions = $('.topbar-actions')
    if (topbarActions && !$('#codexOpenBtn')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = 'codexOpenBtn'
      button.className = 'icon-btn codex-open'
      button.hidden = true
      button.setAttribute('aria-label', '在 Codex 中打开')
      button.title = '在 Codex 桌面端打开'
      button.innerHTML = '<svg><use href="#i-external"></use></svg>'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        void openInCodex()
      })
      topbarActions.prepend(button)
    }
  }

  function render() {
    if (state.popover && !state.popover.isConnected) state.popover = null
    ensureControls()
    const codex = codexContext()
    if (!codex && state.popover) closePopover()
    const engineBarVisible = $('#engineBar') && !$('#engineBar').hidden
    const inline = $('#codexSettingsBtn')
    const foot = $('#codexFootBtn')
    const open = $('#codexOpenBtn')
    const { model, effort } = selection()
    const label = model ? `${model.name}${effort ? ` · ${effort.label}` : ''}` : 'Codex 设置'

    if (inline) {
      inline.hidden = !codex || !engineBarVisible
      inline.querySelector('.codex-pill-text').textContent = label
      inline.disabled = !state.catalog?.models?.length
    }
    if (foot) {
      foot.hidden = !codex || engineBarVisible
      foot.querySelector('.codex-pill-text').textContent = label
      foot.disabled = !state.catalog?.models?.length
    }
    if (open) {
      open.hidden = !codex || !state.conversation?.codexThreadId
      open.title = state.conversation?.codexThreadId
        ? '在 Codex 桌面端打开这个对话'
        : '发送第一条消息后可在 Codex 中打开'
    }
    const engineHint = $('#engineHint')
    if (engineHint && codex && model && engineBarVisible) {
      engineHint.textContent = `${model.name} · ${effort?.label || ''}`
    }
    if (state.popover) renderPopover(state.popover.__anchor)
    if (codex && !state.catalog?.models?.length && !state.loading) void loadCatalog()
  }

  function togglePopover(anchor) {
    if (state.popover && !state.popover.isConnected) state.popover = null
    if (state.popover) {
      closePopover()
      return
    }
    if (!state.catalog?.models?.length) {
      void loadCatalog(true)
      showMessage('正在读取 Codex 模型…')
      return
    }
    openPopover(anchor)
  }

  function closePopover() {
    const pop = state.popover
    if (!pop) return
    pop.remove()
    state.popover = null
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
    for (const id of ['codexSettingsBtn', 'codexFootBtn']) {
      $(`#${id}`)?.setAttribute('aria-expanded', 'false')
    }
  }

  function onOutside(event) {
    if (!state.popover) return
    if (state.popover.contains(event.target)) return
    if (event.target.closest('#codexSettingsBtn,#codexFootBtn')) return
    closePopover()
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePopover()
    }
  }

  function openPopover(anchor) {
    closePopover()
    const pop = el('div', 'codex-pop')
    pop.setAttribute('role', 'dialog')
    pop.setAttribute('aria-label', 'Codex 模型与思考强度')
    pop.__anchor = anchor
    document.body.appendChild(pop)
    state.popover = pop
    renderPopover(anchor)
    anchor.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKey, true)
    requestAnimationFrame(() => {
      pop.querySelector('.codex-model-choice.is-active')?.focus({ preventScroll: true })
    })
  }

  function renderPopover(anchor) {
    const pop = state.popover
    if (!pop) return
    const { model, effort } = selection()
    const fingerprint = [
      model?.id || '',
      effort?.value || '',
      state.conversation?.codexThreadId || '',
      state.catalog?.models?.length || 0,
      state.catalog?.source || '',
    ].join('|')
    if (pop.__fingerprint === fingerprint) {
      positionPopover(pop, anchor)
      return
    }
    pop.__fingerprint = fingerprint
    pop.replaceChildren()

    const head = el('div', 'codex-pop-head')
    const title = el('div', 'codex-pop-title', 'Codex 运行设置')
    const sub = el('div', 'codex-pop-sub', '模型与思考强度会在下一条消息生效')
    head.append(title, sub)
    pop.appendChild(head)

    const modelSection = el('div', 'codex-pop-section')
    modelSection.appendChild(el('div', 'codex-pop-label', '模型'))
    const modelList = el('div', 'codex-model-list')
    for (const item of state.catalog.models) {
      const active = model?.id === item.id
      const choice = el('button', 'codex-model-choice' + (active ? ' is-active' : ''))
      choice.type = 'button'
      choice.setAttribute('aria-pressed', String(active))
      const top = el('span', 'codex-model-top')
      top.appendChild(el('span', 'codex-model-name', item.name))
      if (item.default) top.appendChild(el('span', 'codex-model-tag', '默认'))
      choice.appendChild(top)
      if (item.description) choice.appendChild(el('span', 'codex-model-desc', item.description))
      choice.addEventListener('click', () => {
        const nextEffort = effortOf(item, effort?.value) ? effort.value : item.defaultEffort
        void patchSelection(item.id, nextEffort)
        requestAnimationFrame(() => {
          pop.querySelector('.codex-model-choice.is-active')?.focus({ preventScroll: true })
        })
      })
      modelList.appendChild(choice)
    }
    modelSection.appendChild(modelList)
    pop.appendChild(modelSection)

    const effortSection = el('div', 'codex-pop-section')
    const effortHead = el('div', 'codex-pop-label-row')
    effortHead.appendChild(el('div', 'codex-pop-label', '思考强度'))
    effortHead.appendChild(el('div', 'codex-pop-label-hint', `当前 ${model?.name || 'Codex'}`))
    effortSection.appendChild(effortHead)
    const effortGrid = el('div', 'codex-effort-grid')
    for (const option of model?.efforts || []) {
      const active = effort?.value === option.value
      const choice = el('button', 'codex-effort-choice' + (active ? ' is-active' : ''))
      choice.type = 'button'
      choice.setAttribute('aria-pressed', String(active))
      choice.appendChild(el('span', 'codex-effort-name', option.label))
      if (option.description) choice.appendChild(el('span', 'codex-effort-desc', option.description))
      choice.title = option.description || option.label
      choice.addEventListener('click', () => {
        void patchSelection(model.id, option.value)
      })
      effortGrid.appendChild(choice)
    }
    effortSection.appendChild(effortGrid)
    pop.appendChild(effortSection)

    const foot = el('div', 'codex-pop-foot')
    const open = el('button', 'codex-pop-open')
    open.type = 'button'
    open.innerHTML = '<svg aria-hidden="true"><use href="#i-external"></use></svg><span>在 Codex 中打开</span>'
    open.disabled = !state.conversation?.codexThreadId
    open.title = open.disabled ? '发送第一条消息后可用' : '在 Codex 桌面端打开这个对话'
    open.addEventListener('click', () => void openInCodex(true))
    foot.appendChild(open)
    const source = el(
      'span',
      'codex-pop-source',
      state.catalog.source === 'live' ? '模型来自本机 Codex' : '模型来自本地缓存',
    )
    foot.appendChild(source)
    pop.appendChild(foot)

    positionPopover(pop, anchor)
  }

  function positionPopover(pop, anchor) {
    if (window.innerWidth < 641) {
      pop.classList.add('is-sheet')
      return
    }
    const rect = anchor.getBoundingClientRect()
    const width = pop.offsetWidth || 360
    const height = pop.offsetHeight || 420
    let left = Math.min(rect.left, window.innerWidth - width - 12)
    left = Math.max(12, left)
    let top = rect.top - height - 10
    if (top < 12) top = Math.min(window.innerHeight - height - 12, rect.bottom + 10)
    pop.style.left = `${left}px`
    pop.style.top = `${Math.max(12, top)}px`
  }

  async function openInCodex(fromPopover = false) {
    if (!state.currentId) return
    try {
      let conv = state.conversation
      if (!conv?.codexThreadId) {
        const data = await api(`/api/conversations/${state.currentId}`)
        conv = data.conversation
        state.conversation = conv
      }
      if (!conv?.codexThreadId) {
        showMessage('先发送一条消息，Codex 会话创建后即可打开')
        return
      }
      await api(`/api/conversations/${state.currentId}/open-codex`, { method: 'POST' })
      showMessage('已在 Codex 桌面端打开')
      if (fromPopover) closePopover()
    } catch (error) {
      showMessage(error.message || '打开 Codex 失败', 'error')
    }
  }

  /* ── keep the chat request in sync ────────────────────────────────── */

  const nativeFetch = window.fetch.bind(window)
  window.fetch = function dshCodexFetch(input, init) {
    let mutated = init
    try {
      const rawUrl = typeof input === 'string' ? input : input?.url
      const url = new URL(rawUrl || '', location.href)
      const method = String(init?.method || input?.method || 'GET').toUpperCase()
      if (method === 'POST' && url.pathname === '/api/conversations' && init?.body) {
        const body = JSON.parse(init.body)
        if (body.engine === 'codex') {
          const { model, effort } = selection()
          if (model) {
            body.codexModel = model.id
            body.codexEffort = effort?.value || model.defaultEffort
            mutated = { ...init, body: JSON.stringify(body) }
          }
        }
      }
    } catch {}
    const result = nativeFetch(input, mutated)
    try {
      const rawUrl = typeof input === 'string' ? input : input?.url
      const url = new URL(rawUrl || '', location.href)
      if (url.pathname === '/api/conversations' && String(mutated?.method || 'GET').toUpperCase() === 'POST') {
        result.then((response) => {
          response
            .clone()
            .json()
            .then((data) => {
              if (!data?.conversation) return
              state.currentId = data.conversation.id
              state.conversation = data.conversation
              state.conversationAt = Date.now()
              render()
            })
            .catch(() => {})
        })
      }
      if (/\/api\/conversations\/[^/]+\/chat$/.test(url.pathname)) {
        setTimeout(() => void refreshCurrent(true), 1800)
        setTimeout(() => void refreshCurrent(true), 6000)
      }
    } catch {}
    return result
  }

  function watchDom() {
    let timer = null
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (codexContext()) void refreshCurrent()
        render()
      }, 100)
    }
    for (const target of [$('#engineBar'), $('#modeBadge'), $('#thread'), $('#topbarSub'), $('#emptyState')]) {
      if (!target) continue
      new MutationObserver(schedule).observe(target, {
        childList: true,
        attributes: true,
        attributeFilter: ['hidden', 'class'],
      })
    }
    // Keep metadata refresh cheap: token rendering must never add requests.
    let lastRefresh = 0
    const originalRefresh = refreshCurrent
    refreshCurrent = async function throttledRefresh(force = false) {
      if (!force && Date.now() - lastRefresh < 2000) return originalRefresh(false)
      lastRefresh = Date.now()
      return originalRefresh(force)
    }
    document.addEventListener('submit', (event) => {
      if (event.target?.id === 'loginForm') setTimeout(() => void loadCatalog(), 700)
    })
    document.addEventListener('click', (event) => {
      if (event.target.closest('#loginBtn')) setTimeout(() => void loadCatalog(), 900)
      if (event.target.closest('#engineCodex,#engineDsr,#newChat,#newChatTop,.conv-item')) {
        setTimeout(() => {
          if (codexContext()) void refreshCurrent(true)
          render()
        }, 220)
      }
      if (event.target.closest('#sendBtn,#composer')) {
        setTimeout(() => void refreshCurrent(true), 2200)
      }
    })
    setInterval(() => {
      if (!document.hidden && codexContext()) void refreshCurrent()
      render()
    }, 4000)
  }

  function ensureStyles() {
    if (document.querySelector('link[data-codex-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/css/codex.css?v=1'
    link.dataset.codexCss = '1'
    document.head.appendChild(link)
  }

  function init() {
    ensureStyles()
    ensureControls()
    render()
    watchDom()
    void loadCatalog()
    void refreshCurrent(true)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
