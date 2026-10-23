/* DSH Chat · DSH engine model selection
   Mirrors the Desktop model selector for the DSH engine: the same live
   catalog (provider groups, reasoning efforts, Desktop default) with a
   per-conversation pinned selection. The floating pill sits ABOVE the
   composer without taking layout space, so the input box never moves.
   Self-contained like codex.js; loaded after it so both fetch wrappers
   chain (codex first, then this one). */
(function () {
  'use strict'

  // See app.js: localStorage throws when site data is blocked, and these
  // modules run before login. Degrade to memory instead of breaking the page.
  const storage = (() => {
    try {
      const real = window.localStorage
      real.setItem('__dsh_probe__', '1')
      real.removeItem('__dsh_probe__')
      return real
    } catch {
      const memory = new Map()
      return {
        getItem: (key) => (memory.has(key) ? memory.get(key) : null),
        setItem: (key, value) => { memory.set(key, String(value)) },
        removeItem: (key) => { memory.delete(key) },
      }
    }
  })()

  const PROVIDER_KEY = 'dsh.model.provider'
  const MODEL_KEY = 'dsh.model.id'
  const EFFORT_KEY = 'dsh.model.effort'
  const CATALOG_KEY = 'dsh.catalog.v1'
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
    contextVersion: 0,
    refreshSequence: 0,
    refreshPending: null,
    patchSequence: 0,
    savingSelection: null,
    popover: null,
    query: '',
    toastTimer: null,
    loading: false,
    catalogRetry: 0,
    catalogAttemptAt: 0,
    catalogTimer: null,
  }

  function readCachedCatalog() {
    try {
      const raw = JSON.parse(storage.getItem(CATALOG_KEY) || 'null')
      if (!raw || !Array.isArray(raw.groups) || !raw.groups.length) return null
      // A live catalog is stable for hours. The static fallback (Desktop app
      // closed / bridge still booting) can be replaced at any moment, so it
      // only survives a few seconds — otherwise the picker would keep showing
      // the smaller fallback list long after the live registry came online.
      const ttl = raw.source === 'live' ? CATALOG_TTL : 30_000
      if (Date.now() - Number(raw.at || 0) > ttl) return null
      return raw
    } catch {
      return null
    }
  }

  function writeCachedCatalog(value) {
    try {
      storage.setItem(CATALOG_KEY, JSON.stringify(value))
    } catch {}
  }

  /* ── catalog helpers ───────────────────────────────────────────────── */

  // Desktop display order: the DeepSeek account provider first, the official
  // API second, everything else in registry order.
  function providerOrder(id) {
    return id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2
  }

  function sortedGroups() {
    const groups = state.catalog?.groups || []
    return [...groups].sort((a, b) => providerOrder(a.id) - providerOrder(b.id))
  }

  // Keep the Chinese labels the Desktop selector shows, even though the
  // registry's own provider names are English ("DeepSeek Account").
  function providerName(id) {
    if (id === 'deepseek-account') return 'DeepSeek 账号'
    if (id === 'deepseek-official') return 'DeepSeek'
    const group = (state.catalog?.groups || []).find((item) => item.id === id)
    if (group?.name && group.name !== group.id) return group.name
    return id
  }

  function findModel(provider, modelId) {
    if (!provider || !modelId) return null
    const group = (state.catalog?.groups || []).find((item) => item.id === provider)
    const model = group?.models?.find((item) => item.id === modelId)
    return model ? { ...model, provider, providerName: providerName(provider) } : null
  }

  function effortsOf(model) {
    return Array.isArray(model?.reasoning?.efforts) ? model.reasoning.efforts : []
  }

  function effortOf(model, id) {
    return effortsOf(model).find((effort) => effort.id === id) || null
  }

  function isCatalogDefault(provider, modelId) {
    const def = state.catalog?.default
    return Boolean(def && def.provider === provider && def.model === modelId)
  }

  /* ── selection ─────────────────────────────────────────────────────── */

  function storedPick() {
    const provider = storage.getItem(PROVIDER_KEY)
    const model = storage.getItem(MODEL_KEY)
    const effort = storage.getItem(EFFORT_KEY)
    return provider && model ? { provider, model, effort } : null
  }

  function remember(provider, modelId, effortId) {
    try {
      if (provider) storage.setItem(PROVIDER_KEY, provider)
      if (modelId) storage.setItem(MODEL_KEY, modelId)
      storage.setItem(EFFORT_KEY, effortId || '')
    } catch {}
  }

  function forget() {
    try {
      storage.removeItem(PROVIDER_KEY)
      storage.removeItem(MODEL_KEY)
      storage.removeItem(EFFORT_KEY)
    } catch {}
  }

  /**
   * The effective selection for display. A loaded conversation carries the
   * server-resolved route (pinned or Desktop default); a fresh chat uses the
   * remembered local pick, else the catalog default.
   */
  function selection() {
    const conv = state.conversation
    const convIsCurrent = conv && conv.id === currentConversationId()
    if (convIsCurrent && conv.dshModel) {
      const entry = findModel(conv.dshProvider, conv.dshModel)
      const effort = effortOf(entry, conv.dshEffort)
      return {
        provider: conv.dshProvider,
        model: conv.dshModel,
        effort,
        entry,
        explicit: Boolean(conv.dshModelExplicit),
        modelName: entry?.name || conv.dshModelName || conv.dshModel,
        providerName: conv.dshProviderName || providerName(conv.dshProvider),
        effortName: effort?.name || conv.dshEffortName || conv.dshEffort || '',
        isDefault: !conv.dshModelExplicit,
      }
    }
    const def = state.catalog?.default || null
    const pick = storedPick()
    const provider = pick?.provider || def?.provider || null
    const modelId = pick?.model || def?.model || null
    const entry = findModel(provider, modelId)
    let effortId = pick?.effort || ''
    if (!effortOf(entry, effortId)) effortId = entry?.reasoning?.defaultEffort || effortsOf(entry)[0]?.id || ''
    const effort = effortOf(entry, effortId)
    return {
      provider,
      model: modelId,
      effort,
      entry,
      explicit: Boolean(pick),
      modelName: entry?.name || modelId || 'DSH 模型',
      providerName: entry?.providerName || providerName(provider),
      effortName: effort?.name || effortId || '',
      isDefault: !pick && Boolean(def && def.provider === provider && def.model === modelId),
    }
  }

  /** Public label hook consumed by app.js (sidebar / topbar / details). */
  function publicLabel() {
    try {
      if (!dsrContext()) return null
      const current = selection()
      if (!current.model) return null
      return `${current.modelName}${current.effortName ? ` · ${current.effortName}` : ''}`
    } catch {
      return null
    }
  }

  // The attribute-only check misses the <=360px CSS rule that hides the bar
  // while leaving `hidden` false; use layout so the floating pill takes over.
  function engineBarShown() {
    const bar = $('#engineBar')
    return Boolean(bar && !bar.hidden && bar.getClientRects().length)
  }

  function dsrContext() {
    if (engineBarShown()) {
      return !$('#engineCodex')?.classList.contains('active')
    }
    const badge = $('#modeBadge')
    if (badge?.classList.contains('codex')) return false
    // Codex's own in-conversation control is the strongest live signal while
    // the conversation summary is still loading.
    const codexFoot = $('#codexFootBtn')
    if (codexFoot && !codexFoot.hidden && codexFoot.getClientRects().length) return false
    const conv = state.conversation
    if (conv && conv.id === currentConversationId()) return conv.engine !== 'codex'
    // The offline cache is written on every conversation load and already
    // knows the engine before the summary fetch returns.
    const cached = cachedEngine(currentConversationId())
    if (cached) return cached !== 'codex'
    // app.js persists the engine on selection and on conversation load.
    if (storage.getItem('dsh.engine') === 'codex') return false
    // Only positive DSH evidence counts. Treating "no Codex text" as DSH is
    // what used to keep the DSH picker on a Codex chat during a route change.
    if (badge && /原生|Headless/.test(badge.textContent || '')) return true
    return false
  }

  function cachedEngine(id) {
    if (!id) return null
    try {
      const raw = JSON.parse(storage.getItem('dsh.cache.v1') || 'null')
      if (!raw) return null
      const current = raw.current
      if (current?.id === id && (current.engine === 'codex' || current.engine === 'dsr')) {
        return current.engine
      }
      const conv = (raw.conversations || []).find((item) => item.id === id)
      if (conv?.engine === 'codex' || conv?.engine === 'dsr') return conv.engine
    } catch {}
    return null
  }

  function currentConversationId() {
    // localStorage is shared by tabs; only this tab's route identifies its chat.
    const match = location.pathname.match(/^\/c\/([^/]+)\/?$/)
    if (!match) return null
    try { return decodeURIComponent(match[1]) } catch { return null }
  }

  function syncCurrentContext() {
    const id = currentConversationId()
    if (id !== state.currentId) {
      state.currentId = id
      state.conversation = null
      state.conversationAt = 0
      state.contextVersion += 1
      state.refreshSequence += 1
      state.refreshPending = null
      closePopover()
    }
    return id
  }

  function isCurrentContext(id, version) {
    return currentConversationId() === id && state.currentId === id && state.contextVersion === version
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
    let node = $('#dshModelToast')
    if (!node) {
      node = el('div', 'dshm-toast')
      node.id = 'dshModelToast'
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

  /* ── data loading ──────────────────────────────────────────────────── */

  function authedNow() {
    const shell = document.getElementById('shell')
    return Boolean(shell && !shell.hidden)
  }

  async function loadCatalog(force = false) {
    // render() can run before login; without this guard every repaint on the
    // login page fired an authenticated request (401 in the console).
    if (!authedNow()) return
    if (state.loading) return
    if (!force && Date.now() - state.catalogAttemptAt < 5000) return
    const freshWindow = state.catalog?.source === 'live' ? 60_000 : 5_000
    if (!force && state.catalog?.groups?.length && Date.now() - Number(state.catalog.at || 0) < freshWindow) return
    state.catalogAttemptAt = Date.now()
    state.loading = true
    try {
      const data = await api(`/api/dsh/models${force ? '?refresh=1' : ''}`)
      if (Array.isArray(data.groups) && data.groups.length) {
        state.catalog = {
          groups: data.groups,
          default: data.default || null,
          failures: data.failures || [],
          at: Date.now(),
          source: data.source,
          native: Boolean(data.native),
        }
        writeCachedCatalog(state.catalog)
        render()
        // The Desktop bridge may still be booting. Keep upgrading a static
        // catalog on a short backoff: the live registry has the full provider
        // list and reasoning efforts, and the Desktop may open much later.
        clearTimeout(state.catalogTimer)
        if (data.source === 'fallback') {
          const delay = Math.min(30_000, 3000 * 2 ** Math.min(state.catalogRetry, 4))
          state.catalogRetry += 1
          state.catalogTimer = setTimeout(() => void loadCatalog(true), delay)
        } else {
          state.catalogRetry = 0
          state.catalogTimer = null
        }
      }
    } catch {
      // Keep the throttle timestamp so a flapping bridge cannot turn the
      // 4s render tick into a request loop.
    } finally {
      state.loading = false
    }
  }

  async function refreshCurrent(force = false) {
    const id = syncCurrentContext()
    if (!id) return render()
    if (state.savingSelection?.id === id) return render()
    if (state.refreshPending?.id === id) return state.refreshPending.promise
    if (!force && Date.now() - state.conversationAt < 2500) return render()
    const version = state.contextVersion
    const sequence = ++state.refreshSequence
    const patchSequence = state.patchSequence
    const pending = { id, promise: null }
    pending.promise = (async () => {
      try {
        const data = await api(`/api/conversations/${encodeURIComponent(id)}?summary=1`)
        if (!isCurrentContext(id, version) || sequence !== state.refreshSequence || patchSequence !== state.patchSequence) return
        if (data.conversation?.id !== id) throw new Error('对话设置暂未同步，请重新选择重试')
        state.conversation = data.conversation
        state.conversationAt = Date.now()
      } catch (error) {
        if (!isCurrentContext(id, version) || sequence !== state.refreshSequence) return
        if (force) showMessage(error.message || '读取设置失败，请重试', 'error')
      } finally {
        if (state.refreshPending === pending) state.refreshPending = null
        if (isCurrentContext(id, version)) render()
      }
    })()
    state.refreshPending = pending
    return pending.promise
  }

  async function patchSelection(provider, modelId, effortId) {
    const id = syncCurrentContext()
    if (provider && modelId) remember(provider, modelId, effortId)
    if (!id) {
      render()
      return
    }
    if (state.conversation?.id !== id || state.conversation.engine === 'codex') {
      showMessage('正在读取这个对话的设置，请稍后重试')
      void refreshCurrent(true)
      return
    }
    const version = state.contextVersion
    const sequence = ++state.patchSequence
    state.refreshSequence += 1
    state.refreshPending = null
    state.savingSelection = { id, sequence }
    try {
      const data = await api(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          dshProvider: provider || '',
          dshModel: modelId || '',
          dshEffort: effortId || '',
        }),
      })
      if (!isCurrentContext(id, version) || sequence !== state.patchSequence) return
      if (data.conversation?.id !== id) throw new Error('对话设置暂未同步，请重新选择重试')
      state.conversation = data.conversation
      state.conversationAt = Date.now()
      if (!provider && !modelId) forget()
    } catch (error) {
      if (isCurrentContext(id, version) && sequence === state.patchSequence) {
        showMessage(error.message || '保存模型选择失败，请重试', 'error')
      }
    } finally {
      if (state.savingSelection?.sequence === sequence) state.savingSelection = null
      if (isCurrentContext(id, version)) render()
    }
  }

  /* ── controls ──────────────────────────────────────────────────────── */

  function pillButton(id, cls, title) {
    const button = document.createElement('button')
    button.type = 'button'
    button.id = id
    button.className = cls
    button.hidden = true
    button.setAttribute('aria-haspopup', 'dialog')
    button.setAttribute('aria-expanded', 'false')
    button.title = title
    button.innerHTML =
      '<span class="dshm-pill-dot" aria-hidden="true"></span>' +
      '<span class="dshm-pill-text">DSH 模型</span>' +
      '<svg aria-hidden="true"><use href="#i-chevron"></use></svg>'
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      togglePopover(button)
    })
    return button
  }

  function ensureControls() {
    const engineBar = $('#engineBar')
    if (engineBar && !$('#dshModelBarBtn')) {
      engineBar.appendChild(pillButton('dshModelBarBtn', 'dshm-pill dshm-inline', 'DSH 模型与思考强度'))
    }
    const composer = $('#composer')
    if (composer && !$('#dshModelFloatBtn')) {
      // Floating above the input box: absolutely positioned so the composer
      // keeps its exact height (the input never gets pushed around).
      composer.appendChild(pillButton('dshModelFloatBtn', 'dshm-pill dshm-float', 'DSH 模型与思考强度'))
    }
  }

  /** Keep the app chrome labels (sidebar chip / topbar) in sync with the
      picker without waiting for the next app.js render. app.js reads the
      same hook, so both writers converge on the same text. */
  function syncAppLabels() {
    const label = publicLabel()
    if (!label) return
    // Do not let a transient "not Codex yet" state write the DSH model into
    // the Codex topbar: once written, the old text-based fallback would keep
    // reporting DSH for the rest of the session. Only touch shared chrome
    // when the DSH context is proven by a loaded conversation or the engine
    // bar, never from the bare absence of Codex text.
    const conv = state.conversation
    const convIsCurrent = Boolean(conv && conv.id === currentConversationId())
    const cached = convIsCurrent ? null : cachedEngine(currentConversationId())
    const confidentDsr = convIsCurrent
      ? conv.engine !== 'codex'
      : cached
        ? cached === 'dsr'
        : engineBarShown() && !$('#engineCodex')?.classList.contains('active')
    if (!confidentDsr) return
    const modelName = $('#modelName')
    if (modelName && modelName.textContent !== label) modelName.textContent = label
    const topbarSub = $('#topbarSub')
    if (topbarSub && !/Codex/.test(topbarSub.textContent || '') && topbarSub.textContent !== label) {
      topbarSub.textContent = label
    }
  }

  function render() {
    syncCurrentContext()
    if (state.popover && !state.popover.isConnected) state.popover = null
    ensureControls()
    const dsr = dsrContext()
    if (!dsr && state.popover) closePopover()
    const engineBarVisible = engineBarShown()
    const inline = $('#dshModelBarBtn')
    const float = $('#dshModelFloatBtn')
    const current = selection()
    const label = current.model
      ? `${current.modelName}${current.effortName ? ` · ${current.effortName}` : ''}`
      : 'DSH 模型'
    const shortLabel = current.model ? current.modelName : 'DSH 模型'
    const hasCatalog = Boolean(state.catalog?.groups?.length)

    if (inline) {
      inline.hidden = !dsr || !engineBarVisible
      inline.querySelector('.dshm-pill-text').textContent = label
      inline.disabled = !hasCatalog
      inline.title = hasCatalog
        ? `DSH 模型：${label}${current.isDefault ? '（跟随桌面端默认）' : ''}`
        : '正在读取模型目录…'
    }
    if (float) {
      float.hidden = !dsr || engineBarVisible
      float.querySelector('.dshm-pill-text').textContent = shortLabel
      float.disabled = !hasCatalog
      float.title = hasCatalog
        ? `DSH 模型：${label}${current.isDefault ? '（跟随桌面端默认）' : ''}`
        : '正在读取模型目录…'
      // The back-to-bottom button floats in the same corner; slide left of it.
      const scrollBottom = $('#scrollBottom')
      float.classList.toggle('shift-left', Boolean(scrollBottom && !scrollBottom.hidden))
    }
    if (state.popover) renderPopover(state.popover.__anchor)
    if (dsr) syncAppLabels()
    if (dsr && !hasCatalog && !state.loading) void loadCatalog()
    else if (dsr && state.catalog?.source !== 'live' && !state.loading && Date.now() - state.catalogAttemptAt > 15_000) {
      // Bridge came online after the page did: upgrade to the live registry.
      void loadCatalog(true)
    }
  }

  /* ── popover ───────────────────────────────────────────────────────── */

  function togglePopover(anchor) {
    const id = syncCurrentContext()
    if (id && state.conversation?.id !== id) {
      void refreshCurrent(true).then(() => {
        if (currentConversationId() === id && state.conversation?.id === id) openPopover(anchor)
      })
      return
    }
    if (state.popover && !state.popover.isConnected) state.popover = null
    if (state.popover) {
      closePopover({ restoreFocus: true })
      return
    }
    if (!state.catalog?.groups?.length) {
      void loadCatalog(true)
      showMessage('正在读取模型目录…')
      return
    }
    // Keep the list aligned with the Desktop registry: upgrade the reduced
    // static list as soon as the bridge is reachable, and re-read a live
    // catalog that has gone stale (models can be added during the day).
    const age = Date.now() - Number(state.catalog.at || 0)
    if (state.catalog.source !== 'live' || age > 5 * 60_000) void loadCatalog(true)
    openPopover(anchor)
  }

  function modalFocusables(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]')]
      .filter(node => node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[inert]'))
  }

  function topModal() {
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .filter(node => node.getClientRects().length && !node.closest('[hidden]'))
    const layer = (node) => {
      let value = 0
      for (let current = node; current && current !== document.body; current = current.parentElement) {
        value = Math.max(value, Number.parseInt(getComputedStyle(current).zIndex, 10) || 0)
      }
      return value
    }
    return dialogs.sort((a, b) => layer(a) - layer(b)).at(-1) || null
  }

  function closePopover({ restoreFocus = false } = {}) {
    const pop = state.popover
    if (!pop) return
    const anchor = pop.__anchor
    pop.remove()
    state.popover = null
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('focusin', onModalFocus, true)
    window.removeEventListener('resize', onPopoverResize)
    for (const id of ['dshModelBarBtn', 'dshModelFloatBtn']) {
      $(`#${id}`)?.setAttribute('aria-expanded', 'false')
    }
    document.dispatchEvent(new CustomEvent('dsh:overlay-change'))
    if (!restoreFocus) return
    if (anchor?.isConnected && anchor.getClientRects().length && !anchor.closest('[inert]') && !anchor.disabled) {
      anchor.focus({ preventScroll: true })
    } else {
      const remaining = topModal()
      if (remaining) (modalFocusables(remaining)[0] || remaining).focus({ preventScroll: true })
    }
  }

  function onOutside(event) {
    const pop = state.popover
    if (!pop || topModal() !== pop || pop.contains(event.target)) return
    if (event.target.closest('#dshModelBarBtn,#dshModelFloatBtn')) return
    event.preventDefault()
    const stopClick = click => { click.preventDefault(); click.stopImmediatePropagation() }
    document.addEventListener('click', stopClick, { capture: true, once: true })
    setTimeout(() => document.removeEventListener('click', stopClick, true), 500)
    closePopover()
  }

  function onKey(event) {
    const pop = state.popover
    if (!pop || topModal() !== pop) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      closePopover({ restoreFocus: true })
    } else if (event.key === 'Tab') {
      const focusables = modalFocusables(pop)
      const at = focusables.indexOf(document.activeElement)
      const next = at < 0 ? (event.shiftKey ? focusables.length - 1 : 0)
        : (at + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length
      event.preventDefault()
      event.stopImmediatePropagation()
      ;(focusables[next] || pop).focus({ preventScroll: true })
    }
  }

  function onModalFocus(event) {
    const pop = state.popover
    if (!pop || topModal() !== pop || pop.contains(event.target)) return
    ;(pop.querySelector('.dshm-model-choice.is-active') || modalFocusables(pop)[0] || pop).focus({ preventScroll: true })
  }

  function onPopoverResize() {
    if (state.popover) positionPopover(state.popover, state.popover.__anchor)
  }

  function openPopover(anchor) {
    closePopover()
    state.query = ''
    const pop = el('div', 'dshm-pop')
    pop.setAttribute('role', 'dialog')
    pop.setAttribute('aria-modal', 'true')
    pop.setAttribute('aria-label', 'DSH 模型与思考强度')
    pop.tabIndex = -1
    pop.__anchor = anchor
    document.body.appendChild(pop)
    state.popover = pop
    renderPopover(anchor)
    anchor.setAttribute('aria-expanded', 'true')
    document.dispatchEvent(new CustomEvent('dsh:overlay-change'))
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onModalFocus, true)
    window.addEventListener('resize', onPopoverResize)
    requestAnimationFrame(() => {
      if (state.popover !== pop) return
      const target = pop.querySelector('.dshm-search')
        || pop.querySelector('.dshm-model-choice.is-active')
        || modalFocusables(pop)[0]
        || pop
      target.focus({ preventScroll: true })
    })
  }

  function renderPopover(anchor) {
    const pop = state.popover
    if (!pop) return
    const current = selection()
    const fingerprint = [
      current.provider || '',
      current.model || '',
      current.effort?.id || '',
      state.conversation?.id || '',
      state.conversation?.dshModelExplicit ? '1' : '',
      state.catalog?.groups?.length || 0,
      state.catalog?.source || '',
      state.query,
    ].join('|')
    if (pop.__fingerprint === fingerprint) {
      positionPopover(pop, anchor)
      return
    }
    pop.__fingerprint = fingerprint
    const active = document.activeElement
    const focusedKey = pop.contains(active) ? active.dataset.focusKey : null
    const caretStart = active?.matches?.('input') ? active.selectionStart : null
    const caretEnd = active?.matches?.('input') ? active.selectionEnd : null
    pop.replaceChildren()

    const head = el('div', 'dshm-pop-head')
    const title = el('div', 'dshm-pop-title', 'DSH 模型')
    const sub = el('div', 'dshm-pop-sub', '与桌面端同一份目录 · 下一条消息生效')
    const heading = el('div', 'dshm-pop-heading')
    heading.append(title, sub)
    const close = el('button', 'dshm-pop-close')
    close.type = 'button'
    close.setAttribute('aria-label', '关闭模型选择')
    close.title = '关闭（Esc）'
    close.dataset.focusKey = 'close'
    close.innerHTML = '<svg aria-hidden="true"><use href="#i-close"></use></svg>'
    close.addEventListener('click', () => closePopover({ restoreFocus: true }))
    head.append(heading, close)
    pop.appendChild(head)

    // Desktop parity: the picker starts with the same instant search box.
    const searchWrap = el('div', 'dshm-search-wrap')
    const search = el('input', 'dshm-search')
    search.type = 'search'
    search.placeholder = '搜索模型…'
    search.value = state.query
    search.dataset.focusKey = 'search'
    search.setAttribute('aria-label', '搜索模型')
    search.autocomplete = 'off'
    search.spellcheck = false
    search.addEventListener('input', () => {
      state.query = search.value
      renderPopover(pop.__anchor)
    })
    searchWrap.appendChild(search)
    pop.appendChild(searchWrap)

    const query = state.query.trim().toLowerCase()
    const matches = (group, item) => {
      if (!query) return true
      return [item.name, item.id, group.name, providerName(group.id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    }

    const modelSection = el('div', 'dshm-pop-section dshm-models')
    modelSection.appendChild(el('div', 'dshm-pop-label', '模型'))
    let shown = 0
    for (const group of sortedGroups()) {
      if (!group.models?.length) continue
      const models = group.models.filter((item) => matches(group, item))
      if (!models.length) continue
      shown += models.length
      const groupNode = el('div', 'dshm-provider-group')
      groupNode.appendChild(el('div', 'dshm-provider-name', providerName(group.id)))
      const modelList = el('div', 'dshm-model-list')
      for (const item of models) {
        const active = current.provider === group.id && current.model === item.id
        const choice = el('button', 'dshm-model-choice' + (active ? ' is-active' : ''))
        choice.type = 'button'
        choice.dataset.focusKey = `model:${group.id}:${item.id}`
        choice.setAttribute('aria-pressed', String(active))
        choice.title = item.description || item.name || item.id
        const top = el('span', 'dshm-model-top')
        top.appendChild(el('span', 'dshm-model-name', item.name || item.id))
        if (isCatalogDefault(group.id, item.id)) top.appendChild(el('span', 'dshm-model-tag', '默认'))
        choice.appendChild(top)
        choice.addEventListener('click', () => {
          const efforts = Array.isArray(item.reasoning?.efforts) ? item.reasoning.efforts : []
          const keep = efforts.some((effort) => effort.id === current.effort?.id)
          const nextEffort = keep ? current.effort.id : item.reasoning?.defaultEffort || efforts[0]?.id || ''
          void patchSelection(group.id, item.id, nextEffort)
        })
        modelList.appendChild(choice)
      }
      groupNode.appendChild(modelList)
      modelSection.appendChild(groupNode)
    }
    if (!shown) modelSection.appendChild(el('div', 'dshm-empty', query ? '没有匹配的模型' : '模型目录为空'))
    for (const failure of state.catalog?.failures || []) {
      modelSection.appendChild(el('div', 'dshm-provider-failure', `${failure.name || failure.id}：${failure.message || '不可用'}`))
    }
    pop.appendChild(modelSection)

    const efforts = effortsOf(current.entry)
    if (efforts.length) {
      const effortSection = el('div', 'dshm-pop-section')
      const effortHead = el('div', 'dshm-pop-label-row')
      effortHead.appendChild(el('div', 'dshm-pop-label', '思考强度'))
      effortHead.appendChild(el('div', 'dshm-pop-label-hint', `当前 ${current.modelName}`))
      effortSection.appendChild(effortHead)
      const effortGrid = el('div', 'dshm-effort-grid')
      for (const option of efforts) {
        const active = current.effort?.id === option.id
        const choice = el('button', 'dshm-effort-choice' + (active ? ' is-active' : ''))
        choice.type = 'button'
        choice.dataset.focusKey = `effort:${option.id}`
        choice.setAttribute('aria-pressed', String(active))
        choice.appendChild(el('span', 'dshm-effort-name', option.name || option.id))
        if (option.description) choice.appendChild(el('span', 'dshm-effort-desc', option.description))
        choice.title = option.description || option.name || option.id
        choice.addEventListener('click', () => {
          void patchSelection(current.provider, current.model, option.id)
        })
        effortGrid.appendChild(choice)
      }
      effortSection.appendChild(effortGrid)
      pop.appendChild(effortSection)
    }

    const foot = el('div', 'dshm-pop-foot')
    const follow = el('button', 'dshm-pop-follow')
    follow.type = 'button'
    follow.dataset.focusKey = 'follow-default'
    follow.innerHTML = '<svg aria-hidden="true"><use href="#i-refresh"></use></svg><span>跟随桌面端默认</span>'
    follow.disabled = !current.explicit
    follow.title = current.explicit
      ? '清除本对话的固定选择，回到桌面端默认模型'
      : '当前已跟随桌面端默认模型'
    follow.addEventListener('click', () => void patchSelection('', '', ''))
    foot.appendChild(follow)
    const source = el(
      'span',
      'dshm-pop-source',
      state.catalog?.source === 'live' ? '目录来自桌面 Harness' : '目录来自桌面配置缓存',
    )
    foot.appendChild(source)
    pop.appendChild(foot)

    positionPopover(pop, anchor)
    if (focusedKey) {
      const nextFocus = [...pop.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focusedKey && !node.disabled)
      const target = nextFocus || pop.querySelector('.dshm-model-choice.is-active') || close
      target.focus({ preventScroll: true })
      if (target.matches('input') && typeof target.setSelectionRange === 'function') {
        try {
          // Re-render rebuilds the input; put the caret back where it was so
          // mid-string edits do not jump to the end.
          const end = caretEnd ?? target.value.length
          target.setSelectionRange(Math.min(caretStart ?? end, target.value.length), Math.min(end, target.value.length))
        } catch {}
      }
    }
  }

  function positionPopover(pop, anchor) {
    const sheet = window.innerWidth < 641
    pop.classList.toggle('is-sheet', sheet)
    for (const property of ['left', 'top', 'right', 'bottom']) pop.style.removeProperty(property)
    if (sheet || !anchor?.isConnected) return
    const rect = anchor.getBoundingClientRect()
    const width = pop.offsetWidth || 360
    const height = pop.offsetHeight || 420
    let left = Math.min(rect.right - width, window.innerWidth - width - 12)
    left = Math.max(12, left)
    let top = rect.top - height - 10
    if (top < 12) top = Math.min(window.innerHeight - height - 12, rect.bottom + 10)
    pop.style.left = `${left}px`
    pop.style.top = `${Math.max(12, top)}px`
  }

  /* ── keep the chat request in sync ────────────────────────────────── */

  // Loaded after codex.js, so this wraps its wrapper: both creations get
  // their engine-specific fields injected.
  const previousFetch = window.fetch.bind(window)
  window.fetch = function dshModelsFetch(input, init) {
    let mutated = init
    try {
      const rawUrl = typeof input === 'string' ? input : input?.url
      const url = new URL(rawUrl || '', location.href)
      const method = String(init?.method || input?.method || 'GET').toUpperCase()
      if (method === 'POST' && url.pathname === '/api/conversations' && init?.body) {
        const body = JSON.parse(init.body)
        if (body.engine !== 'codex') {
          const pick = storedPick()
          if (pick) {
            body.dshProvider = pick.provider
            body.dshModel = pick.model
            body.dshEffort = pick.effort || ''
            mutated = { ...init, body: JSON.stringify(body) }
          }
        }
      }
    } catch {}
    const result = previousFetch(input, mutated)
    try {
      const rawUrl = typeof input === 'string' ? input : input?.url
      const url = new URL(rawUrl || '', location.href)
      if (/\/api\/conversations\/[^/]+\/chat$/.test(url.pathname)) {
        setTimeout(() => void refreshCurrent(true), 1800)
        setTimeout(() => void refreshCurrent(true), 6000)
      }
    } catch {}
    return result
  }

  /* ── lifecycle ─────────────────────────────────────────────────────── */

  function watchDom() {
    let timer = null
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (dsrContext()) void refreshCurrent()
        render()
      }, 100)
    }
    for (const target of [$('#engineBar'), $('#modeBadge'), $('#thread'), $('#topbarSub'), $('#emptyState'), $('#scrollBottom')]) {
      if (!target) continue
      new MutationObserver(schedule).observe(target, {
        childList: true,
        attributes: true,
        attributeFilter: ['hidden', 'class'],
      })
    }
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
          if (dsrContext()) void refreshCurrent(true)
          render()
        }, 220)
      }
      if (event.target.closest('#sendBtn,#composer')) {
        setTimeout(() => void refreshCurrent(true), 2200)
      }
    })
    window.addEventListener('popstate', () => void refreshCurrent(true))
    // Idle polling was one summary request every 4 s per module. The metadata
    // only changes when a turn finishes or the model changes — both of which
    // already trigger a refresh — so slow the safety net down and skip it in a
    // background tab.
    setInterval(() => {
      if (document.hidden) return
      if (dsrContext()) void refreshCurrent()
      render()
    }, 15000)
  }

  function ensureStyles() {
    if (document.querySelector('link[data-dsh-models-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/css/dsh-models.css?v=2'
    link.dataset.dshModelsCss = '1'
    document.head.appendChild(link)
  }


  // Never call an authenticated endpoint before the shell is on screen: the
  // login page used to fire /api/*/models and log two 401s every load.
  function whenAuthed(run, attempt = 0) {
    const shell = document.getElementById('shell')
    if (shell && !shell.hidden) {
      run()
      return
    }
    if (attempt >= 30) return
    setTimeout(() => whenAuthed(run, attempt + 1), 200)
  }

  function init() {
    ensureStyles()
    ensureControls()
    // Label hook for app.js (sidebar chip / topbar / conversation details).
    try {
      Object.defineProperty(window, '__dshChatModelLabel', {
        configurable: true,
        enumerable: false,
        get: () => publicLabel,
      })
    } catch {
      window.__dshChatModelLabel = publicLabel
    }
    render()
    watchDom()
    whenAuthed(() => {
      void loadCatalog()
      void refreshCurrent(true)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
