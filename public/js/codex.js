/* DSH Chat · Codex controls
   Adds native-Codex model / reasoning-effort selection, a one-click "open in
   Codex Desktop" action, and keeps the bridge selection in sync with the
   conversation. This file is intentionally self-contained so the main client
   stays focused on rendering the chat. */
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
    contextVersion: 0,
    refreshSequence: 0,
    refreshPending: null,
    patchSequence: 0,
    savingSelection: null,
    openingId: null,
    createSequence: 0,
    popover: null,
    toastTimer: null,
    loading: false,
    catalogRetry: 0,
    catalogAttemptAt: 0,
  }

  function readCachedCatalog() {
    try {
      const raw = JSON.parse(storage.getItem(CATALOG_KEY) || 'null')
      if (!raw || !Array.isArray(raw.models) || !raw.models.length) return null
      if (Date.now() - Number(raw.at || 0) > CATALOG_TTL) return null
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
    const convIsCurrent = conversation && conversation.id === currentConversationId()
    const storedModel = storage.getItem(MODEL_KEY)
    const storedEffort = storage.getItem(EFFORT_KEY)
    const modelId = (convIsCurrent && conversation.codexModel) || storedModel
    const model = modelById(modelId)
    if (!model) return { model: null, effort: null }
    let effortValue = (convIsCurrent && conversation.codexEffort) || storedEffort
    if (!effortOf(model, effortValue)) effortValue = model.defaultEffort || model.efforts?.[0]?.value || 'medium'
    return { model, effort: effortOf(model, effortValue) }
  }

  function remember(modelId, effortValue) {
    try {
      if (modelId) storage.setItem(MODEL_KEY, modelId)
      if (effortValue) storage.setItem(EFFORT_KEY, effortValue)
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

  function authedNow() {
    const shell = document.getElementById('shell')
    return Boolean(shell && !shell.hidden)
  }

  async function loadCatalog(force = false) {
    if (!authedNow()) return
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
        if (data.conversation?.id !== id) throw new Error('对话设置暂未同步，请重新打开设置重试')
        state.conversation = data.conversation
        state.conversationAt = Date.now()
      } catch (error) {
        if (!isCurrentContext(id, version) || sequence !== state.refreshSequence) return
        // Keep an already loaded selection when a transient refresh fails.
        if (force) showMessage(error.message || '读取设置失败，请重新打开设置重试', 'error')
      } finally {
        if (state.refreshPending === pending) state.refreshPending = null
        if (isCurrentContext(id, version)) render()
      }
    })()
    state.refreshPending = pending
    return pending.promise
  }

  async function patchSelection(modelId, effortValue) {
    const id = syncCurrentContext()
    if (!id) {
      remember(modelId, effortValue)
      render()
      return
    }
    if (state.conversation?.id !== id || state.conversation.engine !== 'codex') {
      showMessage('正在读取这个对话的设置，请稍后重试')
      void refreshCurrent(true)
      return
    }
    remember(modelId, effortValue)
    const version = state.contextVersion
    const sequence = ++state.patchSequence
    state.refreshSequence += 1
    state.refreshPending = null
    state.savingSelection = { id, sequence }
    try {
      const data = await api(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ codexModel: modelId, codexEffort: effortValue }),
      })
      if (!isCurrentContext(id, version) || sequence !== state.patchSequence) return
      if (data.conversation?.id !== id) throw new Error('对话设置暂未同步，请重新选择重试')
      state.conversation = data.conversation
      state.conversationAt = Date.now()
    } catch (error) {
      if (isCurrentContext(id, version) && sequence === state.patchSequence) {
        showMessage(error.message || '保存 Codex 设置失败，请重新选择重试', 'error')
      }
    } finally {
      if (state.savingSelection?.sequence === sequence) state.savingSelection = null
      if (isCurrentContext(id, version)) render()
    }
  }

  /* ── controls ─────────────────────────────────────────────────────── */

  /** Shared strip immediately above the composer (the DSH module reuses it). */
  function ensureModelBar() {
    let bar = $('#modelBar')
    if (bar) return bar
    const composer = $('#composer')
    const parent = composer?.parentElement
    if (!parent) return null
    bar = el('div', 'model-bar')
    bar.id = 'modelBar'
    bar.hidden = true
    parent.insertBefore(bar, composer)
    return bar
  }

  /** Hide the strip when neither engine has a pill, so it never reserves an
      empty row above the input. */
  function syncModelBarVisibility() {
    const bar = $('#modelBar')
    if (!bar) return
    bar.hidden = ![...bar.querySelectorAll('.dshm-pill, .codex-pill')].some((pill) => !pill.hidden)
  }

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

    const modelBar = ensureModelBar()
    if (modelBar && !$('#codexFootBtn')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = 'codexFootBtn'
      button.className = 'codex-pill codex-bar'
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
      modelBar.appendChild(button)
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
    syncCurrentContext()
    if (state.popover && !state.popover.isConnected) state.popover = null
    ensureControls()
    const codex = codexContext()
    if (!codex && state.popover) closePopover()
    // 320px CSS hides the engine bar while leaving `hidden` false; using
    // layout keeps the above-input pill available there instead of parking
    // the control inside an invisible row.
    const engineBar = $('#engineBar')
    const engineBarVisible = Boolean(engineBar && !engineBar.hidden && engineBar.getClientRects().length)
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
    syncModelBarVisibility()
    const engineHint = $('#engineHint')
    if (engineHint && codex && model && engineBarVisible) {
      engineHint.textContent = `${model.name} · ${effort?.label || ''}`
    }
    if (state.popover) renderPopover(state.popover.__anchor)
    if (codex && !state.catalog?.models?.length && !state.loading) void loadCatalog()
  }

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
    if (!state.catalog?.models?.length) {
      void loadCatalog(true)
      showMessage('正在读取 Codex 模型…')
      return
    }
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
    window.DSHMotion?.exitOverlay(pop)
    pop.remove()
    state.popover = null
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('focusin', onModalFocus, true)
    window.removeEventListener('resize', onPopoverResize)
    for (const id of ['codexSettingsBtn', 'codexFootBtn']) {
      $(`#${id}`)?.setAttribute('aria-expanded', 'false')
    }
    // The application derives inert from all visible overlays, including this one.
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
    if (event.target.closest('#codexSettingsBtn,#codexFootBtn')) return
    // Suppress the matching click as well: removing inert must not activate a
    // previously obscured control during the same pointer gesture.
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
    ;(pop.querySelector('.codex-model-choice.is-active') || modalFocusables(pop)[0] || pop).focus({ preventScroll: true })
  }

  function onPopoverResize() {
    if (state.popover) positionPopover(state.popover, state.popover.__anchor)
  }

  function openPopover(anchor) {
    closePopover()
    const pop = el('div', 'codex-pop')
    pop.setAttribute('role', 'dialog')
    pop.setAttribute('aria-modal', 'true')
    pop.setAttribute('aria-label', 'Codex 模型与思考强度')
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
      if (state.popover === pop) (pop.querySelector('.codex-model-choice.is-active') || modalFocusables(pop)[0] || pop).focus({ preventScroll: true })
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
    const focusedKey = pop.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null
    pop.replaceChildren()

    const head = el('div', 'codex-pop-head')
    const title = el('div', 'codex-pop-title', 'Codex 运行设置')
    const sub = el('div', 'codex-pop-sub', '模型与思考强度会在下一条消息生效')
    const heading = el('div', 'codex-pop-heading')
    heading.append(title, sub)
    const close = el('button', 'codex-pop-close')
    close.type = 'button'
    close.setAttribute('aria-label', '关闭 Codex 设置')
    close.title = '关闭（Esc）'
    close.dataset.focusKey = 'close'
    close.innerHTML = '<svg aria-hidden="true"><use href="#i-close"></use></svg>'
    close.addEventListener('click', () => closePopover({ restoreFocus: true }))
    head.append(heading, close)
    pop.appendChild(head)

    const modelSection = el('div', 'codex-pop-section')
    modelSection.appendChild(el('div', 'codex-pop-label', '模型'))
    const modelList = el('div', 'codex-model-list')
    for (const item of state.catalog.models) {
      const active = model?.id === item.id
      const choice = el('button', 'codex-model-choice' + (active ? ' is-active' : ''))
      choice.type = 'button'
      choice.dataset.focusKey = `model:${item.id}`
      choice.setAttribute('aria-pressed', String(active))
      const top = el('span', 'codex-model-top')
      top.appendChild(el('span', 'codex-model-name', item.name))
      if (item.default) top.appendChild(el('span', 'codex-model-tag', '默认'))
      choice.appendChild(top)
      if (item.description) choice.appendChild(el('span', 'codex-model-desc', item.description))
      choice.addEventListener('click', () => {
        const nextEffort = effortOf(item, effort?.value) ? effort.value : item.defaultEffort
        void patchSelection(item.id, nextEffort)
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
      choice.dataset.focusKey = `effort:${option.value}`
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
    open.dataset.focusKey = 'open'
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
    if (focusedKey) {
      const nextFocus = [...pop.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focusedKey && !node.disabled)
      ;(nextFocus || pop.querySelector('.codex-model-choice.is-active') || close).focus({ preventScroll: true })
    }
  }

  function positionPopover(pop, anchor) {
    const sheet = window.innerWidth < 641
    pop.classList.toggle('is-sheet', sheet)
    for (const property of ['left', 'top', 'right', 'bottom']) pop.style.removeProperty(property)
    if (sheet) return
    const rect = anchor.getBoundingClientRect()
    // The Codex pill sits above the composer; anchor the panel above the whole
    // input box so its bottom edge cannot cover the textarea.
    const composer = anchor.closest('.composer') || $('#composer')
    const composerRect = composer?.getBoundingClientRect() || null
    const anchorTop = composerRect ? Math.min(rect.top, composerRect.top) : rect.top
    const width = pop.offsetWidth || 360
    const height = pop.offsetHeight || 420
    let left = Math.min(rect.left, window.innerWidth - width - 12)
    left = Math.max(12, left)
    let top = anchorTop - height - 10
    if (top < 12) {
      const below = composerRect ? composerRect.bottom + 10 : rect.bottom + 10
      top = Math.min(window.innerHeight - height - 12, below)
    }
    pop.style.left = `${left}px`
    pop.style.top = `${Math.max(12, top)}px`
  }

  async function openInCodex(fromPopover = false) {
    const id = syncCurrentContext()
    if (!id || state.openingId === id) return
    const version = state.contextVersion
    state.openingId = id
    try {
      let conv = state.conversation?.id === id ? state.conversation : null
      if (!conv?.codexThreadId) {
        const data = await api(`/api/conversations/${encodeURIComponent(id)}`)
        if (!isCurrentContext(id, version)) return
        conv = data.conversation
        if (conv?.id !== id) return
        state.conversation = conv
      }
      if (!isCurrentContext(id, version)) return
      if (!conv?.codexThreadId) {
        showMessage('先发送一条消息，Codex 会话创建后即可打开')
        return
      }
      await api(`/api/conversations/${encodeURIComponent(id)}/open-codex`, { method: 'POST' })
      if (!isCurrentContext(id, version)) return
      showMessage('已在 Codex 桌面端打开')
      if (fromPopover) closePopover()
    } catch (error) {
      if (isCurrentContext(id, version)) showMessage(error.message || '打开 Codex 失败', 'error')
    } finally {
      if (state.openingId === id) state.openingId = null
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
        const sequence = ++state.createSequence
        result.then((response) => {
          response
            .clone()
            .json()
            .then((data) => {
              if (!response.ok || !data?.conversation || sequence !== state.createSequence) return
              // Creation is committed by the main router. It may have been
              // abandoned while the response was in flight; never select it here.
              if (currentConversationId() === data.conversation.id) void refreshCurrent(true)
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
    window.addEventListener('popstate', () => void refreshCurrent(true))
    // Idle polling was one summary request every 4 s per module. The metadata
    // only changes when a turn finishes or the model changes — both of which
    // already trigger a refresh — so slow the safety net down and skip it in a
    // background tab.
    setInterval(() => {
      if (document.hidden) return
      if (codexContext()) void refreshCurrent()
      render()
    }, 15000)
  }

  function ensureStyles() {
    if (document.querySelector('link[data-codex-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/css/codex.css?v=5'
    link.dataset.codexCss = '1'
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
