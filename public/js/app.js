/* DSH Chat client — dependency-free, streaming over NDJSON. */
(function () {
  'use strict'

  const $ = (sel, root = document) => root.querySelector(sel)
  const icon = (id, cls = '') =>
    `<svg class="${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`

  const BOOKMARK_KEY = 'dsh.bookmarks.v1'
  const PROMPT_KEY = 'dsh.prompts.v1'
  const PREFS_KEY = 'dsh.prefs.v1'
  const PROMPT_DEFAULTS = [
    { id: 'p-weekly', name: '周报', text: '请把今天的工作整理成周报：本周完成 / 进行中 / 风险 / 下周计划。语气克制，先结论后细节。' },
    { id: 'p-review', name: '代码审查', text: '请审查这段代码：正确性、边界条件、性能、安全、可维护性。按严重程度排序，给出具体改法。' },
    { id: 'p-meeting', name: '会议纪要', text: '请把下面的会议内容整理成纪要：结论、待办（负责人/截止时间）、未决问题。不要编造。' },
  ]

  const els = {
    loginView: $('#loginView'),
    loginForm: $('#loginForm'),
    loginBtn: $('#loginBtn'),
    loginError: $('#loginError'),
    accessCode: $('#accessCode'),
    shell: $('#shell'),
    sidebar: $('#sidebar'),
    sidebarClose: $('#sidebarClose'),
    scrim: $('#scrim'),
    menuBtn: $('#menuBtn'),
    newChat: $('#newChat'),
    newChatTop: $('#newChatTop'),
    convList: $('#convList'),
    convEmpty: $('#convEmpty'),
    convLabel: $('#convLabel'),
    modelName: $('#modelName'),
    logoutBtn: $('#logoutBtn'),
    themeBtn: $('#themeBtn'),
    shortcutsBtn: $('#shortcutsBtn'),
    topbarName: $('#topbarName'),
    topbarSub: $('#topbarSub'),
    chatInfoBtn: $('#chatInfoBtn'),
    chatInfo: $('#chatInfo'),
    chatInfoClose: $('#chatInfoClose'),
    chatInfoFullTitle: $('#chatInfoFullTitle'),
    chatInfoEngine: $('#chatInfoEngine'),
    chatInfoModel: $('#chatInfoModel'),
    chatInfoMode: $('#chatInfoMode'),
    chatInfoPermission: $('#chatInfoPermission'),
    statusBtn: $('#statusBtn'),
    connectionDetail: $('#connectionDetail'),
    detailConnection: $('#detailConnection'),
    detailEngine: $('#detailEngine'),
    detailModel: $('#detailModel'),
    engineInfoBtn: $('#engineInfoBtn'),
    engineInfo: $('#engineInfo'),
    convHeading: $('#convHeading'),
    notifyState: $('#notifyState'),
    scrollArea: $('#scrollArea'),
    emptyState: $('#emptyState'),
    scenarioGrid: $('#scenarioGrid'),
    scenarioSheet: $('#scenarioSheet'),
    scenarioList: $('#scenarioList'),
    thread: $('#thread'),
    composer: $('#composer'),
    input: $('#input'),
    sendBtn: $('#sendBtn'),
    toast: $('#toast'),
    confirmModal: $('#confirmModal'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk'),
    confirmTitle: $('#confirmTitle'),
    confirmBody: $('#confirmBody'),
    filesBar: $('#filesBar'),
    filesBtn: $('#filesBtn'),
    filesCount: $('#filesCount'),
    filesSheet: $('#filesSheet'),
    filesList: $('#filesList'),
    filesSheetCount: $('#filesSheetCount'),
    filePreview: $('#filePreview'),
    filePreviewTitle: $('#filePreviewTitle'),
    filePreviewMeta: $('#filePreviewMeta'),
    filePreviewIcon: $('#filePreviewIcon'),
    filePreviewBody: $('#filePreviewBody'),
    filePreviewOpen: $('#filePreviewOpen'),
    filePreviewDownload: $('#filePreviewDownload'),
    palette: $('#palette'),
    paletteInput: $('#paletteInput'),
    paletteResults: $('#paletteResults'),
    questionSlot: $('#questionSlot'),
    permissionInline: $('#permissionInline'),
    uploadBtn: $('#uploadBtn'),
    scenarioBtn: $('#scenarioBtn'),
    fileInput: $('#fileInput'),
    scrollBottom: $('#scrollBottom'),
    convSearch: $('#convSearch'),
    modeBadge: $('#modeBadge'),
    sharedBadge: $('#sharedBadge'),
    reconnectBar: $('#reconnectBar'),
    reconnectText: $('#reconnectText'),
    reconnectRetry: $('#reconnectRetry'),
    shortcutsBtn: $('#shortcutsBtn'),
    shortcutsList: $('#shortcutsList'),
    renameModal: $('#renameModal'),
    renameForm: $('#renameForm'),
    renameInput: $('#renameInput'),
    renameError: $('#renameError'),
    renameCancel: $('#renameCancel'),
    renameSave: $('#renameSave'),
    heroStart: $('#heroStart'),
    heroScenarios: $('#heroScenarios'),
    heroStatus: $('#heroStatus'),
    heroDot: $('#heroDot'),
    engineBar: $('#engineBar'),
    engineDsr: $('#engineDsr'),
    engineCodex: $('#engineCodex'),
    engineHint: $('#engineHint'),
    emptyHintText: $('#emptyHintText'),
    permissionBtn: $('#permissionBtn'),
    permissionLabel: $('#permissionLabel'),
    permissionMenu: $('#permissionMenu'),
    convSearchClear: $('#convSearchClear'),
    convResultCount: $('#convResultCount'),
    convLoadMore: $('#convLoadMore'),
    attachmentTray: $('#attachmentTray'),
    commandMenu: $('#commandMenu'),
    charCount: $('#charCount'),
    composerHint: $('#composerHint'),
    shortcutsSheet: $('#shortcutsSheet'),
    dropOverlay: $('#dropOverlay'),
    manageBtn: $('#manageBtn'),
    archiveBtn: $('#archiveBtn'),
    batchBar: $('#batchBar'),
    batchCount: $('#batchCount'),
    batchArchive: $('#batchArchive'),
    batchDelete: $('#batchDelete'),
    batchCancel: $('#batchCancel'),
    findBar: $('#findBar'),
    findInput: $('#findInput'),
    findCount: $('#findCount'),
    findPrev: $('#findPrev'),
    findNext: $('#findNext'),
    findClose: $('#findClose'),
    quickSwitcher: $('#quickSwitcher'),
    quickClose: $('#quickClose'),
    quickInput: $('#quickInput'),
    quickList: $('#quickList'),
    statsModal: $('#statsModal'),
    statsList: $('#statsList'),
    statsClose: $('#statsClose'),
    settingsSheet: $('#settingsSheet'),
    settingsBtn: $('#settingsBtn'),
    notifyToggle: $('#notifyToggle'),
    memoryBtn: $('#memoryBtn'),
    memorySheet: $('#memorySheet'),
    memoryCountBadge: $('#memoryCountBadge'),
    memoryCount: $('#memoryCount'),
    memoryList: $('#memoryList'),
    memoryEmpty: $('#memoryEmpty'),
    memoryForm: $('#memoryForm'),
    memoryInput: $('#memoryInput'),
    memoryAdd: $('#memoryAdd'),
    memoryError: $('#memoryError'),
    memoryEnabledToggle: $('#memoryEnabledToggle'),
    memoryEnabledState: $('#memoryEnabledState'),
    memoryEnabledDesc: $('#memoryEnabledDesc'),
    memoryAutoToggle: $('#memoryAutoToggle'),
    memoryAutoState: $('#memoryAutoState'),
    memoryExtract: $('#memoryExtract'),
    memoryClear: $('#memoryClear'),
    memoryToggle: $('#memoryToggle'),
    memoryState: $('#memoryState'),
    memoryManageBtn: $('#memoryManageBtn'),
    backupBtn: $('#backupBtn'),
    archiveSheet: $('#archiveSheet'),
    archiveList: $('#archiveList'),
    bookmarksBtn: $('#bookmarksBtn'),
    promptsBtn: $('#promptsBtn'),
    bookmarksSheet: $('#bookmarksSheet'),
    bookmarksList: $('#bookmarksList'),
    promptSheet: $('#promptSheet'),
    promptList: $('#promptList'),
    promptForm: $('#promptForm'),
    promptName: $('#promptName'),
    promptText: $('#promptText'),
    readProgress: $('#readProgress'),
    filesUploadBtn: $('#filesUploadBtn'),
    importBtn: $('#importBtn'),
    backupInput: $('#backupInput'),
    markAllReadBtn: $('#markAllReadBtn'),
    storageInfo: $('#storageInfo'),
  }

  const state = {
    authRequired: false,
    model: 'DeepSeek Harness',
    native: false,
    nativeEnabled: true,
    conversations: [],
    search: '',
    currentId: null,
    navigationRequest: 0,
    messages: [],
    streaming: null,
    files: [],
    filePaths: new Set(),
    questions: new Map(),
    approvals: new Map(),
    liveViews: new Map(),
    stick: true,
    theme: localStorage.getItem('dsh.theme') || 'auto',
    confirmAction: null,
    toastTimer: null,
    approvalNoticeTimer: null,
    lastFocus: null,
    lastFilesFocus: null,
    lastScenarioFocus: null,
    authed: false,
    connection: 'online',
    initRetryTimer: null,
    refreshRetryTimer: null,
    attachRetryTimer: null,
    resuming: false,
    engine: localStorage.getItem('dsh.engine') === 'codex' ? 'codex' : 'dsr',
    currentEngine: 'dsr',
    codexAvailable: false,
    permission: 'workspace-write',
    permissionCatalog: null,
    resolvedRequests: loadResolvedMap(),
    permissionMenuFocus: null,
    searchTimer: null,
    searchTotal: 0,
    searchHasMore: false,
    searchOffset: 0,
    searchResults: [],
    convHasMore: false,
    convTotal: 0,
    convMenuEl: null,
    renamingId: null,
    draftTimer: null,
    stagedFiles: [],
    stagedSeq: 0,
    sending: false,
    pendingSend: null,
    unread: false,
    lastSync: Date.now(),
    appHeight: 0,
    baseTitle: 'DSH Chat',
    prefs: loadPrefs(),
    findHits: [],
    findResults: [],
    findIndex: -1,
    findQuery: '',
    selectMode: false,
    selected: new Set(),
    quickItems: [],
    quickIndex: 0,
    archived: [],
    routing: false,
    autoRetryTimer: null,
    lastQuickFocus: null,
    lastStatsFocus: null,
    lastSettingsFocus: null,
    lastMemoryFocus: null,
    lastArchiveFocus: null,
    lastBookmarksFocus: null,
    lastPromptsFocus: null,
    bookmarks: loadBookmarks(),
    prompts: loadPrompts(),
    memory: { enabled: true, autoCapture: true, count: 0, items: [], loaded: false, loading: false },
    threadWindow: 60,
    threadEnd: null,
    commandIndex: 0,
    commandItems: [],
    shortcutsFocus: null,
    renameId: null,
    dragDepth: 0,
    previewFile: null,
    previewFocus: null,
    paletteFocus: null,
    paletteIndex: 0,
    paletteItems: [],
    hasPhysicalKeyboard: false,
    lastRenderedQuery: '',
  }

  function lockShell() {
    // Derive the lock from visible layers: repeated opens cannot leak a lock,
    // and dismissing a child still leaves its parent modal isolated.
    const layers = [els.filesSheet, els.scenarioSheet, els.filePreview,
      els.statsModal, els.confirmModal, els.palette, els.shortcutsSheet,
      els.renameModal, els.settingsSheet, els.bookmarksSheet, els.promptSheet,
      els.archiveSheet, els.quickSwitcher]
    const codexModal = document.querySelector('.codex-pop[aria-modal="true"]')
    if (els.shell) els.shell.inert = layers.some((layer) => layer && !layer.hidden) || Boolean(codexModal)
  }

  document.addEventListener('dsh:overlay-change', lockShell)

  const TOOL_META = {
    bash: { label: '运行命令', icon: 'i-terminal' },
    bash_persistent: { label: '运行命令', icon: 'i-terminal' },
    terminal: { label: '使用终端', icon: 'i-terminal' },
    write: { label: '写入文件', icon: 'i-file' },
    read: { label: '读取文件', icon: 'i-file' },
    edit: { label: '编辑文件', icon: 'i-file' },
    str_replace_editor: { label: '编辑文件', icon: 'i-file' },
    glob: { label: '查找文件', icon: 'i-search' },
    grep: { label: '搜索内容', icon: 'i-search' },
    web_search: { label: '联网搜索', icon: 'i-globe' },
    web_fetch: { label: '读取网页', icon: 'i-globe' },
    present: { label: '生成文件', icon: 'i-file' },
    todo_write: { label: '更新任务清单', icon: 'i-check' },
    ask_user_question: { label: '向你提问', icon: 'i-spark' },
    skill: { label: '加载技能', icon: 'i-spark' },
    task: { label: '子任务', icon: 'i-spark' },
    workflow: { label: '编排工作流', icon: 'i-spark' },
  }

  const PERMISSION_META = {
    'read-only': {
      label: '只读',
      short: '只读',
      description: 'Agent 可以读取和搜索，但不能写入文件或执行修改。',
      tone: 'safe',
    },
    'workspace-write': {
      label: '标准',
      short: '标准',
      description: '仅允许在工作区内写入；敏感操作会先征求你的同意。',
      tone: 'standard',
    },
    'danger-full-access': {
      label: '完全权限',
      short: '完全权限',
      description: '不受工作区限制，不再弹出授权确认，Agent 可直接执行任意操作。',
      tone: 'danger',
    },
    auto: {
      label: '自动审查',
      short: '自动',
      description: '实验能力：每次工具调用先由模型审查，被拒绝时再询问你。',
      tone: 'auto',
      badge: 'EXP',
    },
  }

  const PERMISSION_FALLBACK = [
    { value: 'read-only', name: '只读', description: PERMISSION_META['read-only'].description },
    { value: 'workspace-write', name: '标准', description: PERMISSION_META['workspace-write'].description },
    {
      value: 'danger-full-access',
      name: '完全权限',
      description: PERMISSION_META['danger-full-access'].description,
    },
  ]

  const RESOLVED_KEY = 'dsh.resolved.v1'

  const SCENARIOS = [
    {
      id: 'web',
      title: '网页总结',
      desc: '提炼 TL;DR、要点与来源',
      need: '网页链接',
      icon: 'i-globe',
      template:
        '请总结这个网页的核心内容：{{粘贴网址}}\n\n要求：先给出一句话 TL;DR，再列 3–5 个要点，最后给出 1–2 个值得继续追问的问题。请注明来源链接。',
    },
    {
      id: 'stock',
      title: '股票分析',
      desc: '走势、估值与风险（非建议）',
      need: '股票名称或代码',
      icon: 'i-chart',
      template:
        '请分析这只股票：{{股票名称或代码}}\n\n要求：覆盖近期走势、关键财务/估值、主要风险和需要关注的事件；标注数据来源和时间；不要给出投资建议，并明确说明数据可能滞后。',
    },
    {
      id: 'computer',
      title: '操作电脑',
      desc: '让 Agent 执行桌面任务',
      need: '想完成的任务',
      icon: 'i-monitor',
      template:
        '帮我操作电脑完成：{{描述任务}}\n\n请先列出你准备执行的步骤，再开始；涉及删除、覆盖、支付或权限变更时，必须先问我确认。',
    },
    {
      id: 'content',
      title: '分析内容',
      desc: '观点、证据、偏见与建议',
      need: '文本或文件',
      icon: 'i-file',
      template:
        '请分析以下内容：{{粘贴文本，或先上传文件再写文件名}}\n\n输出：核心观点、关键证据、潜在偏见/遗漏、可执行建议。不要编造引用；内容不足时请直接说明。',
    },
    {
      id: 'daily',
      title: '日报整理',
      desc: '完成、进行中、风险、明日',
      need: '工作记录',
      icon: 'i-calendar',
      template:
        '请把今天的工作整理成日报：\n{{粘贴工作记录，或让我读取工作区里的笔记}}\n\n输出格式：今日完成 / 进行中 / 风险与阻塞 / 明日计划。日期使用 Asia/Shanghai。',
    },
  ]

  /* ── basic helpers ─────────────────────────────────────────────────── */

  function showToast(message, options = {}) {
    const opts = typeof options === 'string' ? {} : options
    const {
      iconId = opts.tone === 'error' ? 'i-alert' : 'i-check',
      actionLabel = '',
      onAction = null,
      duration = actionLabel ? 6000 : 2800,
    } = opts

    els.toast.replaceChildren()
    const iconEl = document.createElement('span')
    iconEl.className = 'toast-icon'
    iconEl.innerHTML = icon(iconId)
    const text = document.createElement('span')
    text.className = 'toast-text'
    text.textContent = message
    els.toast.append(iconEl, text)
    if (actionLabel && onAction) {
      const action = document.createElement('button')
      action.type = 'button'
      action.className = 'toast-action'
      action.textContent = actionLabel
      action.addEventListener('click', () => {
        hideToast()
        onAction()
      })
      els.toast.appendChild(action)
    }
    els.toast.classList.toggle('error', opts.tone === 'error')
    els.toast.hidden = false
    requestAnimationFrame(() => els.toast.classList.add('show'))
    clearTimeout(state.toastTimer)
    state.toastTimer = setTimeout(hideToast, duration)
  }

  function hideToast() {
    clearTimeout(state.toastTimer)
    els.toast.classList.remove('show')
    setTimeout(() => {
      if (!els.toast.classList.contains('show')) els.toast.hidden = true
    }, 220)
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
      } catch {
        return false
      }
    }
  }

  function formatDuration(ms) {
    if (!ms && ms !== 0) return ''
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  function formatTokens(n) {
    if (!n) return ''
    if (n < 1000) return `${n}`
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  }

  let mathPromise = null
  let mathResourcesReady = false
  function ensureMath() {
    if (mathPromise) return mathPromise
    const loadScript = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = () => {
        script.remove()
        reject(new Error('公式渲染加载失败'))
      }
      document.head.appendChild(script)
    })
    const style = new Promise((resolve, reject) => {
      let link = document.querySelector('link[href="/vendor/katex/katex.min.css"]')
      if (link?.sheet) return resolve()
      const created = !link
      if (!link) {
        link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = '/vendor/katex/katex.min.css'
      }
      link.addEventListener('load', resolve, { once: true })
      link.addEventListener('error', () => {
        link.remove()
        reject(new Error('公式样式加载失败'))
      }, { once: true })
      if (created) document.head.appendChild(link)
    })
    const scripts = (async () => {
      if (!window.katex) await loadScript('/vendor/katex/katex.min.js')
      if (!window.renderMathInElement) await loadScript('/vendor/katex/contrib/auto-render.min.js')
    })()
    // Settle both resource branches before retrying so a failed stylesheet
    // cannot leave a second attempt racing an unfinished script request.
    const attempt = Promise.allSettled([style, scripts]).then((results) => {
      const failed = results.find((result) => result.status === 'rejected')
      if (failed) throw failed.reason
      mathResourcesReady = true
    })
    mathPromise = attempt
    attempt.catch(() => {
      if (mathPromise === attempt) mathPromise = null
    })
    return attempt
  }

  function hasMathSyntax(text) {
    return /\\\(|\\\[|\$\$|\\begin\{/.test(String(text || ''))
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  /* ── request resolution (survives page reloads) ────────────────────── */

  function loadResolvedMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RESOLVED_KEY) || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const out = {}
      for (const [conversationId, value] of Object.entries(parsed)) {
        if (!Array.isArray(value)) continue
        out[conversationId] = value.filter((id) => typeof id === 'string').slice(-240)
      }
      return out
    } catch {
      return {}
    }
  }

  function saveResolvedMap() {
    try {
      localStorage.setItem(RESOLVED_KEY, JSON.stringify(state.resolvedRequests))
    } catch {}
  }

  function requestResolved(conversationId, requestId) {
    if (!conversationId || !requestId) return false
    return Boolean(state.resolvedRequests[conversationId]?.includes(requestId))
  }

  function markRequestResolved(conversationId, requestId) {
    if (!conversationId || !requestId) return
    const list = state.resolvedRequests[conversationId] || (state.resolvedRequests[conversationId] = [])
    if (!list.includes(requestId)) {
      list.push(requestId)
      if (list.length > 240) list.splice(0, list.length - 240)
      saveResolvedMap()
    }
  }

  /* ── permission level picker ───────────────────────────────────────── */

  function permissionEntry(value) {
    const meta = PERMISSION_META[value] || {}
    const catalog = state.permissionCatalog?.options || []
    const option = catalog.find((item) => item && item.value === value)
    return {
      value,
      label: meta.label || option?.name || value,
      short: meta.short || meta.label || option?.name || value,
      description: meta.description || option?.description || '',
      tone: meta.tone || 'standard',
      badge: meta.badge,
    }
  }

  function permissionOptions() {
    const source =
      Array.isArray(state.permissionCatalog?.options) && state.permissionCatalog.options.length
        ? state.permissionCatalog.options
        : PERMISSION_FALLBACK
    const seen = new Set()
    const options = []
    for (const option of source) {
      if (!option || typeof option.value !== 'string' || !option.value || seen.has(option.value)) continue
      if (option.value === 'auto') continue
      seen.add(option.value)
      options.push(permissionEntry(option.value))
    }
    if (!seen.has(state.permission)) options.push(permissionEntry(state.permission))
    return options
  }

  function updatePermissionUI() {
    if (!els.permissionBtn || !els.permissionLabel) return
    const entry = permissionEntry(state.permission)
    const codex = state.currentEngine === 'codex'
    els.permissionLabel.textContent = entry.short
    els.permissionBtn.dataset.tone = entry.tone
    els.permissionBtn.disabled = false
    els.permissionBtn.removeAttribute('aria-disabled')
    els.permissionBtn.setAttribute('aria-label', `权限等级：${entry.label}`)
    els.permissionBtn.title = codex
      ? `Codex 沙箱：${entry.label}\n${entry.description}`
      : `权限等级：${entry.label}\n${entry.description}`
    if (!els.permissionMenu.hidden) renderPermissionMenu()
  }

  function closePermissionMenu({ restoreFocus = true } = {}) {
    if (!els.permissionMenu || els.permissionMenu.hidden) return
    els.permissionMenu.hidden = true
    els.permissionMenu.replaceChildren()
    els.permissionBtn?.setAttribute('aria-expanded', 'false')
    if (restoreFocus && state.permissionMenuFocus?.isConnected) {
      state.permissionMenuFocus.focus({ preventScroll: true })
    }
    state.permissionMenuFocus = null
  }

  function renderPermissionMenu() {
    const container = els.permissionMenu
    if (!container) return
    container.replaceChildren()
    container.hidden = false

    const card = document.createElement('div')
    card.className = 'permission-menu-card'
    card.setAttribute('role', 'document')

    const head = document.createElement('div')
    head.className = 'permission-menu-head'
    const title = document.createElement('strong')
    title.textContent = '权限等级'
    const note = document.createElement('span')
    note.textContent = state.currentId ? '仅对当前对话生效' : '用于即将开始的新对话'
    head.append(title, note)

    const list = document.createElement('div')
    list.className = 'permission-menu-list'
    const options = permissionOptions()
    for (const option of options) {
      const selected = option.value === state.permission
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `permission-option${selected ? ' selected' : ''}`
      button.dataset.tone = option.tone
      button.dataset.value = option.value
      button.setAttribute('aria-pressed', String(selected))

      const iconWrap = document.createElement('span')
      iconWrap.className = 'permission-option-icon'
      iconWrap.innerHTML = icon('i-shield')

      const copy = document.createElement('span')
      copy.className = 'permission-option-copy'
      const label = document.createElement('span')
      label.className = 'permission-option-label'
      label.textContent = option.label
      if (option.badge) {
        const badge = document.createElement('span')
        badge.className = 'permission-option-badge'
        badge.textContent = option.badge
        label.appendChild(badge)
      }
      const desc = document.createElement('span')
      desc.className = 'permission-option-desc'
      desc.textContent = option.description
      copy.append(label, desc)

      const check = document.createElement('span')
      check.className = 'permission-option-check'
      if (selected) check.innerHTML = icon('i-check')

      button.append(iconWrap, copy, check)
      button.addEventListener('click', () => void choosePermission(option.value))
      list.appendChild(button)
    }

    const foot = document.createElement('p')
    foot.className = 'permission-menu-foot'
    if (state.currentEngine === 'codex') {
      foot.textContent =
        state.permission === 'danger-full-access'
          ? 'Codex 将以完全权限运行，不再请求沙箱授权；Computer Use 使用应用的授权仍会单独询问。'
          : `Codex 将以「${permissionEntry(state.permission).label}」沙箱启动；需要提权时仍会弹出网页授权卡。`
    } else {
      foot.textContent =
        state.permission === 'danger-full-access'
          ? '当前为完全权限：Agent 不再请求授权，请只在你信任的任务中使用。'
          : '遇到敏感操作（删除、覆盖、外部命令等）时会先弹出授权确认。'
    }

    card.append(head, list, foot)
    container.appendChild(card)
    requestAnimationFrame(() => {
      const current =
        container.querySelector('.permission-option.selected') ||
        container.querySelector('.permission-option')
      current?.focus({ preventScroll: true })
    })
  }

  function openPermissionMenu() {
    if (!els.permissionMenu) return
    if (!els.permissionMenu.hidden) {
      closePermissionMenu()
      return
    }
    state.permissionMenuFocus = document.activeElement
    els.permissionBtn?.setAttribute('aria-expanded', 'true')
    renderPermissionMenu()
  }

  async function choosePermission(value) {
    if (!value) return
    const entry = permissionEntry(value)
    const previous = state.permission
    state.permission = value
    updatePermissionUI()
    closePermissionMenu()
    const conversationId = state.currentId
    if (!conversationId) {
      showToast(`新对话将使用「${entry.label}」权限`)
      return
    }
    try {
      const data = await api(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ permission: value }),
      })
      const saved = data.conversation?.permission || value
      const conv = state.conversations.find((item) => item.id === conversationId)
      if (conv) conv.permission = saved
      scheduleCacheSave()
      if (state.currentId === conversationId) {
        state.permission = saved
        updatePermissionUI()
        if (saved === 'danger-full-access') showToast('已切换为完全权限，后续操作不再询问')
        else showToast(`已切换为「${permissionEntry(saved).label}」权限`)
      }
    } catch (error) {
      if (state.currentId === conversationId) {
        state.permission = previous
        updatePermissionUI()
      }
      if (isNetworkError(error)) setConnection('offline')
      showToast(error.message || '权限切换失败')
    }
  }

  async function loadPermissionCatalog() {
    try {
      const data = await api('/api/permissions')
      if (Array.isArray(data?.options) && data.options.length) {
        state.permissionCatalog = data
        updatePermissionUI()
      }
    } catch {}
  }

  function fileUrl(relative, download = false) {
    if (!state.currentId || !relative) return '#'
    return `/api/conversations/${encodeURIComponent(state.currentId)}/files/raw?path=${encodeURIComponent(relative)}${download ? '&download=1' : ''}`
  }

  function fileIcon(kind) {
    return kind === 'image' ? 'i-image' : 'i-file'
  }

  function fileChip(file) {
    const link = document.createElement('a')
    link.className = 'file-chip'
    link.href = fileUrl(file.path)
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.title = file.path
    link.innerHTML = icon(fileIcon(file.kind))
    const name = document.createElement('span')
    name.className = 'file-chip-name'
    name.textContent = file.name
    const size = document.createElement('span')
    size.className = 'file-chip-size'
    size.textContent = formatBytes(file.size)
    link.append(name, size)
    return link
  }

  function decorateFileRefs(root = document) {
    if (!state.currentId) return
    for (const span of root.querySelectorAll('.file-ref[data-file]:not(.linked)')) {
      let relative = span.dataset.file || ''
      try {
        relative = decodeURIComponent(relative)
      } catch {}
      relative = relative.replace(/^\.\//, '')
      if (!relative || relative.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(relative)) continue
      const known = state.filePaths.has(relative) || state.files.some((file) => file.name === relative)
      if (!known) continue
      const link = document.createElement('a')
      link.className = 'file-ref linked'
      link.href = fileUrl(relative)
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.title = `打开 ${relative}`
      link.textContent = span.textContent
      span.replaceWith(link)
    }
  }

  function renderFilesBar() {
    const count = state.files.length
    els.filesBar.hidden = count === 0
    els.filesCount.textContent = String(count)
    els.filesSheetCount.textContent = count ? `(${count})` : ''
  }

  async function refreshFiles(conversationId = state.currentId) {
    if (!conversationId) {
      state.files = []
      state.filePaths.clear()
      renderFilesBar()
      return
    }
    try {
      const data = await api(`/api/conversations/${conversationId}/files`)
      if (state.currentId !== conversationId) return
      state.files = data.files || []
      state.filePaths = new Set(state.files.map((file) => file.path))
      renderFilesBar()
      if (!els.filesSheet.hidden) renderFilesSheet()
      decorateFileRefs()
    } catch {}
  }

  function scenarioArt(id) {
    if (id === 'web') {
      return '<span class="art-window"><span class="art-window-bar"><i></i><i></i><i></i></span><span class="art-window-line l1"></span><span class="art-window-line l2"></span><span class="art-window-line l3"></span></span>'
    }
    if (id === 'stock') {
      return '<svg class="art-chart" viewBox="0 0 140 70" fill="none" aria-hidden="true"><path class="art-chart-area" d="M2 58 C16 52 20 40 32 44 C46 49 50 30 64 34 C78 38 82 20 96 24 C110 28 118 12 138 8 L138 68 L2 68 Z"/><path class="art-chart-line" d="M2 58 C16 52 20 40 32 44 C46 49 50 30 64 34 C78 38 82 20 96 24 C110 28 118 12 138 8"/><circle class="art-chart-dot" cx="138" cy="8" r="2.6"/></svg>'
    }
    if (id === 'computer') {
      return '<span class="art-screen"><span class="art-screen-bar"></span><span class="art-screen-line s1"></span><span class="art-screen-line s2"></span><span class="art-cursor"></span></span>'
    }
    if (id === 'content') {
      return '<span class="art-quote">“</span><span class="art-rule r1"></span><span class="art-rule r2"></span><span class="art-rule r3"></span>'
    }
    return '<span class="art-check">✓</span><span class="art-rule r1"></span><span class="art-check">✓</span><span class="art-rule r2"></span><span class="art-rule r3"></span>'
  }

  function scenarioCardElement(scenario, compact = false) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.scenario = scenario.id
    button.className = compact ? 'scenario-row' : `scenario-card scenario-${scenario.id}`
    button.setAttribute(
      'aria-label',
      `${scenario.title}：${scenario.desc}。需要${scenario.need || '相关信息'}；点按会把示例填入输入框。`,
    )

    const iconEl = document.createElement('span')
    iconEl.className = 'scenario-icon'
    iconEl.innerHTML = icon(scenario.icon)

    const copy = document.createElement('span')
    copy.className = 'scenario-copy'
    const title = document.createElement('span')
    title.className = 'scenario-title'
    title.textContent = scenario.title
    const desc = document.createElement('span')
    desc.className = 'scenario-desc'
    desc.textContent = scenario.desc
    copy.append(title, desc)
    if (scenario.need) {
      const need = document.createElement('span')
      need.className = 'scenario-need'
      need.textContent = `需要：${scenario.need}`
      copy.append(need)
    }

    if (compact) {
      button.append(iconEl, copy)
      const chevron = document.createElement('span')
      chevron.className = 'scenario-chevron'
      chevron.innerHTML = icon('i-chevron')
      button.appendChild(chevron)
      return button
    }

    if (scenario.id === 'web') button.classList.add('featured')
    const top = document.createElement('span')
    top.className = 'scenario-top'
    const arrow = document.createElement('span')
    arrow.className = 'scenario-arrow'
    arrow.innerHTML = icon('i-up')
    top.append(iconEl, arrow)

    const art = document.createElement('span')
    art.className = `scenario-art art-${scenario.id}`
    art.setAttribute('aria-hidden', 'true')
    art.innerHTML = scenarioArt(scenario.id)

    button.append(top, copy, art)
    return button
  }

  function renderScenarios() {
    for (const container of [els.scenarioGrid, els.scenarioList]) {
      if (!container) continue
      container.replaceChildren()
      SCENARIOS.forEach((scenario, index) => {
        const card = scenarioCardElement(scenario, container === els.scenarioList)
        card.style.setProperty('--i', index)
        container.appendChild(card)
      })
    }
  }

  function useScenario(id) {
    const scenario = SCENARIOS.find((item) => item.id === id)
    if (!scenario) return
    if (!els.scenarioSheet.hidden) closeScenarioSheet()
    const prefix = els.input.value.trim() ? `${els.input.value}\n\n` : ''
    els.input.value = prefix + scenario.template
    resizeInput()
    updateComposerMeta()
    saveDraftNow()
    els.input.focus({ preventScroll: true })
    const match = scenario.template.match(/\{\{[^}]+\}\}/)
    if (match) {
      const start = prefix.length + scenario.template.indexOf(match[0])
      els.input.setSelectionRange(start, start + match[0].length)
    } else {
      const end = els.input.value.length
      els.input.setSelectionRange(end, end)
    }
  }

  function openScenarioSheet() {
    if (!els.filesSheet.hidden) closeFilesSheet()
    state.lastScenarioFocus = document.activeElement
    renderScenarios()
    els.scenarioSheet.hidden = false
    lockShell(true)
    const closeButton = els.scenarioSheet.querySelector('.sheet-head [data-scenario-close]')
    if (closeButton) closeButton.focus()
  }

  function closeScenarioSheet() {
    if (els.scenarioSheet.hidden) return
    els.scenarioSheet.hidden = true
    lockShell(false)
    if (state.lastScenarioFocus && state.lastScenarioFocus.isConnected) state.lastScenarioFocus.focus()
    else els.scenarioBtn.focus()
  }

  function addUploadNotice(files) {
    if (!files.length) return
    const notice = document.createElement('div')
    notice.className = 'upload-notice'
    const head = document.createElement('div')
    head.className = 'upload-notice-title'
    head.innerHTML = icon('i-paperclip')
    const label = document.createElement('span')
    label.textContent = `已上传 ${files.length} 个文件`
    head.appendChild(label)
    const hint = document.createElement('span')
    hint.className = 'upload-notice-hint'
    hint.textContent = '发送消息时提及文件名，或直接用下面的提示'
    head.appendChild(hint)
    const chips = document.createElement('div')
    chips.className = 'file-chips'
    for (const file of files) chips.appendChild(fileChip(file))
    notice.append(head, chips)
    els.emptyState.hidden = true
    els.thread.hidden = false
    els.thread.appendChild(notice)
    state.stick = true
    scrollToBottom()
  }

  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'])
  const MAX_STAGED = 5
  const MAX_FILE_BYTES = 25 * 1024 * 1024

  function attachmentKind(name) {
    const ext = String(name || '').split('.').pop().toLowerCase()
    return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'other'
  }

  function addStagedFiles(fileList, source = '选择') {
    const files = [...fileList]
    if (!files.length) return
    const tooLarge = files.filter((file) => file.size > MAX_FILE_BYTES)
    if (tooLarge.length) {
      showToast(`已跳过超过 25MB 的文件：${tooLarge.map((file) => file.name).join('、')}`, { tone: 'error' })
    }
    const room = MAX_STAGED - state.stagedFiles.length
    if (room <= 0) {
      showToast('一次最多添加 5 个附件', { tone: 'error' })
      return
    }
    const accepted = files.filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES).slice(0, room)
    if (files.filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES).length > room) {
      showToast(`一次最多 5 个附件，已保留前 ${room} 个`)
    }
    if (!accepted.length) return
    for (const file of accepted) {
      const kind = attachmentKind(file.name)
      state.stagedFiles.push({
        id: `att_${Date.now()}_${state.stagedSeq++}`,
        file,
        name: file.name || `pasted-${Date.now()}.png`,
        size: file.size,
        kind,
        status: 'staged',
        progress: 0,
        path: '',
        error: '',
        previewUrl: kind === 'image' ? URL.createObjectURL(file) : '',
      })
    }
    renderAttachmentTray()
    updateComposerMeta()
    els.sendBtn.disabled = state.streaming ? false : false
    els.input.focus({ preventScroll: true })
    if (source === '粘贴') showToast(`已添加 ${accepted.length} 个粘贴的附件`)
  }

  function renderAttachmentTray() {
    if (!els.attachmentTray) return
    const items = state.stagedFiles
    els.attachmentTray.hidden = items.length === 0
    els.attachmentTray.replaceChildren()
    for (const item of items) {
      const chip = document.createElement('div')
      chip.className = 'attachment-chip'
      chip.dataset.status = item.status
      chip.dataset.id = item.id

      if (item.previewUrl) {
        const image = document.createElement('img')
        image.className = 'attachment-thumb'
        image.src = item.previewUrl
        image.alt = ''
        chip.appendChild(image)
      } else {
        const iconWrap = document.createElement('span')
        iconWrap.className = 'attachment-icon'
        iconWrap.innerHTML = icon('i-file')
        chip.appendChild(iconWrap)
      }

      const copy = document.createElement('span')
      copy.className = 'attachment-copy'
      const name = document.createElement('span')
      name.className = 'attachment-name'
      name.textContent = item.name
      name.title = item.name
      const meta = document.createElement('span')
      meta.className = 'attachment-meta'
      if (item.status === 'uploading') meta.textContent = `上传中 ${Math.round(item.progress)}%`
      else if (item.status === 'error') meta.textContent = item.error || '上传失败，点击重试'
      else if (item.status === 'done') meta.textContent = `${formatBytes(item.size)} · 已就绪`
      else meta.textContent = `${formatBytes(item.size)} · 待发送`
      copy.append(name, meta)
      chip.appendChild(copy)

      if (item.status === 'uploading') {
        const progress = document.createElement('span')
        progress.className = 'attachment-progress'
        progress.style.width = `${Math.max(3, item.progress)}%`
        chip.appendChild(progress)
      }

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'attachment-remove'
      remove.setAttribute('aria-label', `移除附件 ${item.name}`)
      remove.innerHTML = icon('i-close')
      remove.addEventListener('click', () => removeStagedFile(item.id))
      chip.appendChild(remove)

      if (item.status === 'error') {
        chip.addEventListener('click', (event) => {
          if (event.target.closest('.attachment-remove')) return
          item.status = 'staged'
          item.error = ''
          renderAttachmentTray()
          void uploadStagedFiles(state.currentId)
        })
      }
      els.attachmentTray.appendChild(chip)
    }
    updateComposerMeta()
  }

  function removeStagedFile(id) {
    const item = state.stagedFiles.find((entry) => entry.id === id)
    if (!item) return
    if (item.xhr) {
      try {
        item.xhr.abort()
      } catch {}
    }
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    state.stagedFiles = state.stagedFiles.filter((entry) => entry.id !== id)
    renderAttachmentTray()
  }

  function clearStagedAttachments() {
    for (const item of state.stagedFiles) {
      if (item.xhr) {
        try {
          item.xhr.abort()
        } catch {}
      }
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
    state.stagedFiles = []
    renderAttachmentTray()
  }

  function uploadOne(item, conversationId) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      item.xhr = xhr
      item.status = 'uploading'
      item.progress = 0
      renderAttachmentTray()
      xhr.open(
        'POST',
        `/api/conversations/${conversationId}/upload?name=${encodeURIComponent(item.name)}`,
        true,
      )
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        item.progress = Math.min(99, (event.loaded / event.total) * 100)
        renderAttachmentTray()
      }
      xhr.onload = () => {
        item.xhr = null
        let data = {}
        try {
          data = JSON.parse(xhr.responseText || '{}')
        } catch {}
        if (xhr.status === 401) {
          showLogin()
          item.status = 'error'
          item.error = '登录已失效'
          renderAttachmentTray()
          reject(new Error('登录已失效，请重新输入访问码'))
          return
        }
        if (xhr.status < 200 || xhr.status >= 300 || !data.file) {
          item.status = 'error'
          item.error = data.error || `上传失败（${xhr.status}）`
          renderAttachmentTray()
          reject(new Error(item.error))
          return
        }
        item.status = 'done'
        item.progress = 100
        item.path = data.file.path
        item.size = data.file.size
        item.kind = data.file.kind || item.kind
        renderAttachmentTray()
        resolve(data.file)
      }
      xhr.onerror = () => {
        item.xhr = null
        item.status = 'error'
        item.error = '网络中断，点击重试'
        renderAttachmentTray()
        reject(new Error('网络中断，附件未上传'))
      }
      xhr.onabort = () => {
        item.xhr = null
        reject(Object.assign(new Error('已取消上传'), { name: 'AbortError' }))
      }
      xhr.send(item.file)
    })
  }

  async function uploadStagedFiles(conversationId) {
    if (!conversationId) return null
    const items = state.stagedFiles.filter((item) => item.status !== 'done')
    for (const item of items) {
      try {
        await uploadOne(item, conversationId)
      } catch (error) {
        if (error.name === 'AbortError') return null
        if (isNetworkError(error)) setConnection('offline')
        showToast(error.message || '附件上传失败', { tone: 'error' })
        return null
      }
    }
    return state.stagedFiles
      .filter((item) => item.path)
      .map((item) => ({ path: item.path, name: item.name, size: item.size, kind: item.kind }))
  }

  const PREVIEW_TEXT = new Set([
    'txt','md','markdown','json','jsonl','csv','tsv','log','py','js','mjs','cjs','ts','tsx','jsx',
    'css','scss','less','yaml','yml','toml','sh','bash','zsh','sql','xml','ini','cfg','conf','go',
    'rs','java','kt','c','h','cpp','hpp','rb','php','swift','vue','svelte','dockerfile','env',
  ])

  function previewKind(file) {
    const ext = String(file.name || '').split('.').pop().toLowerCase()
    if (file.kind === 'image') return 'image'
    if (ext === 'pdf') return 'pdf'
    if (PREVIEW_TEXT.has(ext) || ext === '') return 'text'
    return 'binary'
  }

  let previewVersion = 0
  let previewController = null

  function invalidateFilePreview() {
    previewVersion += 1
    previewController?.abort()
    previewController = null
    return previewVersion
  }

  function closeFilePreview() {
    invalidateFilePreview()
    if (!els.filePreview || els.filePreview.hidden) return
    els.filePreview.hidden = true
    els.filePreviewBody.replaceChildren()
    state.previewFile = null
    lockShell(false)
    if (state.previewFocus?.isConnected) state.previewFocus.focus({ preventScroll: true })
    state.previewFocus = null
  }

  async function openFilePreview(file) {
    if (!file || !els.filePreview) return
    const version = invalidateFilePreview()
    const current = () => version === previewVersion && !els.filePreview.hidden
    const url = fileUrl(file.path)
    if (!els.filesSheet.hidden) closeFilesSheet()
    state.previewFile = file
    state.previewFocus = document.activeElement
    const kind = previewKind(file)
    els.filePreviewTitle.textContent = file.name
    els.filePreviewMeta.textContent = `${file.path} · ${formatBytes(file.size)} · ${relativeTime(file.mtime)}`
    els.filePreviewIcon.innerHTML = icon(fileIcon(file.kind))
    els.filePreviewOpen.href = url
    els.filePreviewDownload.href = `${url}&download=1`
    els.filePreviewDownload.setAttribute('download', file.name)
    els.filePreviewBody.replaceChildren()
    const loading = document.createElement('div')
    loading.className = 'file-preview-loading'
    loading.textContent = '正在载入预览…'
    els.filePreviewBody.appendChild(loading)
    els.filePreview.hidden = false
    lockShell(true)
    requestAnimationFrame(() => {
      if (current()) els.filePreview.querySelector('.sheet-head [data-preview-close]')?.focus({ preventScroll: true })
    })

    if (kind === 'image') {
      const image = document.createElement('img')
      image.alt = file.name
      image.src = url
      image.addEventListener('load', () => { if (current()) loading.remove() }, { once: true })
      image.addEventListener('error', () => {
        if (!current()) return
        loading.className = 'file-preview-error'
        loading.textContent = '图片加载失败，可下载后查看。'
      }, { once: true })
      els.filePreviewBody.appendChild(image)
      return
    }
    if (kind === 'pdf') {
      loading.remove()
      const frame = document.createElement('iframe')
      frame.title = `${file.name} 的 PDF 预览`
      frame.src = url
      els.filePreviewBody.appendChild(frame)
      return
    }
    if (kind === 'binary') {
      loading.className = 'file-preview-error'
      loading.textContent = '这种文件类型不支持在线预览。请下载后用本地应用打开。'
      return
    }
    const controller = new AbortController()
    previewController = controller
    try {
      const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal })
      if (!response.ok) throw new Error(`预览失败（${response.status}）`)
      const text = await response.text()
      if (!current()) return
      loading.remove()
      const pre = document.createElement('pre')
      pre.textContent = text.length > 400_000 ? `${text.slice(0, 400_000)}\n\n…（内容过长，已截断）` : text
      els.filePreviewBody.appendChild(pre)
    } catch (error) {
      if (!current() || error.name === 'AbortError') return
      loading.className = 'file-preview-error'
      loading.textContent = `${error.message || '预览失败'}。可下载后查看。`
    } finally {
      if (previewController === controller) previewController = null
    }
  }

  function renderFilesSheet() {
    els.filesList.replaceChildren()
    if (!state.files.length) {
      const empty = document.createElement('p')
      empty.className = 'files-empty'
      empty.textContent = '这个对话还没有产出文件。让助手生成文件后，会自动出现在这里。'
      els.filesList.appendChild(empty)
      return
    }
    for (const file of state.files) {
      const row = document.createElement('div')
      row.className = 'file-row'

      const iconEl = document.createElement('div')
      iconEl.className = 'file-row-icon'
      if (file.kind === 'image') {
        const image = document.createElement('img')
        image.className = 'file-thumb'
        image.src = fileUrl(file.path)
        image.alt = file.name
        image.loading = 'lazy'
        iconEl.appendChild(image)
      } else {
        iconEl.innerHTML = icon(fileIcon(file.kind))
      }

      const main = document.createElement('div')
      main.className = 'file-row-main'
      const name = document.createElement('button')
      name.type = 'button'
      name.className = 'file-row-name'
      name.textContent = file.name
      name.title = file.path
      name.setAttribute('aria-label', `预览 ${file.name}`)
      name.addEventListener('click', () => void openFilePreview(file))
      const meta = document.createElement('div')
      meta.className = 'file-row-meta'
      meta.textContent = `${file.path} · ${formatBytes(file.size)} · ${relativeTime(file.mtime)}`
      main.append(name, meta)

      const actions = document.createElement('div')
      actions.className = 'file-row-actions'
      const open = document.createElement('a')
      open.className = 'icon-btn'
      open.href = fileUrl(file.path)
      open.target = '_blank'
      open.rel = 'noopener noreferrer'
      open.title = '打开'
      open.setAttribute('aria-label', `打开 ${file.name}`)
      open.innerHTML = icon('i-external')
      const download = document.createElement('a')
      download.className = 'icon-btn'
      download.href = fileUrl(file.path, true)
      download.download = file.name
      download.title = '下载'
      download.setAttribute('aria-label', `下载 ${file.name}`)
      download.innerHTML = icon('i-download')
      const insert = document.createElement('button')
      insert.type = 'button'
      insert.className = 'icon-btn'
      insert.title = '插入路径'
      insert.setAttribute('aria-label', `把 ${file.name} 的路径插入输入框`)
      insert.innerHTML = icon('i-plus')
      insert.addEventListener('click', () => {
        const prefix = els.input.value && !els.input.value.endsWith(' ') ? ' ' : ''
        els.input.value = `${els.input.value}${prefix}${file.path}`
        resizeInput()
        updateComposerMeta()
        scheduleDraftSave()
        els.input.focus()
        showToast('已插入文件路径')
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'icon-btn'
      remove.title = '删除文件'
      remove.setAttribute('aria-label', `删除文件 ${file.name}`)
      remove.innerHTML = icon('i-trash')
      remove.addEventListener('click', () => {
        askConfirm({
          title: `删除「${file.name}」？`,
          body: '文件会从会话工作区移除，此操作不可撤销。',
          okLabel: '删除',
          onOk: async () => {
            try {
              await api(`/api/conversations/${state.currentId}/files/delete`, {
                method: 'POST',
                body: JSON.stringify({ path: file.path }),
              })
              await refreshFiles(state.currentId)
              renderFilesSheet()
              showToast('文件已删除')
            } catch (error) {
              showToast(error.message || '删除失败', { tone: 'error' })
            }
          },
        })
      })
      actions.append(open, download, insert, remove)

      row.append(iconEl, main, actions)
      els.filesList.appendChild(row)
    }
  }

  function openFilesSheet() {
    if (!els.scenarioSheet.hidden) closeScenarioSheet()
    state.lastFilesFocus = document.activeElement
    renderFilesSheet()
    els.filesSheet.hidden = false
    lockShell(true)
    const closeButton = els.filesSheet.querySelector('.sheet-head [data-files-close]')
    if (closeButton) closeButton.focus()
  }

  function closeFilesSheet() {
    if (els.filesSheet.hidden) return
    els.filesSheet.hidden = true
    lockShell(false)
    if (state.lastFilesFocus && state.lastFilesFocus.isConnected) state.lastFilesFocus.focus()
    else els.filesBtn.focus()
  }

  function approvalText(value) {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      for (const key of ['zh', 'zh-CN', 'en', 'text', 'message', 'value']) {
        if (typeof value[key] === 'string' && value[key]) return value[key]
      }
      try {
        return JSON.stringify(value)
      } catch {
        return ''
      }
    }
    return String(value)
  }

  function clearQuestions() {
    state.questions.clear()
    els.questionSlot.hidden = true
    els.questionSlot.replaceChildren()
  }

  function clearApprovalInline() {
    state.approvals.clear()
    clearTimeout(state.approvalNoticeTimer)
    state.approvalNoticeTimer = null
    if (!els.permissionInline) return
    els.permissionInline.hidden = true
    els.permissionInline.classList.remove('is-done', 'ok')
    els.permissionInline.replaceChildren()
  }

  function clearQuestionSlot() {
    clearQuestions()
    clearApprovalInline()
  }

  function showPermissionNotice(text, ok = true) {
    const container = els.permissionInline
    if (!container) return
    const note = document.createElement('div')
    note.className = 'permission-done'
    note.innerHTML = icon(ok ? 'i-check' : 'i-alert')
    const label = document.createElement('span')
    label.textContent = text
    note.appendChild(label)
    container.hidden = false
    container.classList.toggle('is-done', true)
    container.classList.toggle('ok', Boolean(ok))
    container.replaceChildren(note)
    clearTimeout(state.approvalNoticeTimer)
    state.approvalNoticeTimer = setTimeout(() => {
      if (container.firstChild === note) {
        container.hidden = true
        container.classList.remove('is-done', 'ok')
        container.replaceChildren()
      }
    }, 2600)
  }

  function expireApprovals(reason = '对话已结束，授权已失效') {
    if (!state.approvals.size) return
    for (const requestId of state.approvals.keys()) markRequestResolved(state.currentId, requestId)
    state.approvals.clear()
    showPermissionNotice(reason, false)
  }

  function expireQuestions(reason = '对话已结束，问题已失效') {
    expireApprovals(reason)
    if (!state.questions.size) return
    for (const requestId of state.questions.keys()) markRequestResolved(state.currentId, requestId)
    state.questions.clear()
    els.questionSlot.replaceChildren()
    const note = document.createElement('div')
    note.className = 'question-done'
    note.innerHTML = icon('i-alert')
    const text = document.createElement('span')
    text.textContent = reason
    note.appendChild(text)
    els.questionSlot.hidden = false
    els.questionSlot.appendChild(note)
    setTimeout(() => {
      if (els.questionSlot.firstChild === note) clearQuestions()
    }, 3200)
  }

  function showApproval(event) {
    if (!event || typeof event.requestId !== 'string' || !state.currentId) return
    const container = els.permissionInline
    if (!container) return
    const conversationId = state.currentId
    if (requestResolved(conversationId, event.requestId)) return
    for (const requestId of state.approvals.keys()) markRequestResolved(conversationId, requestId)
    clearApprovalInline()

    const meta = toolMeta(event.toolName)
    const reason = approvalText(event.displayReason) || approvalText(event.reason)

    const main = document.createElement('div')
    main.className = 'permission-main'
    const iconEl = document.createElement('span')
    iconEl.className = 'permission-icon'
    iconEl.innerHTML = icon('i-alert')
    const copy = document.createElement('div')
    copy.className = 'permission-copy'
    const head = document.createElement('div')
    head.className = 'permission-head'
    const kicker = document.createElement('span')
    kicker.className = 'permission-kicker'
    kicker.textContent = '需要授权'
    const title = document.createElement('span')
    title.className = 'permission-title'
    title.textContent = `${meta.label}请求执行权限`
    head.append(kicker, title)

    const body = document.createElement('p')
    body.className = 'permission-reason'
    body.textContent = reason || '该操作需要你的确认后才会执行。'
    body.title = body.textContent

    copy.append(head, body)
    main.append(iconEl, copy)

    const foot = document.createElement('div')
    foot.className = 'permission-foot'
    const metaWrap = document.createElement('div')
    metaWrap.className = 'permission-meta'
    const hint = document.createElement('span')
    hint.className = 'permission-hint'
    hint.textContent = '仅本次有效 · 也可切换为完全权限'
    const tool = document.createElement('span')
    tool.className = 'permission-tool'
    tool.textContent = event.toolName
    tool.title = event.toolName
    metaWrap.append(hint, tool)

    const actions = document.createElement('div')
    actions.className = 'permission-actions'
    const reject = document.createElement('button')
    reject.type = 'button'
    reject.className = 'permission-btn'
    reject.textContent = '拒绝'
    const always = document.createElement('button')
    always.type = 'button'
    always.className = 'permission-btn always'
    always.textContent = '完全权限'
    always.title = '允许本次操作，并把当前对话切换为完全权限；之后不再弹出授权确认'
    const allow = document.createElement('button')
    allow.type = 'button'
    allow.className = 'permission-btn allow'
    allow.textContent = '允许一次'
    actions.append(reject, always, allow)

    foot.append(metaWrap, actions)
    container.append(main, foot)
    container.hidden = false

    let busy = false
    const setBusy = (value, decision = '') => {
      busy = value
      allow.disabled = value
      reject.disabled = value
      always.disabled = value
      allow.textContent = value && decision === 'allow' ? '允许中…' : '允许一次'
      reject.textContent = value && decision === 'reject' ? '拒绝中…' : '拒绝'
      always.textContent = value && decision === 'allow-always' ? '切换中…' : '完全权限'
    }

    const submit = async (decision) => {
      if (busy) return
      setBusy(true, decision)
      try {
        const data = await api(`/api/conversations/${conversationId}/approval`, {
          method: 'POST',
          body: JSON.stringify({ requestId: event.requestId, decision }),
        })
        state.approvals.delete(event.requestId)
        markRequestResolved(conversationId, event.requestId)
        if (decision === 'allow-always') {
          state.permission = data.permission || 'danger-full-access'
          updatePermissionUI()
          showPermissionNotice('已允许，并切换为完全权限', true)
        } else {
          showPermissionNotice(
            decision === 'allow' ? '已允许一次，助手继续执行' : '已拒绝该操作',
            decision === 'allow',
          )
        }
        if (state.stick) scrollToBottom()
      } catch (error) {
        setBusy(false)
        if (isNetworkError(error)) {
          setConnection('offline')
          showToast('网络中断，授权未提交')
          return
        }
        showToast(error.message || '授权提交失败')
        if (/失效|不存在|pending|unknown|过期/i.test(error.message || '')) {
          markRequestResolved(conversationId, event.requestId)
          expireApprovals('授权已失效')
        }
      }
    }

    allow.addEventListener('click', () => void submit('allow'))
    always.addEventListener('click', () => void submit('allow-always'))
    reject.addEventListener('click', () => void submit('reject'))

    state.approvals.set(event.requestId, {
      conversationId,
      card: container,
      callId: event.callId || null,
    })
    if (state.stick) scrollToBottom()
  }

  function showQuestion(event) {
    if (!Array.isArray(event.questions) || event.questions.length === 0) return
    const conversationId = state.currentId
    if (!conversationId) return
    if (requestResolved(conversationId, event.requestId)) return
    for (const requestId of state.questions.keys()) markRequestResolved(conversationId, requestId)
    clearQuestions()

    const card = document.createElement('div')
    card.className = 'question-card'

    const head = document.createElement('div')
    head.className = 'question-head'
    head.innerHTML = icon('i-spark')
    const title = document.createElement('span')
    title.textContent = event.questions.some((question) => question?.intent?.kind === 'plan-review')
      ? '计划待审'
      : '助手需要你的选择'
    const count = document.createElement('span')
    count.className = 'question-count'
    count.textContent = `${event.questions.length} 个问题`
    head.append(title, count)

    const list = document.createElement('div')
    list.className = 'question-list'
    const sections = new Map()

    event.questions.forEach((question, index) => {
      const section = document.createElement('section')
      section.className = 'question-item'
      section.dataset.qid = question.id

      if (question.header) {
        const header = document.createElement('div')
        header.className = 'question-header'
        header.textContent = question.header
        section.appendChild(header)
      }

      const text = document.createElement('div')
      text.className = 'question-text md'
      text.innerHTML = window.Markdown.render(String(question.question || ''))
      section.appendChild(text)

      const detail = question.detail || question.intent?.detail
      if (detail) {
        const details = document.createElement('details')
        details.className = 'question-detail'
        const summary = document.createElement('summary')
        summary.textContent = '查看详情'
        const content = document.createElement('div')
        content.className = 'md'
        content.innerHTML = window.Markdown.render(String(detail))
        details.append(summary, content)
        section.appendChild(details)
      }

      const multi = Boolean(question.multiSelect ?? question.multi_select)
      const options = Array.isArray(question.options) ? question.options : []
      const groupName = `question_${event.requestId}_${index}`
      for (const option of options) {
        const labelText = typeof option === 'string' ? option : option?.label
        if (!labelText) continue
        const label = document.createElement('label')
        label.className = 'option'
        const input = document.createElement('input')
        input.type = multi ? 'checkbox' : 'radio'
        input.name = groupName
        input.value = labelText
        const body = document.createElement('span')
        body.className = 'option-body'
        const name = document.createElement('span')
        name.className = 'option-label'
        name.textContent = labelText
        body.appendChild(name)
        if (option && typeof option === 'object' && option.description) {
          const description = document.createElement('span')
          description.className = 'option-desc'
          description.textContent = option.description
          body.appendChild(description)
        }
        label.append(input, body)
        section.appendChild(label)
      }

      const custom = document.createElement('textarea')
      custom.className = 'question-custom'
      custom.rows = 2
      custom.placeholder = options.length ? '或者输入其他回答…' : '输入你的回答…'
      custom.addEventListener('input', () => {
        section.classList.remove('skipped')
        skip.textContent = '跳过此题'
        if (!multi && custom.value.trim()) {
          for (const input of section.querySelectorAll('input[type="radio"]')) input.checked = false
        }
      })
      section.appendChild(custom)

      const skip = document.createElement('button')
      skip.type = 'button'
      skip.className = 'question-skip'
      skip.textContent = '跳过此题'
      skip.addEventListener('click', () => {
        const skipped = section.classList.toggle('skipped')
        if (skipped) {
          for (const input of section.querySelectorAll('input')) input.checked = false
          custom.value = ''
          skip.textContent = '已跳过（点击恢复）'
        } else {
          skip.textContent = '跳过此题'
        }
      })
      section.appendChild(skip)

      list.appendChild(section)
      sections.set(question.id, { question, section, multi, custom, skip })
    })

    const actions = document.createElement('div')
    actions.className = 'question-actions'
    const skipAll = document.createElement('button')
    skipAll.type = 'button'
    skipAll.className = 'ghost-btn'
    skipAll.textContent = '跳过全部'
    const submit = document.createElement('button')
    submit.type = 'button'
    submit.className = 'primary-btn'
    submit.textContent = '提交答案'
    actions.append(skipAll, submit)

    card.append(head, list, actions)

    const markSkipped = () => {
      for (const info of sections.values()) {
        info.section.classList.add('skipped')
        for (const input of info.section.querySelectorAll('input')) input.checked = false
        info.custom.value = ''
        info.skip.textContent = '已跳过（点击恢复）'
      }
    }

    const collectAnswers = () => {
      const answers = []
      for (const [id, info] of sections) {
        const skipped = info.section.classList.contains('skipped')
        const selected = skipped
          ? []
          : [...info.section.querySelectorAll('input:checked')].map((input) => input.value)
        const custom = skipped ? '' : info.custom.value.trim()
        const answer = {
          id,
          selected: info.multi ? selected : custom ? [] : selected,
        }
        if (custom) answer.custom = custom
        answers.push(answer)
      }
      return answers
    }

    const finishCard = () => {
      markRequestResolved(conversationId, event.requestId)
      state.questions.delete(event.requestId)
      els.questionSlot.replaceChildren()
      const done = document.createElement('div')
      done.className = 'question-done'
      done.innerHTML = icon('i-check')
      const doneText = document.createElement('span')
      doneText.textContent = '已提交回答，助手继续执行'
      done.appendChild(doneText)
      els.questionSlot.hidden = false
      els.questionSlot.appendChild(done)
      setTimeout(() => {
        if (els.questionSlot.firstChild === done) clearQuestionSlot()
      }, 2600)
      if (state.stick) scrollToBottom()
    }

    const submitAnswers = async () => {
      const answers = collectAnswers()
      submit.disabled = true
      skipAll.disabled = true
      submit.textContent = '提交中…'
      try {
        await api(`/api/conversations/${conversationId}/answer`, {
          method: 'POST',
          body: JSON.stringify({ requestId: event.requestId, answers }),
        })
        finishCard()
      } catch (error) {
        submit.disabled = false
        skipAll.disabled = false
        submit.textContent = '提交答案'
        showToast(error.message)
        if (/失效|不存在|not.*pending|unknown/i.test(error.message || '')) {
          markRequestResolved(conversationId, event.requestId)
          expireQuestions('问题已失效')
        }
      }
    }

    submit.addEventListener('click', () => void submitAnswers())
    skipAll.addEventListener('click', () => {
      markSkipped()
      void submitAnswers()
    })

    state.questions.set(event.requestId, { conversationId, card, callId: event.callId || null })
    els.questionSlot.hidden = false
    els.questionSlot.replaceChildren(card)
    if (state.stick) scrollToBottom()
  }

  function relativeTime(ts) {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    const date = new Date(ts)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    if (ts >= startOfToday) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    if (ts >= startOfToday - 86_400_000) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  function dayLabel(ts) {
    const date = new Date(ts)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    if (day === today) return '今天'
    if (day === today - 86_400_000) return '昨天'
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  function toolMeta(name) {
    if (!name) return { label: '工具', icon: 'i-tool' }
    if (TOOL_META[name]) return TOOL_META[name]
    if (name.startsWith('browser')) return { label: '浏览器操作', icon: 'i-globe' }
    if (name.startsWith('job')) return { label: '后台任务', icon: 'i-terminal' }
    return { label: name.replace(/_/g, ' '), icon: 'i-tool' }
  }

  function summarizeInput(input) {
    if (!input || typeof input !== 'object') return ''
    const keys = ['description', 'command', 'file_path', 'path', 'pattern', 'query', 'url', 'prompt', 'text']
    for (const key of keys) {
      if (typeof input[key] === 'string' && input[key].trim()) {
        return input[key].replace(/\s+/g, ' ').trim()
      }
    }
    try {
      const json = JSON.stringify(input)
      return json.length > 90 ? json.slice(0, 90) + '…' : json
    } catch {
      return ''
    }
  }

  function clip(text, max = 12_000) {
    const value = String(text ?? '')
    return value.length > max ? value.slice(0, max) + '\n…（内容过长，已截断）' : value
  }

  /* ── theme + sidebar ───────────────────────────────────────────────── */

  function loadBookmarks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]')
      return Array.isArray(parsed)
        ? parsed.filter((item) => item && item.conversationId && item.messageId).slice(-200)
        : []
    } catch {
      return []
    }
  }

  function saveBookmarks() {
    try {
      localStorage.setItem(BOOKMARK_KEY, JSON.stringify(state.bookmarks.slice(-200)))
    } catch {}
  }

  function loadPrompts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROMPT_KEY) || 'null')
      if (Array.isArray(parsed)) return parsed.filter((item) => item && item.name && item.text)
    } catch {}
    return PROMPT_DEFAULTS.slice()
  }

  function savePrompts() {
    try {
      localStorage.setItem(PROMPT_KEY, JSON.stringify(state.prompts))
    } catch {}
  }

  function isBookmarked(messageId) {
    return state.bookmarks.some((item) => item.messageId === messageId)
  }

  function toggleBookmark({ conversationId, messageId, text, title }) {
    if (!conversationId || !messageId) return
    const existing = state.bookmarks.find(
      (item) => item.conversationId === conversationId && item.messageId === messageId,
    )
    if (existing) {
      state.bookmarks = state.bookmarks.filter((item) => item !== existing)
      showToast('已取消收藏')
    } else {
      state.bookmarks.push({
        conversationId,
        messageId,
        title: title || els.topbarName.textContent || '对话',
        text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280),
        at: Date.now(),
      })
      showToast('已收藏，可在侧栏「收藏」查看')
    }
    saveBookmarks()
    for (const button of document.querySelectorAll(`[data-bookmark-id="${messageId}"]`)) {
      button.classList.toggle('bookmarked', isBookmarked(messageId))
      button.setAttribute('aria-pressed', String(isBookmarked(messageId)))
    }
  }


  function loadPrefs() {
    const defaults = { density: 'comfortable', fontScale: 1, notify: false }
    try {
      const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
      return {
        density: parsed.density === 'compact' ? 'compact' : 'comfortable',
        fontScale: [0.94, 1, 1.1].includes(Number(parsed.fontScale)) ? Number(parsed.fontScale) : 1,
        notify: Boolean(parsed.notify),
      }
    } catch {
      return defaults
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs))
    } catch {}
  }

  function applyPrefs() {
    document.documentElement.dataset.density = state.prefs.density
    document.documentElement.style.setProperty('--reading-scale', String(state.prefs.fontScale))
    if (els.notifyToggle) {
      els.notifyToggle.setAttribute('aria-checked', String(state.prefs.notify))
      if (els.notifyState) els.notifyState.textContent = state.prefs.notify ? '已开启' : '已关闭'
      els.notifyToggle.setAttribute(
        'aria-label',
        `完成通知：${state.prefs.notify ? '已开启' : '已关闭'}`,
      )
    }
    for (const button of document.querySelectorAll('button[data-theme-option]')) {
      button.setAttribute('aria-checked', String(button.dataset.themeOption === state.theme))
    }
    for (const button of document.querySelectorAll('button[data-density]')) {
      button.setAttribute('aria-checked', String(button.dataset.density === state.prefs.density))
    }
    for (const button of document.querySelectorAll('button[data-font]')) {
      button.setAttribute('aria-checked', String(Number(button.dataset.font) === state.prefs.fontScale))
    }
    syncRadioGroups()
  }

  function syncRadioGroups() {
    for (const group of document.querySelectorAll('[role="radiogroup"]')) {
      const radios = [...group.querySelectorAll('[role="radio"]')]
      const enabled = radios.filter((radio) => !radio.disabled && radio.getAttribute('aria-disabled') !== 'true')
      const selected = enabled.find((radio) => radio.getAttribute('aria-checked') === 'true') || enabled[0]
      for (const radio of radios) radio.tabIndex = radio === selected ? 0 : -1
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return
    const radio = event.target.closest?.('[role="radio"]')
    const group = radio?.closest('[role="radiogroup"]')
    if (!group || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const radios = [...group.querySelectorAll('[role="radio"]')]
      .filter((item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true' && item.getClientRects().length)
    if (!radios.length) return
    event.preventDefault()
    event.stopPropagation()
    const current = radios.indexOf(radio)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1
      : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + radios.length) % radios.length
    const next = radios[index]
    next.click()
    syncRadioGroups()
    next.focus({ preventScroll: true })
  })

  function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.content = effectiveDark() ? '#212121' : '#ffffff'
  }

  const THEME_ORDER = ['auto', 'light', 'dark']
  const THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' }

  function applyTheme(theme) {
    const next = THEME_ORDER.includes(theme) ? theme : 'auto'
    state.theme = next
    if (next === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = next
    localStorage.setItem('dsh.theme', next)
    syncThemeColor()
    updateThemeButton()
  }

  function updateThemeButton() {
    if (!els.themeBtn) return
    const label = THEME_LABEL[state.theme] || '跟随系统'
    els.themeBtn.setAttribute('aria-label', `外观：${label}。点击切换`)
    els.themeBtn.title = `外观：${label}（点击切换）`
    els.themeBtn.dataset.mode = state.theme
  }

  function cycleTheme() {
    const index = THEME_ORDER.indexOf(state.theme)
    const next = THEME_ORDER[(index + 1) % THEME_ORDER.length]
    applyTheme(next)
    showToast(`外观：${THEME_LABEL[next]}`, { icon: next === 'dark' ? 'i-moon' : 'i-sun' })
  }

  function effectiveDark() {
    if (state.theme === 'dark') return true
    if (state.theme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  function setDocumentTitle(title) {
    state.baseTitle = title || 'DSH Chat'
    const busy = Boolean(state.streaming) || state.unread
    document.title = `${busy ? '● ' : ''}${state.baseTitle}`
    const link = document.querySelector('link[rel="icon"]')
    if (link) {
      const busyHref = '/favicon-active.svg'
      if (busy && !link.dataset.busy) {
        link.dataset.idle = link.getAttribute('href') || '/favicon.svg'
        link.setAttribute('href', busyHref)
        link.dataset.busy = '1'
      } else if (!busy && link.dataset.busy) {
        link.setAttribute('href', link.dataset.idle || '/favicon.svg')
        delete link.dataset.busy
      }
    }
  }

  function markUnread() {
    if (!document.hidden) return
    state.unread = true
    setDocumentTitle(state.baseTitle)
    try {
      navigator.setAppBadge?.(1)
    } catch {}
    notifyCompletion()
  }

  function clearUnread() {
    if (!state.unread) return
    state.unread = false
    setDocumentTitle(state.baseTitle)
    try {
      navigator.clearAppBadge?.()
    } catch {}
  }

  const desktopQuery = window.matchMedia('(min-width: 1024px)')
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') syncThemeColor()
  })

  function setSidebarA11y() {
    if (!els.sidebar) return
    if (desktopQuery.matches) {
      const collapsed = document.body.classList.contains('sidebar-collapsed')
      els.sidebar.inert = collapsed
      els.sidebar.setAttribute('aria-hidden', collapsed ? 'true' : 'false')
      els.menuBtn.setAttribute('aria-expanded', String(!collapsed))
    } else {
      const open = document.body.classList.contains('sidebar-open')
      els.sidebar.inert = !open
      els.sidebar.setAttribute('aria-hidden', open ? 'false' : 'true')
      els.menuBtn.setAttribute('aria-expanded', String(open))
    }
  }

  function openSidebar() {
    if (desktopQuery.matches) document.body.classList.remove('sidebar-collapsed')
    else document.body.classList.add('sidebar-open')
    if (!desktopQuery.matches) localStorage.setItem('dsh.sidebar', 'open')
    setSidebarA11y()
    if (!desktopQuery.matches) {
      const active = els.convList.querySelector('.conv-item.active .conv-main')
      ;(active || els.newChat).focus({ preventScroll: true })
    }
  }

  function closeSidebar() {
    const active = document.activeElement
    if (desktopQuery.matches) document.body.classList.add('sidebar-collapsed')
    else document.body.classList.remove('sidebar-open')
    localStorage.setItem('dsh.sidebar', desktopQuery.matches ? 'collapsed' : 'closed')
    setSidebarA11y()
    if (active && els.sidebar.contains(active)) els.menuBtn.focus({ preventScroll: true })
  }

  function toggleSidebar() {
    if (desktopQuery.matches) {
      document.body.classList.toggle('sidebar-collapsed')
      localStorage.setItem(
        'dsh.sidebar',
        document.body.classList.contains('sidebar-collapsed') ? 'collapsed' : 'open',
      )
      setSidebarA11y()
    } else {
      if (document.body.classList.contains('sidebar-open')) closeSidebar()
      else openSidebar()
    }
  }

  function restoreSidebar() {
    if (desktopQuery.matches) {
      document.body.classList.toggle(
        'sidebar-collapsed',
        localStorage.getItem('dsh.sidebar') === 'collapsed',
      )
      document.body.classList.remove('sidebar-open')
    } else {
      document.body.classList.remove('sidebar-open', 'sidebar-collapsed')
    }
    setSidebarA11y()
  }

  /* ── auth ──────────────────────────────────────────────────────────── */

  function showLogin() {
    state.navigationRequest += 1
    state.authed = false
    clearCache()
    const wasHidden = els.loginView.hidden
    els.shell.hidden = true
    els.loginView.hidden = false
    setDocumentTitle('DSH Chat')
    if (wasHidden) setTimeout(() => els.accessCode.focus(), 60)
  }

  async function enterApp() {
    els.loginView.hidden = true
    els.shell.hidden = false
    state.authed = true
    els.logoutBtn.hidden = !state.authRequired
    document.body.classList.remove('sidebar-open')
    restoreSidebar()
    setModelLabels()
    if (!state.currentId) els.topbarName.textContent = 'DSH Chat'
    if (desktopQuery.matches) els.input.focus({ preventScroll: true })

    try {
      await refreshConversations()
      setConnection('online')
    } catch (error) {
      if (isNetworkError(error)) {
        setConnection('offline')
        scheduleInitRetry()
        if (state.currentId) {
          scheduleCacheSave()
          return
        }
        showEmptyChat()
        scheduleCacheSave()
        return
      }
      throw error
    }

    const routeId = routeConversationId()
    const saved = localStorage.getItem('dsh.current')
    if (routeId) {
      await openConversation(routeId, { skipStop: true, fromRoute: true })
      if (state.currentId === routeId) return
      showToast('链接里的对话不存在，已打开上次的对话', { tone: 'error' })
    }
    const target = saved && state.conversations.some((conv) => conv.id === saved) ? saved : null
    if (target) {
      await openConversation(target, { skipStop: true, fromRoute: false })
    } else if (state.currentId) {
      showEmptyChat()
    } else {
      showEmptyChat()
    }
  }

  function setModelLabels() {
    const codex = state.currentEngine === 'codex'
    const native = Boolean(state.native)
    els.modelName.textContent = codex ? 'Codex' : state.model
    els.topbarSub.textContent = codex ? 'Codex · app-server' : state.model
    els.modelName.title = codex ? 'Codex Desktop app-server（workspace-write 沙箱）' : state.model
    els.modeBadge.textContent = codex ? 'Codex' : native ? '原生' : 'Headless'
    els.modeBadge.classList.toggle('headless', !native && !codex)
    els.modeBadge.classList.toggle('codex', codex)
    els.modeBadge.title = codex
      ? 'Codex 引擎 · Desktop app-server · workspace-write · token 流式'
      : native
        ? '原生会话：与桌面版共享同一份会话列表'
        : 'Headless 模式：桌面版桥接未连接'
    if (els.detailConnection) {
      els.detailConnection.textContent = codex
        ? 'Codex app-server'
        : native
          ? '桌面版已连接'
          : 'Headless 兜底'
    }
    if (els.detailEngine) els.detailEngine.textContent = codex ? 'Codex' : 'DSH'
    if (els.detailModel) els.detailModel.textContent = codex ? 'Codex app-server' : state.model
    if (els.heroStatus) {
      els.heroStatus.textContent = codex
        ? 'Codex 桌面在线'
        : native
          ? 'DSH 桌面连接正常'
          : 'Headless 模式 · 部分能力不可用'
      els.heroStatus.title = '这里只表示与桌面版的连接状态，不代表每个引擎都能执行所有操作'
    }
    if (els.heroDot) {
      els.heroDot.classList.toggle('offline', !native && !codex)
      els.heroDot.classList.toggle('codex', codex)
    }
    const chip = els.modelName.closest('.model-chip')
    if (chip) {
      chip.classList.toggle('headless', !native && !codex)
      chip.classList.toggle('codex', codex)
      chip.title = codex
        ? 'Codex · workspace-write 沙箱 · 点按查看运行方式'
        : native
          ? '原生会话 · 与桌面版同步 · 点按查看运行方式'
          : 'Headless 兜底模式 · 点按查看运行方式'
    }
    if (els.sharedBadge) {
      els.sharedBadge.textContent = state.shared ? '跨设备共享' : '仅本设备'
      els.sharedBadge.title = state.shared
        ? '所有登录设备共享同一份会话列表，切设备可继续'
        : '当前为按浏览器隔离模式'
    }
    if (els.engineDsr) {
      els.engineDsr.classList.toggle('active', !codex)
      els.engineDsr.setAttribute('aria-checked', String(!codex))
    }
    if (els.engineCodex) {
      els.engineCodex.classList.toggle('active', codex)
      els.engineCodex.setAttribute('aria-checked', String(codex))
      els.engineCodex.disabled = !state.codexAvailable
      els.engineCodex.title = state.codexAvailable
        ? 'Codex Desktop app-server · workspace-write · token 流式'
        : '本机未找到 Codex CLI'
    }
    if (els.engineHint) {
      els.engineHint.textContent = codex
        ? '独立工作区与模型'
        : native
          ? '共享桌面会话与文件'
          : 'Headless · 能力受限'
    }
    if (els.emptyHintText) {
      els.emptyHintText.textContent = codex
        ? 'Codex 工作区 · 文件可下载 · app-server'
        : '本地运行 · 文件可下载 · 与桌面版同步'
    }
  }

  function updateEngineBar() {
    if (!els.engineBar) return
    els.engineBar.hidden = state.messages.length > 0 || Boolean(state.streaming)
    syncRadioGroups()
  }

  /* ── compact info popovers (title, engine, connection) ─────────────── */

  function closeChatInfo({ restoreFocus = false } = {}) {
    if (!els.chatInfo || els.chatInfo.hidden) return
    els.chatInfo.hidden = true
    els.chatInfoBtn?.setAttribute('aria-expanded', 'false')
    if (restoreFocus) els.chatInfoBtn?.focus({ preventScroll: true })
  }

  function openChatInfo() {
    if (!els.chatInfo || !els.chatInfoBtn) return
    const codex = state.currentEngine === 'codex'
    const native = Boolean(state.native)
    const permission = PERMISSION_META[state.permission] || {}
    const title = (els.topbarName.textContent || 'DSH Chat').trim()
    els.chatInfoFullTitle.textContent = title
    els.chatInfoEngine.textContent = codex ? 'Codex' : 'DSH'
    els.chatInfoModel.textContent = codex ? 'Codex app-server' : state.model
    els.chatInfoMode.textContent = codex
      ? 'Codex app-server · 独立工作区'
      : native
        ? '原生 · 与桌面版共享会话'
        : 'Headless 兜底 · 部分能力不可用'
    els.chatInfoPermission.textContent = permission.label || state.permission || '标准'
    els.chatInfo.hidden = false
    els.chatInfoBtn.setAttribute('aria-expanded', 'true')
    els.chatInfoClose?.focus({ preventScroll: true })
  }

  function closeConnectionDetail({ restoreFocus = false } = {}) {
    if (!els.connectionDetail || els.connectionDetail.hidden) return
    els.connectionDetail.hidden = true
    els.statusBtn?.setAttribute('aria-expanded', 'false')
    if (restoreFocus) els.statusBtn?.focus({ preventScroll: true })
  }

  function toggleConnectionDetail() {
    if (!els.connectionDetail || !els.statusBtn) return
    const open = els.connectionDetail.hidden
    closeEngineInfo()
    closeChatInfo()
    els.connectionDetail.hidden = !open
    els.statusBtn.setAttribute('aria-expanded', String(open))
    if (open) {
      setModelLabels()
      requestAnimationFrame(() => {
        els.connectionDetail.querySelector('button, a, [tabindex]')?.focus?.({ preventScroll: true })
      })
    }
  }

  function closeEngineInfo() {
    if (!els.engineInfo || els.engineInfo.hidden) return
    els.engineInfo.hidden = true
    els.engineInfoBtn?.setAttribute('aria-expanded', 'false')
  }

  function toggleEngineInfo() {
    if (!els.engineInfo || !els.engineInfoBtn) return
    const open = els.engineInfo.hidden
    closeChatInfo()
    closeConnectionDetail()
    els.engineInfo.hidden = !open
    els.engineInfoBtn.setAttribute('aria-expanded', String(open))
  }


  const CACHE_KEY = 'dsh.cache.v1'

  function isNetworkError(error) {
    if (!error) return false
    if (error.name === 'NetworkError') return true
    const message = String(error.message || '')
    return /load failed|failed to fetch|network\s*error|network request failed|internet connection appears to be offline/i.test(
      message,
    )
  }

  function networkError(cause) {
    const error = new Error('网络连接中断')
    error.name = 'NetworkError'
    error.cause = cause
    return error
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function fetchWithRetry(url, options = {}, attempts = 4) {
    let last
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await fetch(url, options)
      } catch (error) {
        if (!isNetworkError(error)) throw error
        last = error
        if (attempt < attempts - 1) await sleep(450 * Math.pow(1.8, attempt))
      }
    }
    throw networkError(last)
  }

  let connectionTimer = null

  function retryConnection() {
    setConnection('connecting', '正在重新连接…')
    void refreshConversations()
      .then(() => setConnection('online'))
      .catch(() => setConnection('offline'))
    void resumeConnection()
  }

  function ensureConnectionExtras() {
    if (!els.reconnectBar) return
    if (!els.reconnectBar.querySelector('.reconnect-since')) {
      const since = document.createElement('span')
      since.className = 'reconnect-since'
      els.reconnectBar.appendChild(since)
    }
    let retry = els.reconnectBar.querySelector('.reconnect-retry')
    if (!retry) {
      retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'reconnect-retry'
      retry.textContent = '立即重试'
      els.reconnectBar.appendChild(retry)
    }
    if (!retry.dataset.wired) {
      retry.dataset.wired = '1'
      retry.addEventListener('click', retryConnection)
    }
  }

  function refreshConnectionSince() {
    const since = els.reconnectBar?.querySelector('.reconnect-since')
    if (!since) return
    const seconds = Math.max(0, Math.round((Date.now() - state.lastSync) / 1000))
    since.textContent = seconds < 60 ? `${seconds}s 前同步` : `${Math.floor(seconds / 60)}m 前同步`
  }

  function setConnection(kind, text) {
    state.connection = kind
    if (!els.reconnectBar) return
    if (kind === 'online') {
      els.reconnectBar.hidden = true
      clearInterval(connectionTimer)
      connectionTimer = null
      state.lastSync = Date.now()
      return
    }
    ensureConnectionExtras()
    els.reconnectBar.hidden = false
    els.reconnectBar.classList.toggle('offline', kind === 'offline')
    els.reconnectText.textContent =
      text || (kind === 'offline' ? '网络中断，正在重新连接…' : '正在同步…')
    refreshConnectionSince()
    clearInterval(connectionTimer)
    connectionTimer = setInterval(refreshConnectionSince, 1000)
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!data || data.v !== 1 || !data.authed) return null
      return data
    } catch {
      return null
    }
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {}
  }

  function cacheMessages() {
    const messages = Array.isArray(state.messages) ? state.messages : []
    return messages.length > 40 ? messages.slice(-40) : messages
  }

  function cachedMessagesForWrite() {
    const messages = cacheMessages()
    const view = state.streaming?.view
    if (!view || !state.currentId) return messages
    const text = [...view.blocksEl.querySelectorAll('.md')]
      .map((node) => node.innerText.trim())
      .filter(Boolean)
      .join('\n\n')
    if (!text) return messages
    const copy = messages.slice()
    const last = copy[copy.length - 1]
    if (last?.role === 'assistant' && last.status === 'running') {
      copy[copy.length - 1] = {
        ...last,
        text,
        blocks: [{ type: 'text', text }],
        status: 'running',
      }
    } else {
      copy.push({
        id: 'cache_live',
        role: 'assistant',
        text,
        blocks: [{ type: 'text', text }],
        status: 'running',
        createdAt: Date.now(),
      })
    }
    return copy
  }

  function writeCache() {
    if (!state.authed) return
    const current = state.currentId
      ? {
          id: state.currentId,
          title: els.topbarName.textContent || 'DSH Chat',
          messages: cachedMessagesForWrite(),
          permission: state.permission,
          updatedAt: Date.now(),
        }
      : null
    const payload = {
      v: 1,
      authed: true,
      at: Date.now(),
      model: state.model,
      native: state.native,
      nativeEnabled: state.nativeEnabled,
      shared: state.shared,
      engine: state.currentEngine,
      permission: state.permission,
      conversations: state.conversations,
      current: current
        ? { ...current, engine: state.currentEngine, permission: state.permission }
        : null,
    }
    try {
      let raw = JSON.stringify(payload)
      if (raw.length > 4_200_000 && current) {
        payload.current.messages = current.messages.slice(-10)
        raw = JSON.stringify(payload)
      }
      if (raw.length <= 4_600_000) localStorage.setItem(CACHE_KEY, raw)
    } catch {}
  }

  function scheduleCacheSave() {
    if (!state.authed) return
    clearTimeout(state.cacheTimer)
    state.cacheTimer = setTimeout(writeCache, 420)
  }

  function scheduleInitRetry() {
    if (state.initRetryTimer) return
    state.initRetryTimer = setTimeout(() => {
      state.initRetryTimer = null
      void init()
    }, 2600)
  }

  function scheduleAttachRetry(conversationId, messageId, attempt = 1) {
    if (state.attachRetryTimer) clearTimeout(state.attachRetryTimer)
    if (document.hidden) {
      state.attachRetryTimer = null
      return
    }
    const delay = Math.min(1200 * Math.pow(1.7, Math.min(attempt - 1, 4)), 8000)
    state.attachRetryTimer = setTimeout(() => {
      state.attachRetryTimer = null
      if (state.currentId !== conversationId || state.streaming) return
      void attachRun(conversationId, messageId, attempt)
    }, delay)
  }

  function scheduleConversationRetry(id) {
    if (state.refreshRetryTimer) clearTimeout(state.refreshRetryTimer)
    state.refreshRetryTimer = setTimeout(() => {
      state.refreshRetryTimer = null
      if (document.hidden) return
      if (state.currentId !== id || state.streaming) return
      void openConversation(id, { skipAttach: false })
    }, 2200)
  }

  function applyCachedShell(cache) {
    state.authed = true
    state.model = cache.model || state.model
    state.native = Boolean(cache.native)
    state.nativeEnabled = cache.nativeEnabled !== false
    state.shared = Boolean(cache.shared)
    state.engine = cache.engine === 'codex' ? 'codex' : state.engine
    state.currentEngine =
      cache.current?.engine === 'codex' || (!cache.current && state.engine === 'codex')
        ? 'codex'
        : 'dsr'
    state.permission = cache.current?.permission || cache.permission || 'workspace-write'
    state.conversations = Array.isArray(cache.conversations) ? cache.conversations : []
    els.loginView.hidden = true
    els.shell.hidden = false
    restoreSidebar()
    setModelLabels()
    updateEngineBar()
    renderConversations()
    if (cache.current?.id) {
      state.currentId = cache.current.id
      // Hydrate this conversation's input before authenticated navigation can
      // save it; the initial empty textarea must not erase a persisted draft.
      restoreDraft()
      state.messages = Array.isArray(cache.current.messages) ? cache.current.messages : []
      els.topbarName.textContent = cache.current.title || 'DSH Chat'
      setDocumentTitle(cache.current.title || 'DSH Chat')
      renderMessages(state.messages)
      els.emptyState.hidden = true
      els.thread.hidden = false
    } else {
      // Cached paint is provisional: preserve an incoming deep link until the
      // authenticated refresh has resolved it.
      showEmptyChat({ updateRoute: false })
    }
    updateEngineBar()
    updatePermissionUI()
  }

  async function init() {
    applyTheme(state.theme)
    applyPrefs()
    const cache = readCache()
    if (cache && els.shell.hidden) {
      applyCachedShell(cache)
      setConnection('connecting')
    }

    let response
    try {
      response = await fetchWithRetry('/api/me', { credentials: 'same-origin' }, 4)
    } catch (error) {
      if (!isNetworkError(error)) {
        if (cache || state.authed) {
          setConnection('offline')
          scheduleInitRetry()
          return
        }
        showLogin()
        els.loginError.textContent = '无法连接服务器，请稍后重试'
        els.loginError.hidden = false
        scheduleInitRetry()
        return
      }
      if (cache || state.authed) {
        setConnection('offline')
        scheduleInitRetry()
        return
      }
      showLogin()
      els.loginError.textContent = '正在连接服务器…'
      els.loginError.hidden = false
      scheduleInitRetry()
      return
    }

    if (response.status === 401) {
      showLogin()
      return
    }

    let me
    try {
      me = await response.json()
    } catch {
      if (cache || state.authed) {
        setConnection('offline')
        scheduleInitRetry()
        return
      }
      showLogin()
      els.loginError.textContent = '正在连接服务器…'
      els.loginError.hidden = false
      scheduleInitRetry()
      return
    }

    state.authRequired = !!me.authRequired
    els.logoutBtn.hidden = !state.authRequired
    state.model = me.model || 'DeepSeek Harness'
    state.native = Boolean(me.native)
    state.nativeEnabled = me.nativeEnabled !== false
    state.codexAvailable = Boolean(me.codex)
    state.shared = Boolean(me.shared)
    applyMemorySummary(me.memory)
    if (!me.authenticated) {
      showLogin()
      return
    }

    state.authed = true
    if (!state.currentId && typeof me.permission === 'string') state.permission = me.permission
    setModelLabels()
    updateEngineBar()
    updatePermissionUI()
    void loadPermissionCatalog()
    clearTimeout(state.initRetryTimer)
    state.initRetryTimer = null
    setConnection('online')
    if (!els.shell.hidden) {
      setConnection('online')
      await resumeConnection()
      return
    }
    try {
      await enterApp()
    } catch (error) {
      if (isNetworkError(error)) {
        setConnection('offline')
        scheduleInitRetry()
        return
      }
      showToast(error.message || '加载失败')
    }
  }

  async function resumeConnection() {
    if (state.resuming || document.hidden) return
    if (!els.loginView.hidden) {
      await init()
      return
    }
    state.resuming = true
    try {
      setConnection('connecting')
      try {
        await refreshConversations()
      } catch (error) {
        if (isNetworkError(error)) {
          setConnection('offline')
          scheduleInitRetry()
          return
        }
      }
      setConnection('online')
      const routeId = routeConversationId()
      if (routeId && routeId !== state.currentId && !state.streaming) {
        await openConversation(routeId, { fromRoute: true })
        return
      }
      if (!state.currentId || state.streaming) return
      if (state.pendingSend && state.pendingSend.conversationId === state.currentId) return
      let summary = state.conversations.find((conv) => conv.id === state.currentId)
      if (!summary) {
        // A search result can be outside the first page of the sidebar.
        // Absence from that page is not evidence that it was deleted.
        const id = state.currentId
        try {
          const data = await api(`/api/conversations/${id}?summary=1`)
          if (state.currentId !== id) return
          summary = data.conversation
        } catch (error) {
          if (error.status === 404 && state.currentId === id) showEmptyChat()
          return
        }
      }
      if (summary.running) {
        const data = await api(`/api/conversations/${state.currentId}`)
        state.messages = data.conversation.messages || []
        const running = [...state.messages]
          .reverse()
          .find((message) => message.role === 'assistant' && message.status === 'running')
        if (running) {
          els.topbarName.textContent = data.conversation.title || 'DSH Chat'
          renderMessages(state.messages)
          void attachRun(state.currentId, running.id)
        }
      } else {
        await openConversation(state.currentId, { skipAttach: false })
      }
    } catch (error) {
      if (isNetworkError(error)) {
        setConnection('offline')
        if (state.currentId) scheduleConversationRetry(state.currentId)
      }
    } finally {
      state.resuming = false
    }
  }

  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const code = els.accessCode.value.trim()
    if (!code) return
    els.loginBtn.disabled = true
    els.loginBtn.textContent = '验证中…'
    els.loginError.hidden = true
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '访问码不正确')
      els.accessCode.value = ''
      await enterApp()
    } catch (err) {
      if (isNetworkError(err)) {
        setConnection('offline', '网络中断，正在等待恢复…')
        els.loginError.textContent = '网络连接中断，请稍后重试'
      } else {
        els.loginError.textContent = err.message || '登录失败'
      }
      els.loginError.hidden = false
      els.accessCode.select()
    } finally {
      els.loginBtn.disabled = false
      els.loginBtn.textContent = '进入对话'
    }
  })

  els.logoutBtn.addEventListener('click', async () => {
    els.logoutBtn.disabled = true
    try {
      const response = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error('退出失败，请重试')
      state.authed = false
      clearCache()
      location.reload()
    } catch {
      showToast('未能退出登录，请检查连接后重试', { tone: 'error' })
      els.logoutBtn.disabled = false
    }
  })

  /* ── API ───────────────────────────────────────────────────────────── */

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase()
    const retry = options.retry ?? (method === 'GET')
    const request = {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    }
    let res
    try {
      res = retry ? await fetchWithRetry(path, request, 4) : await fetch(path, request)
    } catch (error) {
      if (isNetworkError(error)) {
        setConnection('offline')
        throw networkError(error)
      }
      throw error
    }
    if (res.status === 401) {
      showLogin()
      throw new Error('登录已失效，请重新输入访问码')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(data.error || `请求失败（${res.status}）`), { status: res.status })
    state.lastSync = Date.now()
    setConnection('online')
    return data
  }

  let conversationListVersion = 0
  let conversationRefreshVersion = 0
  let conversationSearchVersion = 0
  let conversationSearchPending = false
  let conversationPageRequest = null

  function invalidateConversationPage() {
    conversationListVersion += 1
    conversationPageRequest?.controller.abort()
    conversationPageRequest = null
    els.convLoadMore.disabled = false
  }

  function invalidateConversationSearch() {
    conversationSearchVersion += 1
    conversationSearchPending = false
    invalidateConversationPage()
  }

  // Empty queries do not reach scheduleSearch. Invalidate these transitions
  // as well so A → empty → A cannot revive an earlier pagination response.
  els.convSearch.addEventListener('input', () => {
    if (!els.convSearch.value.trim()) invalidateConversationSearch()
  }, true)
  els.convSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.convSearch.value) invalidateConversationSearch()
  }, true)
  els.convSearchClear.addEventListener('click', invalidateConversationSearch, true)

  async function refreshConversations() {
    const version = ++conversationRefreshVersion
    invalidateConversationPage()
    const data = await api('/api/conversations?limit=60')
    if (version !== conversationRefreshVersion) return
    const incoming = data.conversations || []
    state.conversations = incoming
    if (state.currentId && !incoming.some((conv) => conv.id === state.currentId)) {
      try {
        const probe = await fetch(`/api/conversations/${state.currentId}`, { credentials: 'same-origin' })
        if (version !== conversationRefreshVersion) return
        if (probe.status === 404) {
          showEmptyChat()
          state.lastSync = Date.now()
          return
        }
      } catch {}
    }
    state.convHasMore = Boolean(data.hasMore)
    state.convTotal = Number(data.total) || state.conversations.length
    const current = state.currentId
      ? state.conversations.find((conv) => conv.id === state.currentId)
      : null
    if (current && current.permission && current.permission !== state.permission) {
      state.permission = current.permission
      updatePermissionUI()
    }
    if (state.search.trim()) await runSearch({ silent: true })
    else renderConversations()
    state.lastSync = Date.now()
    scheduleCacheSave()
  }

  async function loadMoreConversations() {
    if (conversationPageRequest || conversationSearchPending) return
    const query = state.search.trim()
    const offset = query ? state.searchResults.length : state.conversations.length
    const version = conversationListVersion
    const request = { controller: new AbortController() }
    conversationPageRequest = request
    const current = () => conversationPageRequest === request && version === conversationListVersion && query === state.search.trim()
    els.convLoadMore.disabled = true
    try {
      const path = query
        ? `/api/conversations?q=${encodeURIComponent(query)}&limit=60&offset=${offset}`
        : `/api/conversations?limit=60&offset=${offset}`
      const data = await api(path, { signal: request.controller.signal })
      if (!current()) return
      const incoming = data.conversations || []
      if (query) {
        const seen = new Set(state.searchResults.map((conv) => conv.id))
        state.searchResults.push(...incoming.filter((conv) => !seen.has(conv.id)))
        state.searchHasMore = Boolean(data.hasMore)
        state.searchTotal = Number(data.total) || state.searchResults.length
      } else {
        const seen = new Set(state.conversations.map((conv) => conv.id))
        state.conversations.push(...incoming.filter((conv) => !seen.has(conv.id)))
        state.convHasMore = Boolean(data.hasMore)
        state.convTotal = Number(data.total) || state.conversations.length
      }
      renderConversations()
    } catch (error) {
      if (current() && error.name !== 'AbortError') showToast(error.message || '加载失败', { tone: 'error' })
    } finally {
      if (conversationPageRequest === request) {
        conversationPageRequest = null
        els.convLoadMore.disabled = false
      }
    }
  }

  async function runSearch({ silent = false } = {}) {
    invalidateConversationSearch()
    const version = conversationSearchVersion
    const query = state.search.trim()
    if (!query) {
      state.searchResults = []
      state.searchTotal = 0
      state.searchHasMore = false
      renderConversations()
      return
    }
    conversationSearchPending = true
    els.convLoadMore.disabled = true
    try {
      const data = await api(`/api/conversations?q=${encodeURIComponent(query)}&limit=60`)
      if (state.search.trim() !== query || version !== conversationSearchVersion) return
      state.searchResults = data.conversations || []
      state.searchTotal = Number(data.total) || state.searchResults.length
      state.searchHasMore = Boolean(data.hasMore)
      renderConversations()
    } catch (error) {
      if (!silent && version === conversationSearchVersion && state.search.trim() === query) showToast(error.message || '搜索失败', { tone: 'error' })
    } finally {
      if (version === conversationSearchVersion) {
        conversationSearchPending = false
        if (!conversationPageRequest) els.convLoadMore.disabled = false
      }
    }
  }

  function scheduleSearch() {
    invalidateConversationSearch()
    conversationSearchPending = true
    els.convLoadMore.disabled = true
    clearTimeout(state.searchTimer)
    state.searchTimer = setTimeout(() => void runSearch(), 240)
  }

  /* ── conversation list ─────────────────────────────────────────────── */

  function conversationItem(conv) {
    const item = document.createElement('div')
    item.className =
      'conv-item' +
      (conv.id === state.currentId ? ' active' : '') +
      (state.selectMode ? ' selecting' : '') +
      (state.selected.has(conv.id) ? ' selected' : '')
    item.dataset.id = conv.id

    const main = document.createElement('button')
    main.type = 'button'
    main.className = 'conv-main'
    main.dataset.action = 'open'
    if (conv.id === state.currentId) main.setAttribute('aria-current', 'true')

    const title = document.createElement('span')
    title.className = 'conv-title'
    if (conv.pinned) {
      const pin = document.createElement('span')
      pin.className = 'conv-pin-dot'
      pin.innerHTML = icon('i-pin')
      title.appendChild(pin)
    }
    const label = document.createElement('span')
    if (state.search.trim()) appendHighlighted(label, conv.title || '新对话', state.search.trim())
    else label.textContent = conv.title || '新对话'
    title.appendChild(label)
    if (isConversationUnread(conv)) {
      const dot = document.createElement('span')
      dot.className = 'conv-unread'
      dot.title = '有新内容'
      title.appendChild(dot)
    }
    title.title = conv.title || '新对话'

    main.append(title)

    if (!state.search.trim() && conv.preview) {
      const preview = document.createElement('span')
      preview.className = 'conv-preview'
      preview.textContent = conv.preview
      main.appendChild(preview)
    }

    if (state.search.trim() && conv.snippet) {
      const snippetText = String(conv.snippet).trim()
      const titleText = String(conv.title || '').trim()
      if (snippetText && snippetText !== titleText) {
        const snippet = document.createElement('span')
        snippet.className = 'conv-snippet'
        const kind = document.createElement('span')
        kind.className = 'conv-hit'
        kind.textContent = '正文'
        const hit = document.createElement('span')
        hit.className = 'conv-hit-text'
        appendHighlighted(hit, snippetText, state.search.trim())
        snippet.append(kind, hit)
        main.appendChild(snippet)
      }
    }

    const meta = document.createElement('span')
    meta.className = 'conv-meta'
    const engineLabel = conv.engine === 'codex' ? 'Codex · ' : ''
    const count = Number(conv.messageCount) || 0
    meta.textContent = conv.running
      ? `${engineLabel}正在生成…`
      : `${engineLabel}${relativeTime(conv.updatedAt)}`
    if (count) meta.title = `${count} 条消息`
    main.append(meta)

    main.addEventListener('dblclick', (event) => {
      event.preventDefault()
      openRename(conv.id)
    })

    const more = document.createElement('button')
    more.type = 'button'
    more.className = 'conv-more'
    more.dataset.action = 'menu'
    more.setAttribute('aria-label', `更多操作：${conv.title || '新对话'}`)
    more.setAttribute('aria-haspopup', 'menu')
    more.setAttribute('aria-expanded', 'false')
    more.innerHTML = icon('i-more')

    item.append(main, more)
    return item
  }

  function appendHighlighted(container, text, query) {
    const source = String(text || '')
    if (!query) {
      container.textContent = source
      return
    }
    const lower = source.toLowerCase()
    const needle = query.toLowerCase()
    let cursor = 0
    let at = lower.indexOf(needle)
    if (at < 0) {
      container.textContent = source
      return
    }
    while (at >= 0) {
      if (at > cursor) container.appendChild(document.createTextNode(source.slice(cursor, at)))
      const mark = document.createElement('mark')
      mark.textContent = source.slice(at, at + needle.length)
      container.appendChild(mark)
      cursor = at + needle.length
      at = lower.indexOf(needle, cursor)
    }
    if (cursor < source.length) container.appendChild(document.createTextNode(source.slice(cursor)))
  }

  function renderConversations() {
    const query = state.search.trim()
    const source = query ? state.searchResults : state.conversations
    const scroller = els.convList.closest('.conv-scroll')
    if (scroller && query && state.lastRenderedQuery !== query) {
      // A new query must start at its first result, not at the previous
      // list's scroll offset.
      scroller.scrollTop = 0
    }
    state.lastRenderedQuery = query
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayStart = startOfToday.getTime()
    const pinned = []
    const groups = [
      ['今天', []],
      ['昨天', []],
      ['更早', []],
    ]
    if (query) {
      groups.length = 0
      groups.push([`搜索结果`, source])
    } else {
      for (const conv of source) {
        if (conv.pinned) {
          pinned.push(conv)
          continue
        }
        const updated = conv.updatedAt || 0
        if (updated >= todayStart) groups[0][1].push(conv)
        else if (updated >= todayStart - 86_400_000) groups[1][1].push(conv)
        else groups[2][1].push(conv)
      }
    }

    els.convList.replaceChildren()
    if (!query && pinned.length) {
      const groupLabel = document.createElement('div')
      groupLabel.className = 'conv-group pinned'
      groupLabel.textContent = '置顶'
      els.convList.appendChild(groupLabel)
      for (const conv of pinned) els.convList.appendChild(conversationItem(conv))
    }
    for (const [label, items] of groups) {
      if (!items.length) continue
      if (!query) {
        const groupLabel = document.createElement('div')
        groupLabel.className = 'conv-group'
        groupLabel.textContent = label
        els.convList.appendChild(groupLabel)
      }
      for (const conv of items) els.convList.appendChild(conversationItem(conv))
    }

    const hasAny = (query ? state.searchResults : state.conversations).length > 0
    els.convEmpty.hidden = hasAny
    els.convEmpty.replaceChildren()
    if (!hasAny) {
      const text = document.createElement('span')
      text.textContent = query ? '没有匹配的对话' : '还没有对话记录'
      els.convEmpty.appendChild(text)
      if (query) {
        const actions = document.createElement('div')
        actions.className = 'conv-empty-actions'
        const clear = document.createElement('button')
        clear.type = 'button'
        clear.textContent = '清除搜索'
        clear.addEventListener('click', () => {
          els.convSearch.value = ''
          state.search = ''
          state.searchResults = []
          els.convSearchClear.hidden = true
          els.convResultCount.hidden = true
          void refreshConversations()
        })
        actions.appendChild(clear)
        els.convEmpty.appendChild(actions)
      }
    }

    els.convSearchClear.hidden = !query
    if (els.convHeading) els.convHeading.hidden = Boolean(query)
    if (query) {
      els.convResultCount.hidden = false
      els.convResultCount.textContent = `搜索结果 · ${state.searchTotal}${state.searchHasMore ? ' · 继续输入以缩小范围' : ''}`
    } else {
      els.convResultCount.hidden = true
    }
    els.convLoadMore.hidden = query ? !state.searchHasMore : !state.convHasMore
    els.convLoadMore.textContent = query ? '加载更多结果' : '加载更多对话'
    els.convLabel.hidden = true

    requestAnimationFrame(() => {
      const active = els.convList.querySelector('.conv-item.active')
      if (active && !query) active.scrollIntoView({ block: 'nearest' })
    })
  }

  async function patchConversation(id, patch) {
    const conv = state.conversations.find((item) => item.id === id) ||
      state.searchResults.find((item) => item.id === id)
    try {
      const data = await api(`/api/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      const saved = data.conversation
      for (const list of [state.conversations, state.searchResults]) {
        const item = list.find((entry) => entry.id === id)
        if (item) Object.assign(item, saved)
      }
      if (state.currentId === id && patch.title) {
        els.topbarName.textContent = saved.title
        setDocumentTitle(saved.title)
      }
      renderConversations()
      scheduleCacheSave()
      showToast(patch.title ? '标题已更新' : patch.pinned ? '已置顶' : '已更新')
      return conv
    } catch (error) {
      showToast(error.message || '操作失败', { tone: 'error' })
      renderConversations()
      return null
    }
  }

  function closeConvMenu({ restoreFocus = true } = {}) {
    if (!state.convMenuEl) return
    const el = state.convMenuEl
    const anchor = el.__anchor
    state.convMenuEl = null
    el.remove()
    if (anchor) anchor.setAttribute('aria-expanded', 'false')
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true })
  }

  let usagePopoverEl = null

  function closeUsagePopover() {
    if (!usagePopoverEl) return
    usagePopoverEl.remove()
    usagePopoverEl = null
  }

  function showUsagePopover(anchor, usage) {
    closeUsagePopover()
    const pop = document.createElement('div')
    pop.className = 'usage-pop'
    pop.setAttribute('role', 'dialog')
    pop.setAttribute('aria-label', 'Token 用量')
    const title = document.createElement('h4')
    title.textContent = '本轮用量'
    pop.appendChild(title)
    const rows = [
      ['输入', usage.inputTokens],
      ['输出', usage.outputTokens],
      ['缓存读取', usage.cacheReadTokens],
      ['缓存写入', usage.cacheWriteTokens],
      ['总计', usage.totalTokens],
      ['模型步数', usage.steps],
    ]
    for (const [label, value] of rows) {
      if (!value) continue
      const row = document.createElement('div')
      row.className = 'usage-row'
      const name = document.createElement('span')
      name.textContent = label
      const amount = document.createElement('b')
      amount.textContent = Number(value).toLocaleString('zh-CN')
      row.append(name, amount)
      pop.appendChild(row)
    }
    document.body.appendChild(pop)
    usagePopoverEl = pop
    const rect = anchor.getBoundingClientRect()
    const width = pop.offsetWidth || 210
    const height = pop.offsetHeight || 160
    let left = Math.min(rect.left, innerWidth - width - 10)
    left = Math.max(10, left)
    let top = rect.top - height - 8
    if (top < 10) top = rect.bottom + 8
    pop.style.left = `${left}px`
    pop.style.top = `${top}px`
  }

  async function copyConversationLink(id = state.currentId) {
    if (!id) return
    const url = `${location.origin}/c/${id}`
    const ok = await copyText(url)
    if (!ok) return showToast('复制失败', { tone: 'error' })
    showToast('对话链接已复制')
  }

  async function copyMessageLink(messageId) {
    if (!messageId || !state.currentId) return
    const url = `${location.origin}/c/${state.currentId}#m-${messageId}`
    const ok = await copyText(url)
    if (!ok) return showToast('复制失败', { tone: 'error' })
    showToast('消息链接已复制')
  }

  async function archiveConversation(id, archived = true) {
    try {
      await api(`/api/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      })
      if (archived && state.currentId === id) showEmptyChat()
      await refreshConversations()
      showToast(archived ? '已归档，可在「归档箱」找回' : '已恢复对话', {
        actionLabel: archived ? '撤销' : '',
        onAction: archived ? () => void archiveConversation(id, false) : null,
        duration: 6000,
      })
    } catch (error) {
      showToast(error.message || '归档失败', { tone: 'error' })
    }
  }

  async function duplicateConversation(id) {
    try {
      const data = await api(`/api/conversations/${id}/duplicate`, { method: 'POST' })
      await refreshConversations()
      showToast('已创建副本')
      if (data.conversation?.id) await openConversation(data.conversation.id)
    } catch (error) {
      showToast(error.message || '创建副本失败', { tone: 'error' })
    }
  }

  async function openStats(id = state.currentId) {
    if (!id) return
    try {
      const data = await api(`/api/conversations/${id}`)
      const conv = data.conversation
      const messages = conv.messages || []
      const assistants = messages.filter((msg) => msg.role === 'assistant')
      const users = messages.filter((msg) => msg.role === 'user')
      const tokens = assistants.reduce((sum, msg) => sum + (Number(msg.usage?.totalTokens) || 0), 0)
      const duration = assistants.reduce((sum, msg) => sum + (Number(msg.durationMs) || 0), 0)
      const files = new Set(assistants.flatMap((msg) => (msg.files || []).map((file) => file.path)))
      const rows = [
        ['标题', conv.title || '新对话'],
        ['消息', `${messages.length} 条（你 ${users.length} / 助手 ${assistants.length}）`],
        ['Token', tokens ? formatTokens(tokens) : '—'],
        ['总用时', duration ? formatDuration(duration) : '—'],
        ['产出文件', files.size ? `${files.size} 个` : '—'],
        ['引擎', conv.engine === 'codex' ? 'Codex' : 'DSH'],
        ['权限', permissionEntry(conv.permission).label],
        ['创建时间', new Date(conv.createdAt).toLocaleString('zh-CN', { hour12: false })],
        ['最近更新', new Date(conv.updatedAt).toLocaleString('zh-CN', { hour12: false })],
        ['会话 ID', conv.id.slice(0, 8)],
      ]
      els.statsList.replaceChildren()
      for (const [label, value] of rows) {
        const row = document.createElement('div')
        row.className = 'stats-row'
        const name = document.createElement('span')
        name.textContent = label
        const amount = document.createElement('b')
        amount.textContent = value
        row.append(name, amount)
        els.statsList.appendChild(row)
      }
      state.lastStatsFocus = document.activeElement
      els.statsModal.hidden = false
      lockShell(true)
      els.statsClose.focus()
    } catch (error) {
      showToast(error.message || '读取统计失败', { tone: 'error' })
    }
  }

  function closeStats() {
    if (!els.statsModal || els.statsModal.hidden) return
    els.statsModal.hidden = true
    lockShell(false)
    if (state.lastStatsFocus?.isConnected) state.lastStatsFocus.focus({ preventScroll: true })
  }

  function openConvMenu(id, anchor) {
    closeConvMenu({ restoreFocus: false })
    const conv = state.conversations.find((item) => item.id === id) ||
      state.searchResults.find((item) => item.id === id)
    if (!conv) return
    const menu = document.createElement('div')
    menu.className = 'conv-popover' + (window.innerWidth < 641 ? ' sheet-mode' : '')
    menu.id = 'convPopover'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', '对话操作')
    menu.__anchor = anchor

    const entries = [
      ['rename', 'i-edit', '重命名', () => openRename(id)],
      ['pin', 'i-pin', conv.pinned ? '取消置顶' : '置顶对话', () => void patchConversation(id, { pinned: !conv.pinned })],
      ['export', 'i-share', '导出 Markdown', () => void exportConversation(id)],
      ['link', 'i-external', '复制对话链接', () => void copyConversationLink(id)],
      ['duplicate', 'i-copy', '创建副本', () => void duplicateConversation(id)],
      ['stats', 'i-info', '对话统计', () => void openStats(id)],
      ['summarize', 'i-spark', '总结这段对话', () => void summarizeConversation(id)],
      ['archive', 'i-archive', '归档对话', () => void archiveConversation(id)],
      null,
      ['delete', 'i-trash', '删除对话', () => askDelete(id), true],
    ]
    for (const entry of entries) {
      if (!entry) {
        const sep = document.createElement('div')
        sep.className = 'conv-popover-sep'
        menu.appendChild(sep)
        continue
      }
      const [action, iconId, label, handler, danger] = entry
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'conv-popover-item' + (danger ? ' danger' : '')
      button.dataset.action = action
      button.setAttribute('role', 'menuitem')
      button.innerHTML = icon(iconId)
      const text = document.createElement('span')
      text.textContent = label
      button.appendChild(text)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        closeConvMenu({ restoreFocus: false })
        handler()
      })
      menu.appendChild(button)
    }

    document.body.appendChild(menu)
    state.convMenuEl = menu
    anchor.setAttribute('aria-expanded', 'true')
    if (window.innerWidth >= 641) {
      const rect = anchor.getBoundingClientRect()
      const width = 196
      const height = menu.offsetHeight || 230
      let left = Math.min(rect.right - width, window.innerWidth - width - 10)
      left = Math.max(10, left)
      let top = rect.bottom + 6
      if (top + height > window.innerHeight - 10) top = Math.max(10, rect.top - height - 6)
      menu.style.left = `${left}px`
      menu.style.top = `${top}px`
    }
    requestAnimationFrame(() => menu.querySelector('.conv-popover-item')?.focus({ preventScroll: true }))
  }

  function downloadText(filename, content, type = 'text/markdown;charset=utf-8') {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function safeFileStem(text) {
    return String(text || 'DSH-Chat').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'DSH-Chat'
  }

  async function exportConversation(id) {
    try {
      const data = await api(`/api/conversations/${id}`)
      const conv = data.conversation
      const lines = [`# ${conv.title || 'DSH Chat'}`, '']
      lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`)
      lines.push(`> 引擎：${conv.engine === 'codex' ? 'Codex' : 'DSH'} · 权限：${permissionEntry(conv.permission).label}`, '')
      for (const msg of conv.messages || []) {
        if (msg.role === 'user' && msg.internal) continue
        if (msg.role === 'user') {
          lines.push('## 我', '', msg.text || '', '')
          if (msg.attachments?.length) {
            lines.push(`附件：${msg.attachments.map((file) => file.path).join('、')}`, '')
          }
        } else if (msg.text || msg.blocks?.length) {
          lines.push('## 助手', '')
          const text = msg.text || (msg.blocks || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n')
          lines.push(text || '')
          if (msg.usage?.totalTokens) lines.push(`_用量：${formatTokens(msg.usage.totalTokens)} tokens_`)
          lines.push('')
        }
      }
      downloadText(`${safeFileStem(conv.title)}.md`, lines.join('\n'))
      showToast('已导出 Markdown')
    } catch (error) {
      showToast(error.message || '导出失败', { tone: 'error' })
    }
  }

  els.convList.addEventListener('click', (event) => {
    const item = event.target.closest('.conv-item')
    if (!item) return
    if (event.target.closest('.conv-rename-input')) return
    const action = event.target.closest('[data-action]')?.dataset.action
    if (action === 'delete') {
      askDelete(item.dataset.id)
      return
    }
    if (action === 'menu') {
      openConvMenu(item.dataset.id, event.target.closest('[data-action]'))
      return
    }
    if (state.selectMode) {
      toggleSelected(item.dataset.id)
      return
    }
    closeConvMenu({ restoreFocus: false })
    openConversation(item.dataset.id)
  })

  function askDelete(id) {
    const conv = state.conversations.find((c) => c.id === id) ||
      state.searchResults.find((c) => c.id === id)
    if (state.streaming && state.streaming.conversationId === id) stopStreaming()
    state.confirmAction = async () => {
      try {
        await api(`/api/conversations/${id}`, { method: 'DELETE' })
        state.conversations = state.conversations.filter((c) => c.id !== id)
        state.searchResults = state.searchResults.filter((c) => c.id !== id)
        if (state.currentId === id) {
          state.currentId = null
          state.messages = []
          localStorage.removeItem('dsh.current')
          showEmptyChat()
        }
        renderConversations()
        showToast('对话已删除', {
          icon: 'i-trash',
          actionLabel: '撤销',
          duration: 6500,
          onAction: async () => {
            try {
              await api(`/api/conversations/${id}/restore`, { method: 'POST' })
              await refreshConversations()
              showToast('已恢复对话')
            } catch (error) {
              showToast(error.message || '撤销失败', { tone: 'error' })
            }
          },
        })
      } catch (err) {
        showToast(err.message, { tone: 'error' })
      }
    }
    els.confirmBody.textContent = '对话内容将从服务器移除，可在 8 秒内撤销。'
    els.confirmBody.hidden = false
    els.confirmOk.textContent = '删除'
    els.confirmOk.classList.add('danger-btn')
    els.confirmOk.classList.remove('primary-btn')
    els.confirmTitle.textContent = `删除「${conv?.title || '这个对话'}」？`
    state.lastFocus = document.activeElement
    els.confirmModal.hidden = false
    lockShell(true)
    els.confirmCancel.focus()
  }

  els.confirmCancel.addEventListener('click', closeConfirm)
  els.confirmOk.addEventListener('click', () => {
    const action = state.confirmAction
    closeConfirm()
    if (action) action()
  })
  els.confirmModal.addEventListener('click', (event) => {
    if (event.target === els.confirmModal) closeConfirm()
  })

  function closeConfirm() {
    if (els.confirmModal.hidden) return
    els.confirmModal.hidden = true
    state.confirmAction = null
    lockShell(false)
    if (state.lastFocus && state.lastFocus.isConnected) state.lastFocus.focus()
  }

  els.statsClose?.addEventListener('click', closeStats)
  els.statsModal?.addEventListener('click', (event) => {
    if (event.target === els.statsModal) closeStats()
  })

  /* ── overlays, shortcuts, rename ───────────────────────────────────── */

  function visibleOverlay() {
    if (els.commandMenu && !els.commandMenu.hidden) return null
    for (const el of [els.renameModal, els.shortcutsSheet, els.filesSheet, els.scenarioSheet, els.confirmModal]) {
      if (el && !el.hidden) return el
    }
    return null
  }

  function focusableIn(root) {
    if (!root) return []
    return [...root.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )].filter((el) => {
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0
    })
  }

  function trapOverlayFocus(event) {
    if (event.key !== 'Tab') return false
    const overlay = visibleOverlay()
    if (!overlay) return false
    const focusables = focusableIn(overlay)
    if (!focusables.length) return false
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
      return true
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
      return true
    }
    return false
  }

  function paletteConversationItems(query) {
    const lower = query.trim().toLowerCase()
    return state.conversations
      .filter((conv) => {
        if (!lower) return true
        return (
          String(conv.title || '').toLowerCase().includes(lower) ||
          String(conv.preview || '').toLowerCase().includes(lower)
        )
      })
      .slice(0, 6)
      .map((conv) => ({
        id: `conv:${conv.id}`,
        label: conv.title || '新对话',
        desc: `${conv.preview || '暂无预览'} · ${relativeTime(conv.updatedAt)}`,
        icon: conv.running ? 'i-spark' : 'i-logo',
        group: '对话',
        run: () => openConversation(conv.id),
      }))
  }

  function paletteCommandItems(query) {
    const lower = query.trim().toLowerCase()
    if (!lower) return COMMANDS.map((command) => ({ ...command, group: '命令' }))
    return COMMANDS.filter((command) => {
      return (
        command.label.toLowerCase().includes(lower) ||
        command.desc.toLowerCase().includes(lower) ||
        command.id.includes(lower)
      )
    }).map((command) => ({ ...command, group: '命令' }))
  }

  function renderPalette() {
    if (!els.paletteResults || !els.paletteInput) return
    const query = els.paletteInput.value
    const items = [...paletteCommandItems(query), ...paletteConversationItems(query)]
    state.paletteItems = items
    state.paletteIndex = Math.min(state.paletteIndex, Math.max(0, items.length - 1))
    els.paletteResults.replaceChildren()
    if (!items.length) {
      const empty = document.createElement('div')
      empty.className = 'palette-empty'
      empty.textContent = query ? `没有找到「${query}」相关的命令或对话` : '没有可用的命令'
      els.paletteResults.appendChild(empty)
      els.paletteInput.setAttribute('aria-activedescendant', '')
      return
    }
    let lastGroup = ''
    items.forEach((item, index) => {
      if (item.group && item.group !== lastGroup) {
        lastGroup = item.group
        const heading = document.createElement('div')
        heading.className = 'palette-group'
        heading.textContent = item.group
        els.paletteResults.appendChild(heading)
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'palette-item'
      button.id = `palette-item-${index}`
      button.dataset.index = String(index)
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(index === state.paletteIndex))
      const iconWrap = document.createElement('span')
      iconWrap.className = 'palette-icon'
      iconWrap.innerHTML = icon(item.icon || 'i-spark')
      const copy = document.createElement('span')
      copy.className = 'palette-copy'
      const title = document.createElement('span')
      title.className = 'palette-title'
      title.textContent = item.label
      const desc = document.createElement('span')
      desc.className = 'palette-desc'
      desc.textContent = item.desc || ''
      copy.append(title, desc)
      button.append(iconWrap, copy)
      button.addEventListener('mouseenter', () => {
        state.paletteIndex = index
        syncPaletteSelection()
      })
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => runPaletteItem(index))
      els.paletteResults.appendChild(button)
    })
    syncPaletteSelection()
  }

  function syncPaletteSelection() {
    if (!els.paletteResults || !els.paletteInput) return
    const options = [...els.paletteResults.querySelectorAll('.palette-item')]
    for (const option of options) {
      option.setAttribute('aria-selected', String(Number(option.dataset.index) === state.paletteIndex))
    }
    const active = options.find((option) => Number(option.dataset.index) === state.paletteIndex)
    if (active) {
      els.paletteInput.setAttribute('aria-activedescendant', active.id)
      active.scrollIntoView({ block: 'nearest' })
    } else {
      els.paletteInput.setAttribute('aria-activedescendant', '')
    }
  }

  function runPaletteItem(index) {
    const item = state.paletteItems[index]
    if (!item) return
    closePalette({ restoreFocus: false })
    item.run()
  }

  function openPalette() {
    if (!els.palette || !els.shell || els.shell.hidden) return
    if (!els.palette.hidden) return els.paletteInput.focus({ preventScroll: true })
    if (!els.filesSheet.hidden) closeFilesSheet()
    if (!els.scenarioSheet.hidden) closeScenarioSheet()
    if (!els.shortcutsSheet.hidden) closeShortcutsSheet()
    state.paletteFocus = document.activeElement
    state.paletteIndex = 0
    els.paletteInput.value = ''
    els.palette.hidden = false
    lockShell(true)
    renderPalette()
    requestAnimationFrame(() => els.paletteInput.focus({ preventScroll: true }))
  }

  function closePalette({ restoreFocus = true } = {}) {
    if (!els.palette || els.palette.hidden) return
    els.palette.hidden = true
    lockShell(false)
    if (restoreFocus && state.paletteFocus?.isConnected) {
      state.paletteFocus.focus({ preventScroll: true })
    }
    state.paletteFocus = null
    state.paletteItems = []
  }

  els.palette?.addEventListener('click', (event) => {
    if (event.target.closest('[data-palette-close]')) closePalette()
  })
  els.paletteInput?.addEventListener('input', () => {
    state.paletteIndex = 0
    renderPalette()
  })
  els.paletteInput?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const total = state.paletteItems.length
      if (!total) return
      state.paletteIndex =
        (state.paletteIndex + (event.key === 'ArrowDown' ? 1 : -1) + total) % total
      syncPaletteSelection()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closePalette()
      return
    }
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      runPaletteItem(state.paletteIndex)
    }
  })

  const SHORTCUTS = [
    ['对话', [
      ['命令面板', ['⌘', 'K']],
      ['新对话', ['⌘', '⇧', 'K']],
      ['在对话中查找', ['⌘', 'F']],
      ['快速切换对话', ['⌘', 'P']],
      ['上一条/下一条消息', ['⌥', '↑/↓']],
      ['聚焦输入框', ['⌘', '/']],
      ['发送消息', ['↵']],
      ['换行', ['⇧', '↵']],
    ]],
    ['视图', [
      ['切换外观', ['⌘', '⇧', 'L']],
      ['打开快捷键', ['?']],
      ['打开文件', ['⌘', '⇧', 'F']],
      ['导出对话', ['⌘', '⇧', 'E']],
      ['关闭弹层', ['Esc']],
    ]],
    ['输入框', [
      ['斜杠命令', ['/']],
      ['选择命令', ['↑', '↓']],
      ['执行命令', ['↵']],
      ['停止生成', ['Esc']],
    ]],
  ]

  function renderShortcuts() {
    if (!els.shortcutsList) return
    els.shortcutsList.replaceChildren()
    for (const [group, rows] of SHORTCUTS) {
      const heading = document.createElement('div')
      heading.className = 'shortcut-group'
      heading.textContent = group
      els.shortcutsList.appendChild(heading)
      for (const [label, keys] of rows) {
        const row = document.createElement('div')
        row.className = 'shortcut-row'
        const text = document.createElement('span')
        text.textContent = label
        const keyWrap = document.createElement('span')
        keyWrap.className = 'shortcut-keys'
        for (const key of keys) {
          const kbd = document.createElement('kbd')
          kbd.textContent = key
          keyWrap.appendChild(kbd)
        }
        row.append(text, keyWrap)
        els.shortcutsList.appendChild(row)
      }
    }
  }

  function openShortcuts() {
    if (!els.shortcutsSheet || !els.shortcutsSheet.hidden) return
    renderShortcuts()
    state.shortcutsFocus = document.activeElement
    els.shortcutsSheet.hidden = false
    lockShell(true)
    requestAnimationFrame(() => {
      els.shortcutsSheet.querySelector('[data-shortcuts-close]')?.focus({ preventScroll: true })
    })
  }

  function closeShortcuts() {
    if (!els.shortcutsSheet || els.shortcutsSheet.hidden) return
    els.shortcutsSheet.hidden = true
    lockShell(false)
    if (state.shortcutsFocus?.isConnected) state.shortcutsFocus.focus({ preventScroll: true })
    state.shortcutsFocus = null
  }

  function openRename(id) {
    const conv = state.conversations.find((item) => item.id === id) ||
      state.searchResults.find((item) => item.id === id)
    if (!conv || !els.renameModal) return
    state.renameId = id
    state.lastFocus = document.activeElement
    els.renameInput.value = conv.title === '新对话' ? '' : conv.title || ''
    els.renameError.hidden = true
    els.renameModal.hidden = false
    lockShell(true)
    requestAnimationFrame(() => {
      els.renameInput.focus({ preventScroll: true })
      els.renameInput.select()
    })
  }

  function closeRename() {
    if (!els.renameModal || els.renameModal.hidden) return
    els.renameModal.hidden = true
    state.renameId = null
    lockShell(false)
    if (state.lastFocus?.isConnected) state.lastFocus.focus({ preventScroll: true })
  }

  async function submitRename(event) {
    event?.preventDefault()
    const id = state.renameId
    const title = els.renameInput.value.replace(/\s+/g, ' ').trim()
    if (!id) return
    if (!title) {
      els.renameError.textContent = '标题不能为空'
      els.renameError.hidden = false
      els.renameInput.focus()
      return
    }
    els.renameSave.disabled = true
    try {
      await patchConversation(id, { title })
      closeRename()
    } catch {
      els.renameError.textContent = '保存失败，请重试'
      els.renameError.hidden = false
    } finally {
      els.renameSave.disabled = false
    }
  }


  /* ── message view ──────────────────────────────────────────────────── */

  function userBubble(text, ts, attachments = null) {
    const wrap = document.createElement('article')
    wrap.className = 'msg user'
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    const body = document.createElement('span')
    body.className = 'bubble-text'
    body.textContent = text
    bubble.appendChild(body)
    if (Array.isArray(attachments) && attachments.length) {
      const files = document.createElement('div')
      files.className = 'bubble-files'
      for (const file of attachments) files.appendChild(fileChip(file))
      bubble.appendChild(files)
    }
    wrap.appendChild(bubble)

    const actions = document.createElement('div')
    actions.className = 'msg-actions'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'icon-btn'
    copy.title = '复制提问'
    copy.setAttribute('aria-label', '复制提问')
    copy.innerHTML = icon('i-copy')
    copy.addEventListener('click', async () => {
      const ok = await copyText(text)
      if (!ok) return showToast('复制失败', { tone: 'error' })
      copy.innerHTML = icon('i-check')
      showToast('已复制提问')
      setTimeout(() => (copy.innerHTML = icon('i-copy')), 1500)
    })
    actions.appendChild(copy)

    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'icon-btn'
    edit.title = '编辑并重新生成'
    edit.setAttribute('aria-label', '编辑这条提问')
    edit.innerHTML = icon('i-edit')
    edit.addEventListener('click', () => startEditingUserMessage(wrap))
    actions.appendChild(edit)

    const remember = document.createElement('button')
    remember.type = 'button'
    remember.className = 'icon-btn'
    remember.title = '加入长期记忆'
    remember.setAttribute('aria-label', '把这条提问加入长期记忆')
    remember.innerHTML = icon('i-memory')
    remember.addEventListener('click', () => void rememberMessage(text))
    actions.appendChild(remember)

    const star = document.createElement('button')
    star.type = 'button'
    star.className = 'icon-btn'
    star.title = '收藏这条消息'
    star.setAttribute('aria-label', '收藏这条消息')
    star.setAttribute('aria-pressed', 'false')
    star.innerHTML = icon('i-star')
    star.addEventListener('click', () => {
      const messageId = wrap.dataset.messageId
      if (!messageId || messageId.startsWith('local_')) return showToast('消息保存后才能收藏')
      star.classList.toggle('bookmarked', !isBookmarked(messageId))
      toggleBookmark({
        conversationId: state.currentId,
        messageId,
        text,
        title: els.topbarName.textContent,
      })
      star.dataset.bookmarkId = messageId
      star.classList.toggle('bookmarked', isBookmarked(messageId))
    })
    actions.appendChild(star)

    const link = document.createElement('button')
    link.type = 'button'
    link.className = 'icon-btn'
    link.title = '复制消息链接'
    link.setAttribute('aria-label', '复制这条消息的链接')
    link.innerHTML = icon('i-external')
    link.addEventListener('click', () => void copyMessageLink(wrap.dataset.messageId))
    actions.appendChild(link)

    if (ts) {
      const time = document.createElement('span')
      time.className = 'msg-time'
      time.textContent = new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      time.title = new Date(ts).toLocaleString('zh-CN', { hour12: false })
      actions.appendChild(time)
    }
    wrap.appendChild(actions)
    if (ts) wrap.title = new Date(ts).toLocaleString()
    return wrap
  }

  function startEditingUserMessage(wrap) {
    if (state.streaming) {
      showToast('请先停止当前生成', { tone: 'error' })
      return
    }
    const id = wrap.dataset.messageId
    if (!id || id.startsWith('local_')) {
      showToast('消息保存后才能编辑')
      return
    }
    const bubble = wrap.querySelector('.bubble')
    if (!bubble || wrap.querySelector('.bubble-edit')) return
    const text = bubble.querySelector('.bubble-text')?.textContent || ''
    bubble.hidden = true
    const editor = document.createElement('div')
    editor.className = 'bubble bubble-edit-wrap'
    const area = document.createElement('textarea')
    area.className = 'bubble-edit'
    area.value = text
    area.setAttribute('aria-label', '编辑提问')
    const row = document.createElement('div')
    row.className = 'user-edit-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    const save = document.createElement('button')
    save.type = 'button'
    save.className = 'primary'
    save.textContent = '保存并重跑'
    row.append(cancel, save)
    editor.append(area, row)
    wrap.insertBefore(editor, bubble)

    const stop = () => {
      editor.remove()
      bubble.hidden = false
    }
    cancel.addEventListener('click', stop)
    area.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        stop()
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        save.click()
      }
    })
    save.addEventListener('click', () => {
      const next = area.value.trim()
      if (!next) return showToast('内容不能为空', { tone: 'error' })
      if (next === text) return stop()
      askConfirm({
        title: '编辑并重新生成？',
        body: '这条提问之后的消息会被移除，然后重新生成回答。',
        okLabel: '保存并重跑',
        onOk: () => void applyUserEdit(id, next, text),
      })
    })
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
  }

  async function applyUserEdit(id, text, previousText) {
    const wrap = [...els.thread.querySelectorAll('.msg.user')].find(
      (node) => node.dataset.messageId === id,
    )
    let index = state.messages.findIndex((msg) => msg.id === id)
    if (index < 0 && previousText) {
      index = state.messages.findIndex((msg) => msg.role === 'user' && msg.text === previousText)
    }
    if (index >= 0) {
      state.messages = state.messages.slice(0, index + 1)
      const msg = state.messages[index]
      msg.text = text
      msg.editedAt = Date.now()
    }
    if (wrap) {
      let node = wrap.nextElementSibling
      while (node) {
        const next = node.nextElementSibling
        node.remove()
        node = next
      }
      const bubble = wrap.querySelector('.bubble:not(.bubble-edit-wrap)')
      if (bubble) {
        bubble.hidden = false
        const body = bubble.querySelector('.bubble-text')
        if (body) body.textContent = text
      }
      wrap.querySelector('.bubble-edit-wrap')?.remove()
    }
    await sendMessage(text, {
      editOf: id,
      skipUserBubble: true,
      conversationId: state.currentId,
    })
  }

  function askConfirm({ title, body = '', okLabel = '确定', danger = true, onOk }) {
    state.confirmAction = onOk
    els.confirmTitle.textContent = title
    els.confirmBody.textContent = body
    els.confirmBody.hidden = !body
    els.confirmOk.textContent = okLabel
    els.confirmOk.classList.toggle('danger-btn', danger)
    els.confirmOk.classList.toggle('primary-btn', !danger)
    state.lastFocus = document.activeElement
    els.confirmModal.hidden = false
    lockShell(true)
    els.confirmCancel.focus()
  }

  function createAssistantView() {
    const el = document.createElement('article')
    el.className = 'msg assistant'

    const avatar = document.createElement('div')
    avatar.className = 'avatar'
    avatar.innerHTML = icon('i-logo')

    const body = document.createElement('div')
    body.className = 'msg-body'

    const blocksEl = document.createElement('div')
    blocksEl.className = 'blocks'

    const statusEl = document.createElement('div')
    statusEl.className = 'gen-status'
    statusEl.innerHTML = `<span class="dots"><i></i><i></i><i></i></span><span class="status-text">正在连接…</span>`

    body.append(blocksEl, statusEl)
    el.append(avatar, body)

    const view = {
      el,
      blocksEl,
      statusEl,
      statusText: $('.status-text', statusEl),
      streaming: true,
      startedAt: Date.now(),
      label: '正在连接…',
      timer: null,
      lastText: null,
      lastThinking: null,
      thinkingBlocks: [],
      toolCards: new Map(),
      liveBlocks: new Map(),
      textBlocks: [],
      errorShown: null,
      actionsEl: null,
      finished: false,
    }

    view.timer = setInterval(() => {
      if (view.finished) return
      const seconds = Math.floor((Date.now() - view.startedAt) / 1000)
      view.statusText.textContent =
        view.label + (seconds >= 2 ? ` · ${seconds}s` : '')
    }, 1000)

    view.setStatus = (label) => {
      view.label = label
      view.statusText.textContent = label
    }

    view.sealText = () => {
      if (view.lastText) view.lastText.sealed = true
      view.lastText = null
    }

    view.clearLive = (kind) => {
      const block = view.liveBlocks.get(kind)
      if (!block) return
      block.el.remove()
      view.liveBlocks.delete(kind)
    }

    view.clearAllLive = () => {
      for (const kind of [...view.liveBlocks.keys()]) view.clearLive(kind)
    }

    view.addDelta = (kind, text) => {
      if (!text) return
      const type = kind === 'thinking' ? 'thinking' : 'text'
      let block = view.liveBlocks.get(type)
      if (!block) {
        const wrap = document.createElement('div')
        wrap.className = type === 'thinking' ? 'delta-think' : 'delta-text'
        let body
        if (type === 'thinking') {
          const label = document.createElement('div')
          label.className = 'delta-think-label'
          label.innerHTML = '<span class="think-live-dot" aria-hidden="true"></span>'
          const labelText = document.createElement('span')
          labelText.textContent = '正在思考…'
          label.appendChild(labelText)
          body = document.createElement('div')
          body.className = 'delta-think-body'
          wrap.append(label, body)
        } else {
          body = document.createElement('div')
          body.className = 'md'
          wrap.appendChild(body)
        }
        view.blocksEl.appendChild(wrap)
        block = { el: wrap, body, raw: '', scheduled: false }
        view.liveBlocks.set(type, block)
      }
      block.raw += text
      if (block.scheduled) return
      block.scheduled = true
      setTimeout(() => {
        block.scheduled = false
        if (!view.liveBlocks.has(type)) return
        if (type === 'thinking') {
          block.body.textContent = block.raw
        } else {
          block.body.innerHTML = window.Markdown.render(block.raw)
          const cursor = document.createElement('span')
          cursor.className = 'stream-cursor'
          block.body.appendChild(cursor)
          decorateFileRefs(block.body)
        }
        if (state.stick) scrollToBottom()
      }, 50)
    }

    view.destroy = () => {
      view.finished = true
      view.streaming = false
      clearInterval(view.timer)
      view.clearAllLive()
    }

    view.addThinking = (text, done = false) => {
      view.clearLive('thinking')
      view.sealText()
      let block = view.lastThinking
      if (!block || block.closed) {
        const think = document.createElement('div')
        think.className = 'think'
        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'think-toggle'
        toggle.innerHTML = icon('i-chevron')
        const label = document.createElement('span')
        label.textContent = done ? '思考过程' : '正在思考…'
        toggle.appendChild(label)
        const bodyEl = document.createElement('div')
        bodyEl.className = 'think-body'
        think.append(toggle, bodyEl)
        toggle.setAttribute('aria-expanded', 'false')
        toggle.setAttribute('aria-label', '展开思考过程')
        toggle.addEventListener('click', () => {
          const open = think.classList.toggle('open')
          toggle.setAttribute('aria-expanded', String(open))
          toggle.setAttribute('aria-label', open ? '收起思考过程' : '展开思考过程')
        })
        view.blocksEl.appendChild(think)
        block = { el: think, body: bodyEl, label, raw: '', closed: false }
        view.lastThinking = block
        view.thinkingBlocks.push(block)
      }
      block.raw += (block.raw ? '\n\n' : '') + text
      block.body.textContent = block.raw
      if (done) {
        block.closed = true
        block.label.textContent = '思考过程'
        view.lastThinking = null
      }
    }

    view.addText = (text, sealed = false) => {
      view.clearLive('text')
      let block = view.lastText
      if (!block || block.sealed) {
        const div = document.createElement('div')
        div.className = 'md'
        view.blocksEl.appendChild(div)
        block = { el: div, raw: '', sealed: false, scheduled: false }
        view.lastText = block
        view.textBlocks.push(block)
      }
      block.raw += text
      const paint = () => {
        block.scheduled = false
        if (hasMathSyntax(block.raw) && !mathResourcesReady) {
          if (!block.mathLoading) {
            block.mathLoading = true
            ensureMath()
              .then(() => {
                block.mathLoading = false
                paint()
              })
              .catch(() => {
                block.mathLoading = false
              })
          }
        }
        block.el.innerHTML = window.Markdown.render(block.raw)
        if (mathResourcesReady && window.katex) {
          for (const node of block.el.querySelectorAll('.math-display')) {
            try {
              window.katex.render(node.textContent, node, {
                displayMode: true,
                throwOnError: false,
                errorColor: 'currentColor',
              })
            } catch {}
          }
        }
        decorateFileRefs(block.el)
        if (mathResourcesReady && window.renderMathInElement) {
          try {
            window.renderMathInElement(block.el, {
              delimiters: [
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false },
                { left: '$$', right: '$$', display: true },
              ],
              throwOnError: false,
              errorColor: 'currentColor',
              ignoredTags: ['pre', 'code', 'script', 'style', 'textarea', 'option'],
              ignoredClasses: ['math-display', 'katex'],
            })
          } catch {}
        }
        if (view.streaming) {
          const target = block.el.lastElementChild
          const cursor = document.createElement('span')
          cursor.className = 'stream-cursor'
          if (target && /^(P|LI|H1|H2|H3|H4)$/.test(target.tagName)) target.appendChild(cursor)
          else block.el.appendChild(cursor)
        }
        if (state.stick) scrollToBottom()
      }
      if (sealed && !view.streaming) {
        paint()
      } else if (!block.scheduled) {
        block.scheduled = true
        requestAnimationFrame(paint)
      }
      if (sealed) {
        block.sealed = true
        view.lastText = null
      }
    }

    view.addTool = (call) => {
      view.clearAllLive()
      view.sealText()
      const meta = toolMeta(call.tool)
      const card = document.createElement('div')
      card.className = 'tool-card'
      card.dataset.status = call.status || 'running'
      if (call.id) card.dataset.callId = call.id

      const head = document.createElement('button')
      head.type = 'button'
      head.className = 'tool-head'

      const iconEl = document.createElement('span')
      iconEl.className = 'tool-icon'
      iconEl.innerHTML = icon(meta.icon)

      const name = document.createElement('span')
      name.className = 'tool-name'
      name.textContent = meta.label

      const detail = document.createElement('span')
      detail.className = 'tool-detail'
      detail.textContent = call.summary || summarizeInput(call.input) || ''

      const badge = document.createElement('span')
      badge.className = 'tool-badge'

      const chev = document.createElement('span')
      chev.className = 'tool-chev'
      chev.innerHTML = icon('i-chevron')

      head.append(iconEl, name, detail, badge, chev)
      head.setAttribute('aria-expanded', 'false')

      const body = document.createElement('div')
      body.className = 'tool-body'

      head.addEventListener('click', () => {
        const open = card.classList.toggle('open')
        head.setAttribute('aria-expanded', String(open))
      })

      card.append(head, body)
      view.blocksEl.appendChild(card)

      const entry = {
        card,
        body,
        detail,
        badge,
        head,
        startedAt: view.streaming ? Date.now() : null,
        resultEl: null,
        renderedResult: false,
        resultRaw: '',
      }
      if (call.id) view.toolCards.set(call.id, entry)
      renderToolBody(entry, call)
      renderToolStatus(entry, call.status || 'running')
      if (state.stick) scrollToBottom()
      return entry
    }

    function renderToolStatus(entry, status, { showDuration = false } = {}) {
      entry.card.dataset.status = status
      const failed = status === 'error' || status === 'failed'
      const label = status === 'running' ? '运行中'
        : status === 'completed' ? '完成'
          : failed ? '失败'
            : status === 'stopped' ? '已停止'
              : status === 'interrupted' ? '已中断'
                : '结果未确认'
      // Historical tool records have no persisted duration. Only time live results.
      const elapsed = showDuration && entry.startedAt !== null && (status === 'completed' || failed)
        ? ` · ${Math.max(1, Math.round((Date.now() - entry.startedAt) / 1000))}s`
        : ''
      entry.badge.textContent = label + elapsed
      if (failed) {
        entry.card.classList.add('open')
        entry.head.setAttribute('aria-expanded', 'true')
      }
      if (!entry.resultRaw) {
        entry.resultText = status === 'running' ? '运行中…'
          : status === 'completed' || failed ? '（无输出）' : '未收到执行结果'
        const result = entry.body.querySelector('pre[data-kind="result"]')
        if (result) result.textContent = entry.resultText
      }
    }

    function renderToolBody(entry, call) {
      entry.body.replaceChildren()
      entry.paramsText = ''
      if (call.input && typeof call.input === 'object' && Object.keys(call.input).length) {
        try {
          entry.paramsText = clip(JSON.stringify(call.input, null, 2), 6000)
        } catch {
          entry.paramsText = String(call.input)
        }
        appendSection(entry.body, '参数', entry.paramsText)
      }
      entry.resultRaw =
        call.result !== undefined && call.result !== null && call.result !== ''
          ? String(call.result)
          : ''
      entry.resultText =
        entry.resultRaw
          ? clip(entry.resultRaw)
          : call.status === 'running'
            ? '运行中…'
            : '（无输出）'
      appendSection(entry.body, '结果', entry.resultText, 'result')
      if (entry.resultRaw) {
        const copy = document.createElement('button')
        copy.type = 'button'
        copy.className = 'tool-copy'
        copy.textContent = '复制结果'
        copy.addEventListener('click', async (event) => {
          event.stopPropagation()
          const ok = await copyText(entry.resultRaw)
          if (!ok) return showToast('复制失败', { tone: 'error' })
          copy.textContent = '已复制'
          setTimeout(() => (copy.textContent = '复制结果'), 1500)
        })
        entry.body.appendChild(copy)
      }
    }

    function appendSection(parent, labelText, text, kind) {
      const section = document.createElement('div')
      section.className = 'tool-section'
      const label = document.createElement('div')
      label.className = 'tool-label'
      label.textContent = labelText
      const pre = document.createElement('pre')
      pre.textContent = text
      if (kind) pre.dataset.kind = kind
      section.append(label, pre)
      parent.appendChild(section)
      return pre
    }

    view.updateTool = (callId, patch) => {
      const entry = view.toolCards.get(callId)
      if (!entry) return
      if (patch.result !== undefined) {
        entry.resultRaw =
          patch.result === null || patch.result === undefined || patch.result === ''
            ? ''
            : String(patch.result)
        const text = entry.resultRaw ? clip(entry.resultRaw) : '（无输出）'
        entry.resultText = text
        let resultPre = entry.body.querySelector('pre[data-kind="result"]')
        if (!resultPre) resultPre = appendSection(entry.body, '结果', text, 'result')
        else resultPre.textContent = text
        if (entry.resultRaw && !entry.body.querySelector('.tool-copy')) {
          const copy = document.createElement('button')
          copy.type = 'button'
          copy.className = 'tool-copy'
          copy.textContent = '复制结果'
          copy.addEventListener('click', async (event) => {
            event.stopPropagation()
            const ok = await copyText(entry.resultRaw)
            if (!ok) return showToast('复制失败', { tone: 'error' })
            copy.textContent = '已复制'
            setTimeout(() => (copy.textContent = '复制结果'), 1500)
          })
          entry.body.appendChild(copy)
        }
      }
      if (patch.status) renderToolStatus(entry, patch.status, { showDuration: true })
      if (state.stick) scrollToBottom()
    }

    view.notice = (text) => {
      const div = document.createElement('div')
      div.className = 'notice'
      div.textContent = text
      view.blocksEl.appendChild(div)
    }

    view.setError = (message) => {
      if (!message || view.errorShown === message) return
      view.errorShown = message
      const box = document.createElement('div')
      box.className = 'msg-error'
      box.innerHTML = icon('i-spark')
      const text = document.createElement('span')
      text.textContent = message
      box.appendChild(text)
      view.blocksEl.appendChild(box)
      if (state.stick) scrollToBottom()
    }

    view.addRetry = (handler) => {
      if (!handler || view.retryEl) return
      const row = document.createElement('div')
      row.className = 'msg-actions'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'msg-retry'
      button.innerHTML = icon('i-refresh')
      const label = document.createElement('span')
      label.textContent = '重试这条消息'
      button.appendChild(label)
      button.addEventListener('click', () => {
        row.remove()
        view.retryEl = null
        handler()
      })
      row.appendChild(button)
      view.blocksEl.appendChild(row)
      view.retryEl = row
    }

    view.addContinue = (handler) => {
      if (!handler || view.continueEl) return
      const row = document.createElement('div')
      row.className = 'msg-actions'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'msg-retry'
      button.innerHTML = icon('i-up')
      const label = document.createElement('span')
      label.textContent = '继续生成'
      button.appendChild(label)
      button.addEventListener('click', handler)
      row.appendChild(button)
      view.blocksEl.appendChild(row)
      view.continueEl = row
    }

    view.finish = ({ status, durationMs, usage, error, stopped, files, createdAt, canRegenerate, messageId } = {}) => {
      if (view.finished) return
      view.finished = true
      view.streaming = false
      view.clearAllLive()
      clearInterval(view.timer)
      view.statusEl.hidden = true
      // A finished message cannot keep tools spinning. Missing results stay unknown.
      for (const entry of view.toolCards.values()) {
        if (entry.card.dataset.status !== 'running') continue
        const toolStatus = status === 'interrupted' ? 'interrupted'
          : stopped || status === 'stopped' ? 'stopped' : 'unknown'
        renderToolStatus(entry, toolStatus)
      }
      view.el.querySelectorAll('.stream-cursor').forEach((node) => node.remove())
      for (const block of view.thinkingBlocks) block.label.textContent = '思考过程'
      if (error) view.setError(error)

      const text = view.textBlocks.map((b) => b.raw).join('\n\n')
      const actions = document.createElement('div')
      actions.className = 'msg-actions'

      if (text) {
        const copy = document.createElement('button')
        copy.type = 'button'
        copy.className = 'icon-btn'
        copy.title = '复制回答'
        copy.setAttribute('aria-label', '复制回答')
        copy.innerHTML = icon('i-copy')
        copy.addEventListener('click', async () => {
          const ok = await copyText(text)
          if (!ok) return showToast('复制失败', { tone: 'error' })
          copy.innerHTML = icon('i-check')
          showToast('已复制回答')
          setTimeout(() => (copy.innerHTML = icon('i-copy')), 1500)
        })
        actions.appendChild(copy)

        const share = document.createElement('button')
        share.type = 'button'
        share.className = 'icon-btn'
        share.title = '导出为 Markdown'
        share.setAttribute('aria-label', '导出这条回答')
        share.innerHTML = icon('i-share')
        share.addEventListener('click', () => {
          const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
          downloadText(`DSH-回答-${stamp}.md`, `# DSH Chat 回答\n\n> ${new Date().toLocaleString('zh-CN', { hour12: false })}\n\n${text}\n`)
          showToast('已导出回答')
        })
        actions.appendChild(share)

        const link = document.createElement('button')
        link.type = 'button'
        link.className = 'icon-btn'
        link.title = '复制消息链接'
        link.setAttribute('aria-label', '复制这条消息的链接')
        link.innerHTML = icon('i-external')
        link.addEventListener('click', () => void copyMessageLink(messageId || view.el.dataset.messageId))
        actions.appendChild(link)

        const star = document.createElement('button')
        star.type = 'button'
        star.className = 'icon-btn'
        star.title = '收藏这条回答'
        star.setAttribute('aria-label', '收藏这条回答')
        star.dataset.bookmarkId = messageId || view.el.dataset.messageId || ''
        star.setAttribute('aria-pressed', 'false')
        star.innerHTML = icon('i-star')
        if (star.dataset.bookmarkId && isBookmarked(star.dataset.bookmarkId)) {
          star.classList.add('bookmarked')
          star.setAttribute('aria-pressed', 'true')
        }
        star.addEventListener('click', () => {
          const id = messageId || view.el.dataset.messageId
          if (!id) return
          toggleBookmark({
            conversationId: state.currentId,
            messageId: id,
            text,
            title: els.topbarName.textContent,
          })
          star.classList.toggle('bookmarked', isBookmarked(id))
          star.setAttribute('aria-pressed', String(isBookmarked(id)))
        })
        actions.appendChild(star)
      }

      if (canRegenerate) {
        const again = document.createElement('button')
        again.type = 'button'
        again.className = 'icon-btn'
        again.title = '重新生成'
        again.setAttribute('aria-label', '重新生成回答')
        again.innerHTML = icon('i-refresh')
        again.addEventListener('click', () => {
          if (state.streaming) return
          const id = messageId || view.el.dataset.messageId
          if (!id || !state.currentId) return showToast('暂时无法重新生成', { tone: 'error' })
          view.el.remove()
          state.messages = state.messages.filter((msg) => msg.id !== id)
          const lastUser = [...state.messages].reverse().find((msg) => msg.role === 'user')
          if (!lastUser) return showToast('找不到对应的提问', { tone: 'error' })
          void sendMessage(lastUser.text, {
            retryOf: id,
            skipUserBubble: true,
            conversationId: state.currentId,
          })
        })
        actions.appendChild(again)
      }

      const meta = document.createElement('span')
      meta.className = 'msg-meta'
      const bits = []
      if (stopped) bits.push('已停止')
      if (status === 'error') bits.push('生成失败')
      if (durationMs) bits.push(`用时 ${formatDuration(durationMs)}`)
      meta.textContent = bits.join(' · ')
      if (meta.textContent) actions.appendChild(meta)

      if (usage && usage.totalTokens) {
        actions.classList.add('has-usage')
        const usageButton = document.createElement('button')
        usageButton.type = 'button'
        usageButton.className = 'msg-usage-btn'
        usageButton.textContent = `≈${formatTokens(usage.totalTokens)} tokens`
        usageButton.setAttribute('aria-label', '查看 token 用量详情')
        usageButton.addEventListener('click', () => showUsagePopover(usageButton, usage))
        actions.appendChild(usageButton)
      }

      if (createdAt) {
        const time = document.createElement('span')
        time.className = 'msg-time'
        time.textContent = new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        time.title = new Date(createdAt).toLocaleString('zh-CN', { hour12: false })
        actions.appendChild(time)
      }

      if (Array.isArray(files) && files.length) {
        const filesWrap = document.createElement('div')
        filesWrap.className = 'msg-files'
        const filesTitle = document.createElement('div')
        filesTitle.className = 'msg-files-title'
        filesTitle.textContent = '本轮文件'
        const chips = document.createElement('div')
        chips.className = 'file-chips'
        for (const file of files) chips.appendChild(fileChip(file))
        filesWrap.append(filesTitle, chips)
        body.appendChild(filesWrap)
      }

      if (actions.childElementCount) body.appendChild(actions)
      view.actionsEl = actions
    }

    return view
  }

  /* ── thread rendering ──────────────────────────────────────────────── */

  function updateScrollButton() {
    const el = els.scrollArea
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    const reading = Boolean(state.currentId) && !els.thread.hidden
    els.scrollBottom.hidden = !reading || nearBottom
    return nearBottom
  }

  function scrollToBottom() {
    els.scrollArea.scrollTop = els.scrollArea.scrollHeight
    state.stick = true
    els.scrollBottom.hidden = true
  }

  async function copyLongCodeValue(codeEl) {
    const text = codeEl?.textContent?.trim()
    if (!text) return
    const ok = await copyText(text)
    showToast(ok ? '已复制完整值' : '复制失败，可长按选择', { tone: ok ? 'success' : 'error' })
  }

  els.thread.addEventListener('click', (event) => {
    const code = event.target.closest('code.code-value')
    if (code) void copyLongCodeValue(code)
  })
  els.thread.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const code = event.target.closest('code.code-value')
    if (!code) return
    event.preventDefault()
    void copyLongCodeValue(code)
  })

  els.scrollArea.addEventListener(
    'scroll',
    () => {
      state.stick = updateScrollButton()
      updateReadProgress()
      scheduleScrollSave()
    },
    { passive: true },
  )
  window.addEventListener(
    'resize',
    () => {
      updateScrollButton()
      updateReadProgress()
    },
    { passive: true },
  )

  function showEmptyChat({ updateRoute = true } = {}) {
    state.navigationRequest += 1
    saveScrollPosition()
    if (state.currentId || els.input.value) saveDraftNow()
    if (state.streaming) detachStreaming()
    for (const view of state.liveViews.values()) view.destroy?.()
    state.liveViews.clear()
    clearQuestionSlot()
    closePermissionMenu({ restoreFocus: false })
    state.currentId = null
    state.currentEngine = state.engine
    state.permission = state.permissionCatalog?.default || 'workspace-write'
    state.messages = []
    state.threadEnd = null
    closeFind()
    els.thread.replaceChildren()
    els.thread.hidden = true
    els.emptyState.hidden = false
    els.topbarName.textContent = 'DSH Chat'
    setDocumentTitle('DSH Chat')
    localStorage.removeItem('dsh.current')
    if (updateRoute) pushRoute(null)
    state.files = []
    state.filePaths.clear()
    clearStagedAttachments()
    renderFilesBar()
    closeFilesSheet()
    renderConversations()
    setModelLabels()
    updateEngineBar()
    updatePermissionUI()
    state.stick = true
    if (els.scrollArea) els.scrollArea.scrollTop = 0
    updateScrollButton()
    updateReadProgress()
    restoreDraft()
    updateComposerMeta()
    if (!desktopQuery.matches) closeSidebar()
    if (desktopQuery.matches) els.input.focus({ preventScroll: true })
  }

  function scrollKey(id = state.currentId) {
    return `dsh.scroll.${id || 'new'}`
  }

  function saveScrollPosition(id = state.currentId) {
    if (!id) return
    const el = els.scrollArea
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    try {
      localStorage.setItem(scrollKey(id), nearBottom ? 'bottom' : String(Math.round(el.scrollTop)))
    } catch {}
  }

  let scrollSaveTimer = null
  function scheduleScrollSave() {
    clearTimeout(scrollSaveTimer)
    scrollSaveTimer = setTimeout(() => saveScrollPosition(), 320)
  }

  function restoreScrollPosition() {
    const id = state.currentId
    if (!id) return
    let saved = 'bottom'
    try {
      saved = localStorage.getItem(scrollKey(id)) || 'bottom'
    } catch {}
    const el = els.scrollArea
    if (saved === 'bottom' || !Number.isFinite(Number(saved))) {
      scrollToBottom()
      return
    }
    el.scrollTop = Number(saved)
    state.stick = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    updateScrollButton()
    updateReadProgress()
  }

  function focusMessage(messageId, { smooth = false } = {}) {
    if (!messageId) return false
    let node = [...els.thread.querySelectorAll('[data-message-id]')].find(
      (el) => el.dataset.messageId === messageId,
    )
    if (!node && !state.streaming) {
      const index = state.messages.findIndex((msg) => msg.id === messageId)
      if (index < 0) return false
      state.threadWindow = 60
      state.threadEnd = Math.min(state.messages.length, index + 30)
      renderMessages(state.messages, { restoreScroll: false })
      node = [...els.thread.querySelectorAll('[data-message-id]')].find(
        (el) => el.dataset.messageId === messageId,
      )
    }
    if (!node) return false
    node.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })
    node.classList.remove('msg-flash')
    void node.offsetWidth
    node.classList.add('msg-flash')
    setTimeout(() => node.classList.remove('msg-flash'), 1800)
    return true
  }

  function renderMessages(messages, { restoreScroll = true } = {}) {
    for (const view of state.liveViews.values()) view.destroy?.()
    state.liveViews.clear()
    els.thread.replaceChildren()
    const total = messages.length
    const end = state.threadEnd == null ? total : Math.min(total, state.threadEnd)
    const start = Math.max(0, end - state.threadWindow)
    if (start > 0) {
      const earlier = document.createElement('button')
      earlier.type = 'button'
      earlier.className = 'load-earlier'
      earlier.textContent = `加载更早的 ${start} 条消息`
      earlier.addEventListener('click', () => {
        const before = els.scrollArea.scrollHeight
        state.threadWindow += 60
        renderMessages(state.messages)
        requestAnimationFrame(() => {
          els.scrollArea.scrollTop += els.scrollArea.scrollHeight - before
        })
      })
      els.thread.appendChild(earlier)
    }
    let lastDay = ''
    messages.slice(start, end).forEach((msg, index) => {
      try {
        const day = msg.createdAt ? new Date(msg.createdAt).toDateString() : ''
        if (day && day !== lastDay) {
          lastDay = day
          const split = document.createElement('div')
          split.className = 'day-separator'
          split.setAttribute('role', 'separator')
          const label = document.createElement('span')
          label.textContent = dayLabel(msg.createdAt)
          split.appendChild(label)
          els.thread.appendChild(split)
        }
        if (msg.role === 'user' && msg.internal) {
          return
        }
        if (msg.role === 'user') {
          const bubble = userBubble(msg.text, msg.createdAt, msg.attachments)
          bubble.dataset.messageId = msg.id
          const star = bubble.querySelector('[aria-label="收藏这条消息"]')
          if (star) {
            star.dataset.bookmarkId = msg.id
            star.classList.toggle('bookmarked', isBookmarked(msg.id))
            star.setAttribute('aria-pressed', String(isBookmarked(msg.id)))
          }
          els.thread.appendChild(bubble)
        } else {
          els.thread.appendChild(renderAssistantMessage(msg, { isLast: start + index === total - 1 }))
        }
      } catch (error) {
        console.error('message render failed', error)
        const box = document.createElement('div')
        box.className = 'msg-error'
        box.innerHTML = icon('i-alert')
        const text = document.createElement('span')
        text.textContent = '这条消息渲染失败，可以刷新页面重试。'
        const reload = document.createElement('button')
        reload.type = 'button'
        reload.className = 'msg-retry'
        reload.textContent = '重新加载'
        reload.addEventListener('click', () => location.reload())
        box.append(text, reload)
        els.thread.appendChild(box)
      }
    })
    if (end < total) {
      const latest = document.createElement('button')
      latest.type = 'button'
      latest.className = 'load-earlier load-latest'
      latest.textContent = `回到最近消息（后面还有 ${total - end} 条）`
      latest.addEventListener('click', () => {
        state.threadEnd = null
        state.threadWindow = 60
        renderMessages(state.messages)
      })
      els.thread.appendChild(latest)
    }
    const hasMessages = messages.length > 0
    els.thread.hidden = !hasMessages
    els.emptyState.hidden = hasMessages
    state.stick = true
    requestAnimationFrame(() => {
      if (restoreScroll) restoreScrollPosition()
      updateReadProgress()
    })
  }

  function renderAssistantMessage(msg, options = {}) {
    const view = createAssistantView()
    view.streaming = false
    view.el.classList.add('stored')
    view.el.dataset.messageId = msg.id
    const blocks = Array.isArray(msg.blocks) && msg.blocks.length ? msg.blocks : null
    if (blocks) {
      for (const block of blocks) {
        if (block.type === 'thinking') view.addThinking(block.text, true)
        else if (block.type === 'text') view.addText(block.text, true)
        else if (block.type === 'tool') {
          view.addTool({
            id: block.id,
            tool: block.tool,
            input: block.input,
            status: block.status,
            result: block.result,
            summary: summarizeInput(block.input),
          })
        }
      }
    } else if (msg.text) {
      view.addText(msg.text, true)
    }
    if (msg.status === 'running') {
      view.streaming = true
      view.el.classList.remove('stored')
      view.setStatus('正在恢复生成…')
      state.liveViews.set(msg.id, view)
    } else {
      view.finish({
        status: msg.status,
        stopped: msg.status === 'stopped' || msg.status === 'interrupted',
        durationMs: msg.durationMs,
        usage: msg.usage,
        error: msg.error,
        files: msg.files || [],
        createdAt: msg.createdAt,
        messageId: msg.id,
        canRegenerate: Boolean(options.isLast) && msg.status !== 'running',
      })
    }
    return view.el
  }

  function showThreadSkeleton() {
    els.thread.replaceChildren()
    const wrap = document.createElement('div')
    wrap.className = 'thread-skeleton'
    wrap.setAttribute('aria-hidden', 'true')
    for (const width of ['w40', 'block', 'w80', 'w60', 'block', 'w80', 'w60']) {
      const line = document.createElement('div')
      line.className = `skeleton-line ${width}`
      wrap.appendChild(line)
    }
    els.thread.appendChild(wrap)
    els.emptyState.hidden = true
    els.thread.hidden = false
  }

  function routeConversationId() {
    const match = location.pathname.match(/^\/c\/([^/]+)\/?$/)
    if (!match) return null
    try {
      return decodeURIComponent(match[1])
    } catch {
      return null
    }
  }

  function pushRoute(id, { replace = false } = {}) {
    if (state.routing && !replace) return
    const url = id ? `/c/${encodeURIComponent(id)}` : '/'
    if (`${location.pathname}${location.search}` === url) return
    try {
      if (replace) history.replaceState({ id: id || null }, '', url)
      else history.pushState({ id: id || null }, '', url)
    } catch {}
  }

  function routeHashMessage() {
    const match = location.hash.match(/^#m-(.+)$/)
    try { return match ? decodeURIComponent(match[1]) : '' } catch { return '' }
  }

  async function openConversation(id, options = {}) {
    const request = ++state.navigationRequest
    if (state.streaming) detachStreaming()
    saveScrollPosition()
    saveDraftNow()
    clearQuestionSlot()
    closePermissionMenu({ restoreFocus: false })
    const switching = state.currentId !== id
    if (switching) {
      state.threadWindow = 60
      state.threadEnd = null
      closeFind()
      showThreadSkeleton()
    }
    try {
      const data = await api(`/api/conversations/${id}`)
      if (request !== state.navigationRequest) return
      const conv = data.conversation
      state.currentId = conv.id
      markConversationRead(conv.id)
      state.currentEngine = conv.engine === 'codex' ? 'codex' : 'dsr'
      state.engine = state.currentEngine
      state.permission = conv.permission || 'workspace-write'
      localStorage.setItem('dsh.engine', state.currentEngine)
      state.messages = conv.messages || []
      localStorage.setItem('dsh.current', conv.id)
      els.topbarName.textContent = conv.title || 'DSH Chat'
      setDocumentTitle(conv.title || 'DSH Chat')
      renderMessages(state.messages)
      const hashMessage = options.messageId || routeHashMessage()
      if (hashMessage) {
        setTimeout(() => { if (request === state.navigationRequest) focusMessage(hashMessage) }, 60)
      } else if (location.hash.startsWith('#q=')) {
        const query = new URLSearchParams(location.hash.slice(1)).get('q') || ''
        setTimeout(() => { if (request === state.navigationRequest) openFind(query) }, 80)
      }
      setModelLabels()
      updateEngineBar()
      updatePermissionUI()
      const runningMessage = [...state.messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.status === 'running')
      if (runningMessage && !options.skipAttach) {
        void attachRun(conv.id, runningMessage.id)
      }
      restoreDraft()
      void refreshFiles(conv.id)
      renderConversations()
      scheduleCacheSave()
      if (!desktopQuery.matches) closeSidebar()
      if (!desktopQuery.matches) els.input.blur()
      if (!options.fromRoute) pushRoute(conv.id)
    } catch (err) {
      if (request !== state.navigationRequest || !state.authed) return
      // A failed navigation must not strand the previous conversation behind
      // a permanent skeleton or leave an invalid deep link in the address bar.
      if (state.currentId) renderMessages(state.messages)
      else showEmptyChat()
      if (err.status === 404) pushRoute(state.currentId, { replace: true })
      if (isNetworkError(err)) {
        setConnection('offline')
        scheduleConversationRetry(id)
        return
      }
      showToast(err.message)
    }
  }

  /* ── new chat ──────────────────────────────────────────────────────── */

  function newChat() {
    if (state.streaming) detachStreaming()
    saveDraftNow()
    showEmptyChat()
  }

  els.newChat.addEventListener('click', newChat)
  els.newChatTop.addEventListener('click', newChat)
  els.chatInfoBtn?.addEventListener('click', () => {
    if (els.chatInfo?.hidden) openChatInfo()
    else closeChatInfo({ restoreFocus: true })
  })
  els.chatInfoClose?.addEventListener('click', () => closeChatInfo({ restoreFocus: true }))
  els.chatInfo?.addEventListener('click', (event) => {
    if (event.target === els.chatInfo) closeChatInfo()
  })
  els.statusBtn?.addEventListener('click', toggleConnectionDetail)
  els.engineInfoBtn?.addEventListener('click', (event) => {
    event.stopPropagation()
    toggleEngineInfo()
  })
  document.addEventListener('click', (event) => {
    if (!els.chatInfo?.hidden && !event.target.closest('#chatInfo') && !event.target.closest('#chatInfoBtn')) {
      closeChatInfo()
    }
    if (
      !els.connectionDetail?.hidden &&
      !event.target.closest('#connectionDetail') &&
      !event.target.closest('#statusBtn')
    ) {
      closeConnectionDetail()
    }
    if (!els.engineInfo?.hidden && !event.target.closest('#engineInfo') && !event.target.closest('#engineInfoBtn')) {
      closeEngineInfo()
    }
  })
  els.menuBtn.addEventListener('click', toggleSidebar)
  els.sidebarClose.addEventListener('click', closeSidebar)
  els.scrim.addEventListener('click', closeSidebar)
  els.filesBtn.addEventListener('click', openFilesSheet)
  els.filesSheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-files-close]')) closeFilesSheet()
  })
  els.filePreview?.addEventListener('click', (event) => {
    if (event.target.closest('[data-preview-close]')) closeFilePreview()
  })
  els.themeBtn.addEventListener('click', () => {
    cycleTheme()
  })
  desktopQuery.addEventListener('change', () => {
    document.body.classList.remove('sidebar-open')
    if (!desktopQuery.matches) {
      document.body.classList.remove('sidebar-collapsed')
    }
  })

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (event.shiftKey) newChat()
      else openPalette()
      return
    }
    if (event.key !== 'Escape') return
    if (els.chatInfo && !els.chatInfo.hidden) return closeChatInfo({ restoreFocus: true })
    if (els.engineInfo && !els.engineInfo.hidden) return closeEngineInfo()
    if (els.connectionDetail && !els.connectionDetail.hidden) return closeConnectionDetail({ restoreFocus: true })
    if (els.findBar && !els.findBar.hidden) return closeFind()
    if (els.quickSwitcher && !els.quickSwitcher.hidden) return closeQuickSwitcher()
    if (els.statsModal && !els.statsModal.hidden) return closeStats()
    if (els.settingsSheet && !els.settingsSheet.hidden) return closeSettings()
    if (els.archiveSheet && !els.archiveSheet.hidden) return closeArchive()
    if (els.bookmarksSheet && !els.bookmarksSheet.hidden) return closeBookmarks()
    if (els.promptSheet && !els.promptSheet.hidden) return closePrompts()
    if (els.memorySheet && !els.memorySheet.hidden) return closeMemory()
    if (els.palette && !els.palette.hidden) return closePalette()
    if (els.commandMenu && !els.commandMenu.hidden) return closeCommandMenu()
    if (els.filePreview && !els.filePreview.hidden) return closeFilePreview()
    if (els.renameModal && !els.renameModal.hidden) return closeRename()
    if (els.shortcutsSheet && !els.shortcutsSheet.hidden) return closeShortcutsSheet()
    if (els.permissionMenu && !els.permissionMenu.hidden) return closePermissionMenu()
    if (!els.confirmModal.hidden) return closeConfirm()
    if (!els.filesSheet.hidden) return closeFilesSheet()
    if (!els.scenarioSheet.hidden) return closeScenarioSheet()
    if (!desktopQuery.matches && document.body.classList.contains('sidebar-open')) closeSidebar()
  })

  document.addEventListener('click', (event) => {
    if (state.convMenuEl && !event.target.closest('.conv-popover') && !event.target.closest('.conv-more')) {
      closeConvMenu({ restoreFocus: false })
    }
    if (usagePopoverEl && !event.target.closest('.usage-pop') && !event.target.closest('.msg-usage-btn')) {
      closeUsagePopover()
    }
    if (!els.permissionMenu || els.permissionMenu.hidden) return
    if (event.target.closest('#permissionMenu') || event.target.closest('#permissionBtn')) return
    closePermissionMenu({ restoreFocus: false })
  })

  /* ── in-conversation find ───────────────────────────────────────────── */

  function clearFindMarks() {
    for (const mark of [...els.thread.querySelectorAll('mark.find-hit')]) {
      const parent = mark.parentNode
      if (!parent) continue
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
      parent.normalize()
    }
    state.findHits = []
  }

  function findTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.parentElement?.closest('button, .code-bar, [aria-hidden="true"]')) nodes.push(node)
    }
    return nodes
  }

  function markVisibleFindHits(query) {
    clearFindMarks()
    const needle = query.toLowerCase()
    if (!needle) return []
    const hits = []
    for (const root of els.thread.querySelectorAll('.md, .bubble-text')) {
      for (const node of findTextNodes(root)) {
        const text = node.nodeValue || ''
        const lower = text.toLowerCase()
        if (!lower.includes(needle)) continue
        const fragment = document.createDocumentFragment()
        let cursor = 0
        let at = lower.indexOf(needle)
        while (at >= 0) {
          if (at > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, at)))
          const mark = document.createElement('mark')
          mark.className = 'find-hit'
          mark.textContent = text.slice(at, at + needle.length)
          fragment.appendChild(mark)
          hits.push(mark)
          cursor = at + needle.length
          at = lower.indexOf(needle, cursor)
        }
        if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)))
        node.parentNode.replaceChild(fragment, node)
      }
    }
    state.findHits = hits
    return hits
  }

  function runFind(query) {
    clearFindMarks()
    state.findQuery = query
    state.findResults = []
    state.findIndex = -1
    if (!query) {
      els.findCount.textContent = '0/0'
      return
    }
    // Never rebuild a live streaming view while searching it.
    if (state.streaming) {
      state.findResults = null
      markVisibleFindHits(query)
      setFindActive(0)
      return
    }
    const needle = query.toLowerCase()
    for (const msg of state.messages) {
      if (msg.internal) continue
      let ordinal = 0
      const sources = msg.role === 'user' ? [msg.text || '']
        : msg.blocks?.length ? msg.blocks.filter(block => block.type === 'text').map(block => block.text || '')
        : [msg.text || '']
      for (const source of sources) {
        // This renderer escapes source HTML. A detached template gives the
        // same text nodes as the answer without mounting the entire history.
        const template = document.createElement('template')
        if (msg.role === 'user') template.content.appendChild(document.createTextNode(source))
        else template.innerHTML = window.Markdown.render(source)
        for (const node of findTextNodes(template.content)) {
          const text = (node.nodeValue || '').toLowerCase()
          let at = text.indexOf(needle)
          while (at >= 0) {
            state.findResults.push({ messageId: msg.id, ordinal: ordinal++ })
            at = text.indexOf(needle, at + needle.length)
          }
        }
      }
    }
    setFindActive(0)
  }

  function setFindActive(index) {
    const results = state.findResults
    const count = results ? results.length : state.findHits.length
    if (!count) {
      els.findCount.textContent = '0/0'
      return
    }
    const next = ((index % count) + count) % count
    state.findIndex = next
    let mark
    if (results) {
      const hit = results[next]
      focusMessage(hit.messageId)
      markVisibleFindHits(state.findQuery)
      const message = [...els.thread.querySelectorAll('[data-message-id]')]
        .find(node => node.dataset.messageId === hit.messageId)
      mark = message?.querySelectorAll('mark.find-hit')[hit.ordinal]
    } else {
      for (const node of state.findHits) node.classList.remove('active')
      mark = state.findHits[next]
    }
    if (mark) {
      mark.classList.add('active')
      mark.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
    els.findCount.textContent = `${next + 1}/${count}`
  }

  function syncFindHash(query) {
    if (!state.currentId) return
    try {
      if (query) history.replaceState(history.state, '', `${location.pathname}#q=${encodeURIComponent(query)}`)
      else if (location.hash.startsWith('#q=')) history.replaceState(history.state, '', location.pathname)
    } catch {}
  }

  function openFind(initial = '') {
    if (!state.currentId) {
      showToast('先打开一段对话再查找')
      return
    }
    els.findBar.hidden = false
    els.findInput.placeholder = state.streaming ? '生成中：查找已加载内容' : '查找全部消息正文'
    if (initial) els.findInput.value = initial
    els.findInput.focus()
    els.findInput.select()
    const query = els.findInput.value.trim()
    if (query) {
      runFind(query)
      syncFindHash(query)
    }
  }

  function closeFind() {
    if (!els.findBar || els.findBar.hidden) return
    els.findBar.hidden = true
    clearTimeout(findTimer)
    els.findInput.value = ''
    clearFindMarks()
    state.findResults = []
    state.findIndex = -1
    els.findCount.textContent = '0/0'
    if (state.threadEnd != null && !state.streaming) {
      state.threadEnd = null
      state.threadWindow = 60
      renderMessages(state.messages)
    }
    syncFindHash('')
    els.input.focus({ preventScroll: true })
  }

  let findTimer = null
  els.findInput?.addEventListener('input', () => {
    clearTimeout(findTimer)
    findTimer = setTimeout(() => {
      const query = els.findInput.value.trim()
      runFind(query)
      syncFindHash(query)
    }, 160)
  })
  els.findInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      setFindActive(state.findIndex + (event.shiftKey ? -1 : 1))
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeFind()
    }
  })
  els.findPrev?.addEventListener('click', () => setFindActive(state.findIndex - 1))
  els.findNext?.addEventListener('click', () => setFindActive(state.findIndex + 1))
  els.findClose?.addEventListener('click', closeFind)

  /* ── shortcuts, focus trap, command palette ─────────────────────────── */

  function openShortcutsSheet() {
    if (!els.shortcutsSheet) return
    renderShortcuts()
    state.lastShortcutsFocus = document.activeElement
    els.shortcutsSheet.hidden = false
    lockShell(true)
    requestAnimationFrame(() => {
      els.shortcutsSheet.querySelector('.sheet-head [data-shortcuts-close]')?.focus({ preventScroll: true })
    })
  }

  function closeShortcutsSheet() {
    if (!els.shortcutsSheet || els.shortcutsSheet.hidden) return
    els.shortcutsSheet.hidden = true
    lockShell(false)
    if (state.lastShortcutsFocus?.isConnected) state.lastShortcutsFocus.focus({ preventScroll: true })
    else els.shortcutsBtn?.focus({ preventScroll: true })
  }

  els.shortcutsBtn?.addEventListener('click', openShortcutsSheet)
  els.shortcutsSheet?.addEventListener('click', (event) => {
    if (event.target.closest('[data-shortcuts-close]')) closeShortcutsSheet()
  })

  els.renameForm?.addEventListener('submit', (event) => void submitRename(event))
  els.renameCancel?.addEventListener('click', closeRename)
  els.renameModal?.addEventListener('click', (event) => {
    if (event.target === els.renameModal) closeRename()
  })

  const COMMANDS = [
    { id: 'new', label: '新对话', desc: '开始一段新对话', icon: 'i-edit', run: () => newChat() },
    { id: 'scenario', label: '浏览场景', desc: '网页总结 / 股票 / 日报', icon: 'i-spark', run: () => openScenarioSheet() },
    { id: 'files', label: '对话文件', desc: '查看本轮与历史文件', icon: 'i-paperclip', run: () => openFilesSheet() },
    { id: 'permission', label: '切换权限', desc: '只读 / 标准 / 完全权限', icon: 'i-shield', run: () => openPermissionMenu() },
    { id: 'theme', label: '切换主题', desc: '跟随系统 / 浅色 / 深色', icon: 'i-sun', run: () => cycleTheme() },
    { id: 'shortcuts', label: '键盘快捷键', desc: '查看全部快捷键', icon: 'i-keyboard', run: () => openShortcutsSheet() },
    { id: 'notify', label: '完成通知', desc: '页面在后台时提醒回答已完成', icon: 'i-alert', run: () => void enableNotifications() },
  ]

  async function enableNotifications() {
    if (!('Notification' in window)) {
      showToast('当前浏览器不支持系统通知', { tone: 'error' })
      return
    }
    if (Notification.permission === 'granted') {
      showToast('完成通知已开启')
      return
    }
    if (Notification.permission === 'denied') {
      showToast('通知已被浏览器阻止，请在站点设置中允许', { tone: 'error' })
      return
    }
    try {
      const permission = await Notification.requestPermission()
      showToast(permission === 'granted' ? '完成通知已开启' : '未开启通知', {
        tone: permission === 'granted' ? undefined : 'error',
      })
    } catch {
      showToast('无法请求通知权限', { tone: 'error' })
    }
  }


  function closeCommandMenu() {
    if (!els.commandMenu || els.commandMenu.hidden) return
    els.commandMenu.hidden = true
    els.commandMenu.replaceChildren()
    state.commandItems = []
    state.commandIndex = 0
  }

  function renderCommandMenu() {
    const items = state.commandItems || []
    if (!items.length) {
      closeCommandMenu()
      return
    }
    els.commandMenu.hidden = false
    els.commandMenu.replaceChildren()
    items.forEach((command, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'command-item' + (index === state.commandIndex ? ' active' : '')
      button.dataset.command = command.id
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(index === state.commandIndex))
      const iconWrap = document.createElement('span')
      iconWrap.className = 'command-icon'
      iconWrap.innerHTML = icon(command.icon)
      const label = document.createElement('span')
      label.textContent = command.label
      const desc = document.createElement('span')
      desc.className = 'command-desc'
      desc.textContent = command.desc
      button.append(iconWrap, label, desc)
      button.addEventListener('mouseenter', () => {
        state.commandIndex = index
        renderCommandMenu()
      })
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => runCommand(command.id))
      els.commandMenu.appendChild(button)
    })
  }

  function updateCommandMenu() {
    const value = els.input.value
    if (!value.startsWith('/') || value.includes('\n') || value.length > 26) {
      closeCommandMenu()
      return
    }
    const query = value.slice(1).trim().toLowerCase()
    const items = COMMANDS.filter((command) => {
      if (!query) return true
      return command.label.toLowerCase().includes(query) || command.id.includes(query)
    })
    state.commandItems = items
    state.commandIndex = Math.min(state.commandIndex, Math.max(0, items.length - 1))
    renderCommandMenu()
  }

  function moveCommand(delta) {
    const items = state.commandItems || []
    if (!items.length) return
    state.commandIndex = (state.commandIndex + delta + items.length) % items.length
    renderCommandMenu()
  }

  function runCommand(id) {
    const command = COMMANDS.find((entry) => entry.id === id)
    if (!command) return
    els.input.value = ''
    resizeInput()
    updateComposerMeta()
    closeCommandMenu()
    saveDraftNow()
    command.run()
  }

  document.addEventListener('click', (event) => {
    if (els.commandMenu.hidden) return
    if (event.target.closest('#commandMenu') || event.target.closest('#input')) return
    closeCommandMenu()
  })

  function openSettings() {
    if (!els.settingsSheet) return
    state.lastSettingsFocus = document.activeElement
    els.settingsSheet.hidden = false
    lockShell(true)
    applyPrefs()
    void updateStorageInfo()
    els.settingsSheet.querySelector('[data-settings-close]')?.focus()
  }

  function closeSettings() {
    if (!els.settingsSheet || els.settingsSheet.hidden) return
    els.settingsSheet.hidden = true
    lockShell(false)
    if (state.lastSettingsFocus?.isConnected) {
      state.lastSettingsFocus.focus({ preventScroll: true })
    }
  }

  /* ── long-term memory ─────────────────────────────────────────────── */

  const MEMORY_SOURCE_LABEL = { manual: '手动', auto: '自动', import: '导入' }

  function setSwitch(button, stateEl, on) {
    if (!button) return
    button.setAttribute('aria-checked', String(Boolean(on)))
    if (stateEl) stateEl.textContent = on ? '已开启' : '已关闭'
  }

  function updateMemoryUI() {
    const memory = state.memory
    const count = Math.max(0, Number(memory.count) || 0)
    if (els.memoryCountBadge) {
      els.memoryCountBadge.hidden = count === 0
      els.memoryCountBadge.textContent = count > 99 ? '99+' : String(count)
    }
    if (els.memoryCount) els.memoryCount.textContent = `${count} 条`
    setSwitch(els.memoryEnabledToggle, els.memoryEnabledState, memory.enabled)
    setSwitch(els.memoryAutoToggle, els.memoryAutoState, memory.autoCapture)
    setSwitch(els.memoryToggle, els.memoryState, memory.enabled)
    if (els.memoryEnabledDesc) {
      els.memoryEnabledDesc.textContent = memory.enabled
        ? '相关记忆会随消息提供给模型。'
        : '记忆已停用，不会注入或自动记录。'
    }
    els.memorySheet?.classList.toggle('memory-off', !memory.enabled)
    if (els.memoryExtract) els.memoryExtract.disabled = !state.currentId
    if (els.memoryClear) els.memoryClear.disabled = count === 0
  }

  function applyMemorySummary(summary) {
    if (!summary || typeof summary !== 'object') return
    if (typeof summary.enabled === 'boolean') state.memory.enabled = summary.enabled
    if (typeof summary.autoCapture === 'boolean') state.memory.autoCapture = summary.autoCapture
    if (Number.isFinite(Number(summary.count))) state.memory.count = Number(summary.count)
    updateMemoryUI()
  }

  async function loadMemory({ silent = false } = {}) {
    if (state.memory.loading) return
    state.memory.loading = true
    try {
      const data = await api('/api/memory')
      state.memory.enabled = data.enabled !== false
      state.memory.autoCapture = data.autoCapture !== false
      state.memory.count = Number(data.count) || 0
      state.memory.items = Array.isArray(data.items) ? data.items : []
      state.memory.loaded = true
      renderMemory()
      updateMemoryUI()
    } catch (error) {
      if (!silent) showToast(error.message || '读取记忆失败', { tone: 'error' })
    } finally {
      state.memory.loading = false
    }
  }

  function memorySourceLabel(source) {
    return MEMORY_SOURCE_LABEL[source] || '手动'
  }

  function renderMemory() {
    if (!els.memoryList) return
    const items = [...state.memory.items].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    )
    els.memoryList.replaceChildren()
    if (els.memoryEmpty) els.memoryEmpty.hidden = items.length > 0
    for (const item of items) {
      const card = document.createElement('article')
      card.className = 'memory-card'
      card.setAttribute('role', 'listitem')
      card.dataset.memoryId = item.id

      const main = document.createElement('div')
      main.className = 'memory-card-main'
      const text = document.createElement('p')
      text.className = 'memory-card-text'
      text.textContent = item.text
      const meta = document.createElement('div')
      meta.className = 'memory-card-meta'
      const source = document.createElement('span')
      source.className = `memory-source ${item.source === 'auto' ? 'auto' : ''}`.trim()
      source.textContent = memorySourceLabel(item.source)
      const time = document.createElement('span')
      time.textContent = relativeTime(item.updatedAt || item.createdAt)
      time.title = new Date(item.updatedAt || item.createdAt).toLocaleString('zh-CN', { hour12: false })
      meta.append(source, time)
      if (item.disabled) {
        const paused = document.createElement('span')
        paused.className = 'memory-source'
        paused.textContent = '已暂停'
        meta.appendChild(paused)
      }
      main.append(text, meta)

      const actions = document.createElement('div')
      actions.className = 'memory-card-actions'
      const pin = document.createElement('button')
      pin.type = 'button'
      pin.className = 'icon-btn' + (item.pinned ? ' active' : '')
      pin.title = item.pinned ? '取消置顶' : '置顶这条记忆'
      pin.setAttribute('aria-label', pin.title)
      pin.setAttribute('aria-pressed', String(Boolean(item.pinned)))
      pin.innerHTML = icon('i-pin')
      pin.addEventListener('click', () => void toggleMemoryPin(item))
      actions.appendChild(pin)

      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'icon-btn'
      edit.title = '编辑这条记忆'
      edit.setAttribute('aria-label', '编辑这条记忆')
      edit.innerHTML = icon('i-edit')
      edit.addEventListener('click', () => startMemoryEdit(card, item))
      actions.appendChild(edit)

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'icon-btn'
      remove.title = '删除这条记忆'
      remove.setAttribute('aria-label', '删除这条记忆')
      remove.innerHTML = icon('i-trash')
      remove.addEventListener('click', () => void deleteMemory(item))
      actions.appendChild(remove)

      card.append(main, actions)
      els.memoryList.appendChild(card)
    }
  }

  async function openMemory() {
    if (!els.memorySheet) return
    state.lastMemoryFocus = document.activeElement
    els.memorySheet.hidden = false
    lockShell(true)
    updateMemoryUI()
    renderMemory()
    els.memorySheet.querySelector('[data-memory-close]')?.focus()
    await loadMemory()
  }

  function closeMemory() {
    if (!els.memorySheet || els.memorySheet.hidden) return
    els.memorySheet.hidden = true
    lockShell(false)
    if (state.lastMemoryFocus?.isConnected) {
      state.lastMemoryFocus.focus({ preventScroll: true })
    }
  }

  async function saveMemorySettings(patch) {
    try {
      const data = await api('/api/memory/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      state.memory.enabled = data.enabled !== false
      state.memory.autoCapture = data.autoCapture !== false
      if (Number.isFinite(Number(data.count))) state.memory.count = Number(data.count)
      updateMemoryUI()
      if (typeof patch.enabled === 'boolean') {
        showToast(patch.enabled ? '记忆已开启' : '记忆已关闭，不会注入或自动记录', {
          iconId: 'i-memory',
        })
      } else if (typeof patch.autoCapture === 'boolean') {
        showToast(patch.autoCapture ? '已开启自动记录' : '已关闭自动记录', { iconId: 'i-memory' })
      }
    } catch (error) {
      showToast(error.message || '保存记忆设置失败', { tone: 'error' })
      updateMemoryUI()
    }
  }

  async function submitMemory(event) {
    event?.preventDefault()
    const text = els.memoryInput?.value.trim() || ''
    if (!text) {
      if (els.memoryError) {
        els.memoryError.textContent = '写点想让我记住的内容'
        els.memoryError.hidden = false
      }
      els.memoryInput?.focus()
      return
    }
    if (els.memoryAdd) {
      els.memoryAdd.disabled = true
      els.memoryAdd.textContent = '添加中…'
    }
    if (els.memoryError) els.memoryError.hidden = true
    try {
      const data = await api('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ text }),
      })
      const item = data.item
      state.memory.count = Number(data.count) || state.memory.count
      if (item) {
        state.memory.items = [item, ...state.memory.items.filter((entry) => entry.id !== item.id)]
      }
      if (els.memoryInput) els.memoryInput.value = ''
      renderMemory()
      updateMemoryUI()
      showToast(data.created ? '已添加记忆' : '这条内容已经在记忆里了', { iconId: 'i-memory' })
    } catch (error) {
      if (els.memoryError) {
        els.memoryError.textContent = error.message || '添加失败'
        els.memoryError.hidden = false
      }
    } finally {
      if (els.memoryAdd) {
        els.memoryAdd.disabled = false
        els.memoryAdd.textContent = '添加'
      }
    }
  }

  async function toggleMemoryPin(item) {
    try {
      const data = await api(`/api/memory/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !item.pinned }),
      })
      Object.assign(item, data.item)
      if (Number.isFinite(Number(data.count))) state.memory.count = Number(data.count)
      renderMemory()
      updateMemoryUI()
    } catch (error) {
      showToast(error.message || '更新记忆失败', { tone: 'error' })
    }
  }

  async function deleteMemory(item) {
    try {
      const data = await api(`/api/memory/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      state.memory.items = state.memory.items.filter((entry) => entry.id !== item.id)
      state.memory.count = Number(data.count) || Math.max(0, state.memory.count - 1)
      renderMemory()
      updateMemoryUI()
      showToast('已删除这条记忆', { iconId: 'i-trash' })
    } catch (error) {
      showToast(error.message || '删除记忆失败', { tone: 'error' })
    }
  }

  function startMemoryEdit(card, item) {
    const main = card.querySelector('.memory-card-main')
    if (!main) return
    const form = document.createElement('form')
    form.className = 'memory-edit'
    const area = document.createElement('textarea')
    area.maxLength = 500
    area.value = item.text
    area.setAttribute('aria-label', '编辑记忆内容')
    const actions = document.createElement('div')
    actions.className = 'memory-edit-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    const save = document.createElement('button')
    save.type = 'submit'
    save.className = 'primary'
    save.textContent = '保存'
    actions.append(cancel, save)
    form.append(area, actions)
    main.replaceChildren(form)
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
    cancel.addEventListener('click', () => renderMemory())
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const text = area.value.trim()
      if (!text) {
        area.focus()
        return
      }
      save.disabled = true
      save.textContent = '保存中…'
      try {
        const data = await api(`/api/memory/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ text }),
        })
        Object.assign(item, data.item)
        if (Number.isFinite(Number(data.count))) state.memory.count = Number(data.count)
        renderMemory()
        updateMemoryUI()
        showToast('已更新记忆', { iconId: 'i-memory' })
      } catch (error) {
        showToast(error.message || '保存记忆失败', { tone: 'error' })
        save.disabled = false
        save.textContent = '保存'
      }
    })
  }

  async function clearMemories() {
    if (!state.memory.count) return showToast('还没有记忆')
    askConfirm({
      title: `清空 ${state.memory.count} 条记忆？`,
      body: '所有长期记忆都会被删除，之后无法恢复。',
      okLabel: '清空',
      onOk: async () => {
        try {
          await api('/api/memory', { method: 'DELETE' })
          state.memory.items = []
          state.memory.count = 0
          renderMemory()
          updateMemoryUI()
          showToast('已清空记忆', { iconId: 'i-memory' })
        } catch (error) {
          showToast(error.message || '清空失败', { tone: 'error' })
        }
      },
    })
  }

  async function extractMemories() {
    if (!state.currentId) return showToast('先打开一段对话，再整理记忆', { tone: 'error' })
    const button = els.memoryExtract
    const original = button?.textContent || '从当前对话整理'
    if (button) {
      button.disabled = true
      button.textContent = '整理中…'
    }
    try {
      const data = await api('/api/memory/extract', {
        method: 'POST',
        body: JSON.stringify({ conversationId: state.currentId }),
      })
      const candidates = Array.isArray(data.candidates) ? data.candidates : []
      if (!candidates.length) {
        showToast('这段对话里没有发现新的可记住内容')
        return
      }
      const preview = candidates
        .slice(0, 4)
        .map((text) => `· ${text}`)
        .join('；')
      askConfirm({
        title: `发现 ${candidates.length} 条可记住的内容`,
        body: `${preview}${candidates.length > 4 ? '…' : ''}`,
        okLabel: '全部添加',
        danger: false,
        onOk: async () => {
          let added = 0
          for (const text of candidates) {
            try {
              const result = await api('/api/memory', {
                method: 'POST',
                body: JSON.stringify({ text }),
              })
              if (result.created) added += 1
            } catch {}
          }
          await loadMemory({ silent: true })
          showToast(added ? `已添加 ${added} 条记忆` : '这些内容已经在记忆里了', {
            iconId: 'i-memory',
          })
        },
      })
    } catch (error) {
      showToast(error.message || '整理记忆失败', { tone: 'error' })
    } finally {
      if (button) {
        button.disabled = !state.currentId
        button.textContent = original
      }
    }
  }

  async function rememberMessage(text) {
    const value = String(text || '').trim()
    if (!value) return
    if ([...value].length > 500) {
      await openMemory()
      if (els.memoryInput) {
        els.memoryInput.value = [...value].slice(0, 480).join('') + '…'
        els.memoryInput.focus()
      }
      showToast('内容较长，已填入记忆框，请精简后添加')
      return
    }
    try {
      const data = await api('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ text: value }),
      })
      state.memory.count = Number(data.count) || state.memory.count
      if (data.item) {
        state.memory.items = [data.item, ...state.memory.items.filter((entry) => entry.id !== data.item.id)]
      }
      updateMemoryUI()
      showToast(data.created ? '已加入记忆' : '这条内容已经在记忆里了', {
        iconId: 'i-memory',
        actionLabel: '查看',
        onAction: () => void openMemory(),
      })
    } catch (error) {
      showToast(error.message || '加入记忆失败', { tone: 'error' })
    }
  }

  async function toggleNotify() {
    if (!('Notification' in window)) {
      showToast('当前浏览器不支持系统通知', { tone: 'error' })
      return
    }
    if (state.prefs.notify) {
      state.prefs.notify = false
      savePrefs()
      applyPrefs()
      showToast('已关闭完成通知')
      return
    }
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission().catch(() => 'denied')
    if (permission !== 'granted') {
      showToast('浏览器拒绝了通知权限，可在站点设置里开启', { tone: 'error' })
      return
    }
    state.prefs.notify = true
    savePrefs()
    applyPrefs()
    showToast('任务完成时会通知你')
  }

  function notifyCompletion() {
    if (!state.prefs.notify || !document.hidden) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const text =
      [...els.thread.querySelectorAll('.msg.assistant .md')].at(-1)?.innerText?.trim() ||
      '助手已完成回答'
    try {
      const notification = new Notification('DSH Chat · 回答已完成', {
        body: text.slice(0, 120),
        tag: `dsh-${state.currentId || 'chat'}`,
        silent: false,
      })
      notification.onclick = () => {
        window.focus()
        if (state.currentId) void openConversation(state.currentId)
        notification.close()
      }
    } catch {}
  }

  async function backupAll() {
    els.backupBtn.disabled = true
    els.backupBtn.textContent = '导出中…'
    try {
      const response = await fetch('/api/backup', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`导出失败（${response.status}）`)
      const data = await response.json()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadText(`dsh-chat-backup-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
      showToast(`已导出 ${data.count || 0} 段对话`)
    } catch (error) {
      showToast(error.message || '导出失败', { tone: 'error' })
    } finally {
      els.backupBtn.disabled = false
      els.backupBtn.textContent = '导出'
    }
  }

  els.settingsBtn?.addEventListener('click', openSettings)
  els.settingsSheet?.addEventListener('click', (event) => {
    if (event.target.closest('[data-settings-close]')) closeSettings()
  })
  document.querySelectorAll('button[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.themeOption)
      applyPrefs()
    })
  })
  document.querySelectorAll('button[data-density]').forEach((button) => {
    button.addEventListener('click', () => {
      state.prefs.density = button.dataset.density === 'compact' ? 'compact' : 'comfortable'
      savePrefs()
      applyPrefs()
    })
  })
  document.querySelectorAll('button[data-font]').forEach((button) => {
    button.addEventListener('click', () => {
      state.prefs.fontScale = Number(button.dataset.font) || 1
      savePrefs()
      applyPrefs()
    })
  })
  els.notifyToggle?.addEventListener('click', () => void toggleNotify())
  els.backupBtn?.addEventListener('click', () => void backupAll())

  els.memoryBtn?.addEventListener('click', () => void openMemory())
  els.memorySheet?.addEventListener('click', (event) => {
    if (event.target.closest('[data-memory-close]')) closeMemory()
  })
  els.memoryForm?.addEventListener('submit', (event) => void submitMemory(event))
  els.memoryInput?.addEventListener('input', () => {
    if (els.memoryError) els.memoryError.hidden = true
  })
  els.memoryEnabledToggle?.addEventListener('click', () =>
    void saveMemorySettings({ enabled: !state.memory.enabled }),
  )
  els.memoryAutoToggle?.addEventListener('click', () =>
    void saveMemorySettings({ autoCapture: !state.memory.autoCapture }),
  )
  els.memoryToggle?.addEventListener('click', () =>
    void saveMemorySettings({ enabled: !state.memory.enabled }),
  )
  els.memoryManageBtn?.addEventListener('click', () => {
    closeSettings()
    void openMemory()
  })
  els.memoryExtract?.addEventListener('click', () => void extractMemories())
  els.memoryClear?.addEventListener('click', () => void clearMemories())

  function readKey(id) {
    return `dsh.read.${id}`
  }

  function markConversationRead(id) {
    if (!id) return
    try {
      localStorage.setItem(readKey(id), String(Date.now()))
    } catch {}
  }

  function isConversationUnread(conv) {
    if (!conv || conv.id === state.currentId) return false
    try {
      const raw = localStorage.getItem(readKey(conv.id))
      if (!raw) return false
      const read = Number(raw) || 0
      return Number(conv.updatedAt) > read + 1500 && (conv.messageCount || 0) > 0
    } catch {
      return false
    }
  }

  function updateReadProgress() {
    if (!els.readProgress) return
    if (!state.currentId || els.thread.hidden) {
      els.readProgress.style.width = '0%'
      els.readProgress.hidden = true
      return
    }
    const el = els.scrollArea
    const max = el.scrollHeight - el.clientHeight
    const ratio = max > 8 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0
    els.readProgress.style.width = `${Math.round(ratio * 100)}%`
    els.readProgress.hidden = max <= 8
  }

  function openBookmarks() {
    if (!els.bookmarksSheet) return
    state.lastBookmarksFocus = document.activeElement
    els.bookmarksSheet.hidden = false
    lockShell(true)
    renderBookmarks()
    els.bookmarksSheet.querySelector('[data-bookmarks-close]')?.focus()
  }

  function closeBookmarks() {
    if (!els.bookmarksSheet || els.bookmarksSheet.hidden) return
    els.bookmarksSheet.hidden = true
    lockShell(false)
    if (state.lastBookmarksFocus?.isConnected) {
      state.lastBookmarksFocus.focus({ preventScroll: true })
    }
  }

  function renderBookmarks() {
    els.bookmarksList.replaceChildren()
    if (!state.bookmarks.length) {
      const empty = document.createElement('p')
      empty.className = 'archive-empty'
      empty.textContent = '还没有收藏。在消息下方点星标即可收藏。'
      els.bookmarksList.appendChild(empty)
      return
    }
    for (const item of [...state.bookmarks].reverse()) {
      const row = document.createElement('div')
      row.className = 'bookmark-row'
      const main = document.createElement('button')
      main.type = 'button'
      main.className = 'bookmark-main'
      const text = document.createElement('span')
      text.className = 'bookmark-text'
      text.textContent = item.text || '（无文字）'
      const meta = document.createElement('span')
      meta.className = 'bookmark-meta'
      meta.textContent = `${item.title || '对话'} · ${relativeTime(item.at)}`
      main.append(text, meta)
      main.addEventListener('click', () => {
        closeBookmarks()
        void openConversation(item.conversationId, { messageId: item.messageId })
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'bookmark-remove'
      remove.setAttribute('aria-label', '取消收藏')
      remove.innerHTML = icon('i-trash')
      remove.addEventListener('click', () => {
        state.bookmarks = state.bookmarks.filter((entry) => entry !== item)
        saveBookmarks()
        renderBookmarks()
        showToast('已取消收藏')
      })
      row.append(main, remove)
      els.bookmarksList.appendChild(row)
    }
  }

  function openPrompts() {
    if (!els.promptSheet) return
    state.lastPromptsFocus = document.activeElement
    els.promptSheet.hidden = false
    lockShell(true)
    renderPrompts()
    els.promptSheet.querySelector('[data-prompts-close]')?.focus()
  }

  function closePrompts() {
    if (!els.promptSheet || els.promptSheet.hidden) return
    els.promptSheet.hidden = true
    lockShell(false)
    if (state.lastPromptsFocus?.isConnected) {
      state.lastPromptsFocus.focus({ preventScroll: true })
    }
  }

  function renderPrompts() {
    els.promptList.replaceChildren()
    for (const prompt of state.prompts) {
      const card = document.createElement('div')
      card.className = 'prompt-card'
      const copy = document.createElement('div')
      copy.className = 'prompt-copy'
      const name = document.createElement('span')
      name.className = 'prompt-name'
      name.textContent = prompt.name
      const preview = document.createElement('span')
      preview.className = 'prompt-preview'
      preview.textContent = prompt.text
      copy.append(name, preview)
      const actions = document.createElement('div')
      actions.className = 'prompt-actions'
      const insert = document.createElement('button')
      insert.type = 'button'
      insert.className = 'insert'
      insert.textContent = '插入'
      insert.setAttribute('aria-label', `插入提示词：${prompt.name}`)
      insert.addEventListener('click', () => {
        closePrompts()
        const draft = els.input.value
        els.input.value = draft.trim() ? `${draft}\n\n${prompt.text}` : prompt.text
        resizeInput()
        updateComposerMeta()
        els.input.focus()
        els.input.setSelectionRange(els.input.value.length, els.input.value.length)
        saveDraftNow()
        if (draft.trim()) showToast('提示词已追加，原草稿已保留')
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '删除'
      remove.setAttribute('aria-label', `删除提示词：${prompt.name}`)
      remove.addEventListener('click', () => {
        const position = state.prompts.indexOf(prompt)
        state.prompts = state.prompts.filter((entry) => entry !== prompt)
        savePrompts()
        renderPrompts()
        const focusRow = Math.min(position, state.prompts.length - 1)
        const focusTarget = els.promptList.children[focusRow]?.querySelector('button') || els.promptName
        focusTarget?.focus({ preventScroll: true })
        showToast(`已删除「${prompt.name}」`, {
          actionLabel: '撤销',
          onAction: () => {
            if (!state.prompts.some((entry) => entry.id === prompt.id)) {
              state.prompts.splice(Math.max(0, Math.min(position, state.prompts.length)), 0, prompt)
              savePrompts()
            }
            if (!els.promptSheet.hidden) {
              renderPrompts()
              const restoredIndex = state.prompts.findIndex((entry) => entry.id === prompt.id)
              els.promptList.children[restoredIndex]?.querySelector('button')?.focus({ preventScroll: true })
            } else els.input.focus({ preventScroll: true })
          },
        })
      })
      actions.append(insert, remove)
      card.append(copy, actions)
      els.promptList.appendChild(card)
    }
  }

  els.promptForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    const name = els.promptName.value.trim()
    const text = els.promptText.value.trim()
    if (!name || !text) return showToast('请填写名称和内容', { tone: 'error' })
    state.prompts.unshift({ id: `p-${Date.now()}`, name: name.slice(0, 24), text: text.slice(0, 2000) })
    savePrompts()
    els.promptName.value = ''
    els.promptText.value = ''
    renderPrompts()
    showToast('提示词已保存')
  })

  els.bookmarksBtn?.addEventListener('click', openBookmarks)
  els.bookmarksSheet?.addEventListener('click', (event) => {
    if (event.target.closest('[data-bookmarks-close]')) closeBookmarks()
  })
  els.promptsBtn?.addEventListener('click', openPrompts)
  els.promptSheet?.addEventListener('click', (event) => {
    if (event.target.closest('[data-prompts-close]')) closePrompts()
  })

  async function summarizeConversation(id) {
    if (state.streaming) return showToast('请先停止当前生成', { tone: 'error' })
    askConfirm({
      title: '总结这段对话？',
      body: '会新增一轮模型调用，并把结构化总结作为新回答写入这段对话。',
      okLabel: '开始总结',
      danger: false,
      onOk: async () => {
        if (state.currentId !== id) {
          await openConversation(id)
        }
        if (state.currentId !== id) return
        await sendMessage(
          '请用简洁的结构总结这段对话：\n1. 主题与目标\n2. 关键结论\n3. 待办 / 未决问题\n4. 涉及的重要文件\n不要使用工具，不要编造未出现的信息。',
        )
      },
    })
  }

  async function updateStorageInfo() {
    if (!els.storageInfo) return
    let text = '本机存储数据暂不可用'
    try {
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate()
        const used = estimate.usage || 0
        text = `本机缓存约 ${formatBytes(used)}${estimate.quota ? ` / 配额 ${formatBytes(estimate.quota)}` : ''}`
      }
      let localBytes = 0
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        localBytes += (key?.length || 0) + (localStorage.getItem(key)?.length || 0)
      }
      text += ` · 浏览器本地键值 ${formatBytes(localBytes)}`
    } catch {}
    els.storageInfo.textContent = text
  }

  async function importBackup(file) {
    if (!file) return
    if (file.size > 24 * 1024 * 1024) return showToast('备份超过 24MB，无法导入', { tone: 'error' })
    els.importBtn.disabled = true
    els.importBtn.textContent = '导入中…'
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      if (!Array.isArray(payload.conversations)) throw new Error('不是有效的备份文件')
      const response = await fetch('/api/backup/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `导入失败（${response.status}）`)
      await refreshConversations()
      showToast(`已导入 ${data.imported || 0} 段对话`)
    } catch (error) {
      showToast(error.message || '导入失败', { tone: 'error' })
    } finally {
      els.importBtn.disabled = false
      els.importBtn.textContent = '导入'
      els.backupInput.value = ''
    }
  }

  els.importBtn?.addEventListener('click', () => els.backupInput?.click())
  els.backupInput?.addEventListener('change', () => void importBackup(els.backupInput.files?.[0]))

  els.markAllReadBtn?.addEventListener('click', () => {
    const at = Date.now()
    for (const conv of state.conversations) {
      try {
        localStorage.setItem(readKey(conv.id), String(at))
      } catch {}
    }
    renderConversations()
    showToast('已全部标记为已读')
  })

  async function openArchive() {
    if (!els.archiveSheet) return
    state.lastArchiveFocus = document.activeElement
    els.archiveSheet.hidden = false
    lockShell(true)
    els.archiveList.replaceChildren()
    els.archiveList.innerHTML = '<p class="archive-empty">正在加载…</p>'
    try {
      const data = await api('/api/conversations?archived=1&limit=100')
      state.archived = data.conversations || []
      renderArchiveList()
    } catch (error) {
      els.archiveList.innerHTML = '<p class="archive-empty">加载失败，请稍后重试</p>'
    }
    els.archiveSheet.querySelector('[data-archive-close]')?.focus()
  }

  function closeArchive() {
    if (!els.archiveSheet || els.archiveSheet.hidden) return
    els.archiveSheet.hidden = true
    lockShell(false)
    if (state.lastArchiveFocus?.isConnected) state.lastArchiveFocus.focus({ preventScroll: true })
  }

  function renderArchiveList() {
    els.archiveList.replaceChildren()
    if (!state.archived.length) {
      const empty = document.createElement('p')
      empty.className = 'archive-empty'
      empty.textContent = '归档箱是空的。归档对话后可以在这里找回。'
      els.archiveList.appendChild(empty)
      return
    }
    for (const conv of state.archived) {
      const row = document.createElement('div')
      row.className = 'archive-row'
      const main = document.createElement('div')
      main.className = 'archive-row-main'
      const title = document.createElement('span')
      title.className = 'archive-row-title'
      title.textContent = conv.title || '新对话'
      const meta = document.createElement('span')
      meta.className = 'archive-row-meta'
      meta.textContent = `${relativeTime(conv.updatedAt)} · ${conv.messageCount || 0} 条`
      main.append(title, meta)
      const actions = document.createElement('div')
      actions.className = 'archive-actions'
      const open = document.createElement('button')
      open.type = 'button'
      open.textContent = '打开'
      open.addEventListener('click', () => {
        closeArchive()
        void openConversation(conv.id)
      })
      const restore = document.createElement('button')
      restore.type = 'button'
      restore.textContent = '恢复'
      restore.addEventListener('click', async () => {
        try {
          await api(`/api/conversations/${conv.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ archived: false }),
          })
          state.archived = state.archived.filter((item) => item.id !== conv.id)
          renderArchiveList()
          await refreshConversations()
          showToast('已恢复到对话列表')
        } catch (error) {
          showToast(error.message || '恢复失败', { tone: 'error' })
        }
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '删除'
      remove.addEventListener('click', () => {
        askConfirm({
          title: `删除「${conv.title || '这个对话'}」？`,
          body: '归档中的对话会被永久删除，可在 8 秒内撤销。',
          okLabel: '删除',
          onOk: async () => {
            try {
              await api(`/api/conversations/${conv.id}`, { method: 'DELETE' })
              state.archived = state.archived.filter((item) => item.id !== conv.id)
              renderArchiveList()
              showToast('已删除', {
                icon: 'i-trash',
                actionLabel: '撤销',
                duration: 6500,
                onAction: async () => {
                  await api(`/api/conversations/${conv.id}/restore`, { method: 'POST' })
                  await refreshConversations()
                  await openArchive()
                },
              })
            } catch (error) {
              showToast(error.message || '删除失败', { tone: 'error' })
            }
          },
        })
      })
      actions.append(open, restore, remove)
      row.append(main, actions)
      els.archiveList.appendChild(row)
    }
  }

  els.archiveBtn?.addEventListener('click', () => void openArchive())
  els.archiveSheet?.addEventListener('click', (event) => {
    if (event.target.closest('[data-archive-close]')) closeArchive()
  })

  function setSelectMode(enabled) {
    state.selectMode = enabled
    state.selected.clear()
    els.manageBtn.textContent = enabled ? '完成' : '管理'
    els.manageBtn.classList.toggle('active', enabled)
    els.batchBar.hidden = !enabled
    updateBatchBar()
    renderConversations()
  }

  function updateBatchBar() {
    els.batchCount.textContent = `已选 ${state.selected.size} 条`
    els.batchArchive.disabled = state.selected.size === 0
    els.batchDelete.disabled = state.selected.size === 0
  }

  function toggleSelected(id) {
    if (state.selected.has(id)) state.selected.delete(id)
    else state.selected.add(id)
    const item = [...els.convList.querySelectorAll('.conv-item')].find(
      (node) => node.dataset.id === id,
    )
    if (item) item.classList.toggle('selected', state.selected.has(id))
    updateBatchBar()
  }

  async function runConversationBatch(ids, mutate, { removeFromList = false, deleting = false } = {}) {
    if (!ids.length || state.batchBusy) return null
    state.batchBusy = true
    const controls = [els.manageBtn, els.batchCancel, els.batchArchive, els.batchDelete]
    controls.forEach((button) => { if (button) button.disabled = true })
    els.batchBar?.setAttribute('aria-busy', 'true')
    // Keep the selection stable while requests and the following list refresh run.
    els.convList.inert = true
    const result = { succeeded: [], failed: [], refreshFailed: false }
    try {
      for (const id of ids) {
        try {
          await mutate(id)
          result.succeeded.push(id)
        } catch {
          result.failed.push(id)
        }
      }
      if (removeFromList) {
        const succeeded = new Set(result.succeeded)
        state.conversations = state.conversations.filter((conv) => !succeeded.has(conv.id))
        state.searchResults = state.searchResults.filter((conv) => !succeeded.has(conv.id))
        if (deleting && succeeded.has(state.currentId)) showEmptyChat()
        if (result.failed.length) {
          state.selected = new Set(result.failed)
          updateBatchBar()
          renderConversations()
        } else {
          setSelectMode(false)
        }
      }
      controls.forEach((button) => { if (button) button.disabled = true })
      try {
        await refreshConversations()
      } catch {
        // A failed read must not erase the known mutation outcome.
        result.refreshFailed = true
      }
      return result
    } finally {
      state.batchBusy = false
      els.convList.inert = false
      els.batchBar?.removeAttribute('aria-busy')
      if (els.manageBtn) els.manageBtn.disabled = false
      if (els.batchCancel) els.batchCancel.disabled = false
      updateBatchBar()
    }
  }

  function reportConversationBatch(result, label, undo) {
    if (!result) return
    const completed = result.succeeded.length
    const failed = result.failed.length
    let message = completed ? `已${label} ${completed} 段对话` : `${label}失败，${failed} 段对话未更改`
    if (completed && failed) message += `，${failed} 段失败，可重试`
    if (result.refreshFailed) message += '；列表刷新失败，请刷新页面'
    showToast(message, {
      tone: failed || result.refreshFailed ? 'error' : 'normal',
      actionLabel: completed && undo ? '撤销' : '',
      onAction: completed && undo ? () => undo(result.succeeded) : null,
      duration: completed && undo ? 6500 : failed || result.refreshFailed ? 6500 : 2800,
    })
  }

  async function batchArchive() {
    const result = await runConversationBatch([...state.selected], (id) => api(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    }), { removeFromList: true })
    reportConversationBatch(result, '归档', async (ids) => {
      const restored = await runConversationBatch(ids, (id) => api(`/api/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: false }),
      }))
      reportConversationBatch(restored, '恢复')
    })
  }

  async function batchDelete() {
    const ids = [...state.selected]
    if (!ids.length || state.batchBusy || !els.confirmModal.hidden) return
    askConfirm({
      title: `删除选中的 ${ids.length} 段对话？`,
      body: '删除后可在 8 秒内从最近一次操作撤销；批量删除建议先归档。',
      okLabel: '删除',
      onOk: async () => {
        const result = await runConversationBatch(ids, (id) => api(`/api/conversations/${id}`, {
          method: 'DELETE',
        }), { removeFromList: true, deleting: true })
        reportConversationBatch(result, '删除', async (deletedIds) => {
          const restored = await runConversationBatch(deletedIds, (id) => api(`/api/conversations/${id}/restore`, {
            method: 'POST',
          }))
          reportConversationBatch(restored, '恢复')
        })
      },
    })
  }

  els.manageBtn?.addEventListener('click', () => setSelectMode(!state.selectMode))
  els.batchCancel?.addEventListener('click', () => setSelectMode(false))
  els.batchArchive?.addEventListener('click', () => void batchArchive())
  els.batchDelete?.addEventListener('click', () => void batchDelete())

  let quickSearchTimer = null
  let quickSearchVersion = 0
  let quickSearchController = null

  function invalidateQuickSearch() {
    clearTimeout(quickSearchTimer)
    quickSearchTimer = null
    quickSearchVersion += 1
    quickSearchController?.abort()
    quickSearchController = null
    return quickSearchVersion
  }

  function openQuickSwitcher() {
    if (!els.quickSwitcher) return
    if (!els.quickSwitcher.hidden) return els.quickInput.focus({ preventScroll: true })
    els.quickSwitcher.hidden = false
    state.lastQuickFocus = document.activeElement
    lockShell(true)
    els.quickInput.value = ''
    els.quickInput.setAttribute('aria-expanded', 'true')
    state.quickIndex = 0
    scheduleQuickSearch({ immediate: true })
    requestAnimationFrame(() => els.quickInput.focus())
  }

  function closeQuickSwitcher() {
    if (!els.quickSwitcher || els.quickSwitcher.hidden) return
    invalidateQuickSearch()
    els.quickSwitcher.hidden = true
    els.quickInput.setAttribute('aria-expanded', 'false')
    els.quickInput.removeAttribute('aria-activedescendant')
    els.quickList.removeAttribute('aria-busy')
    lockShell(false)
    if (state.lastQuickFocus?.isConnected) state.lastQuickFocus.focus({ preventScroll: true })
  }

  function setQuickStatus(message, { loading = false, retry = false } = {}) {
    const status = $('#quickStatus')
    state.quickItems = []
    els.quickList.replaceChildren()
    els.quickList.setAttribute('aria-busy', String(loading))
    els.quickInput.removeAttribute('aria-activedescendant')
    status.replaceChildren(document.createTextNode(message))
    status.hidden = false
    if (retry) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ghost-btn'
      button.textContent = '重试搜索'
      button.addEventListener('click', () => {
        els.quickInput.focus({ preventScroll: true })
        scheduleQuickSearch({ immediate: true })
      })
      status.append(' ', button)
    }
  }

  function scheduleQuickSearch({ immediate = false } = {}) {
    const version = invalidateQuickSearch()
    const query = els.quickInput.value.trim()
    setQuickStatus('正在搜索全部对话…', { loading: true })
    const run = async () => {
      if (els.quickSwitcher.hidden || version !== quickSearchVersion) return
      const controller = new AbortController()
      quickSearchController = controller
      try {
        const data = await api(`/api/conversations?q=${encodeURIComponent(query)}&limit=12`, {
          signal: controller.signal,
          retry: false,
        })
        if (els.quickSwitcher.hidden || version !== quickSearchVersion) return
        renderQuickList(query, data.conversations || [], Number(data.total) || 0)
      } catch (error) {
        if (els.quickSwitcher.hidden || version !== quickSearchVersion || error.name === 'AbortError') return
        setQuickStatus('搜索暂时不可用，请重试。', { retry: true })
      } finally {
        if (quickSearchController === controller) quickSearchController = null
      }
    }
    if (immediate) void run()
    else quickSearchTimer = setTimeout(() => void run(), 200)
  }

  function syncQuickSelection() {
    let active = null
    for (const [index, button] of [...els.quickList.querySelectorAll('.quick-item')].entries()) {
      const selected = index === state.quickIndex
      button.classList.toggle('active', selected)
      button.setAttribute('aria-selected', String(selected))
      if (selected) active = button
    }
    if (active) els.quickInput.setAttribute('aria-activedescendant', active.id)
    else els.quickInput.removeAttribute('aria-activedescendant')
  }

  function renderQuickList(query, items, total) {
    const needle = query.trim().toLowerCase()
    state.quickItems = items
    state.quickIndex = Math.min(state.quickIndex, Math.max(0, items.length - 1))
    els.quickList.replaceChildren()
    els.quickList.setAttribute('aria-busy', 'false')
    const status = $('#quickStatus')
    status.replaceChildren()
    status.hidden = true
    if (!items.length) {
      setQuickStatus(query ? '没有匹配的对话，试试其他关键词。' : '还没有对话，开始一个新对话吧。')
      return
    }
    if (total > items.length) {
      status.textContent = `找到 ${total} 段对话，显示前 ${items.length} 段。可继续输入缩小范围。`
      status.hidden = false
    }
    items.forEach((conv, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'quick-item' + (index === state.quickIndex ? ' active' : '')
      button.id = `quick-option-${conv.id}`
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(index === state.quickIndex))
      const main = document.createElement('span')
      main.className = 'quick-item-main'
      const title = document.createElement('span')
      title.className = 'quick-item-title'
      if (needle) appendHighlighted(title, conv.title || '新对话', query.trim())
      else title.textContent = conv.title || '新对话'
      const meta = document.createElement('span')
      meta.className = 'quick-item-meta'
      const preview = conv.snippet || conv.preview || ''
      meta.append(document.createTextNode(`${conv.engine === 'codex' ? 'Codex · ' : ''}${relativeTime(conv.updatedAt)}${preview ? ' · ' : ''}`))
      if (needle && conv.snippet) appendHighlighted(meta, preview, query.trim())
      else meta.append(document.createTextNode(preview))
      main.append(title, meta)
      button.appendChild(main)
      button.addEventListener('mouseenter', () => {
        state.quickIndex = index
        syncQuickSelection()
      })
      button.addEventListener('click', () => {
        closeQuickSwitcher()
        void openConversation(conv.id)
      })
      els.quickList.appendChild(button)
    })
    syncQuickSelection()
  }

  els.quickInput?.addEventListener('input', () => {
    state.quickIndex = 0
    scheduleQuickSearch()
  })
  els.quickInput?.addEventListener('keydown', (event) => {
    if (event.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const count = state.quickItems.length
      if (!count) return
      state.quickIndex = (state.quickIndex + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
      syncQuickSelection()
      els.quickList.querySelector('.quick-item.active')?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const conv = state.quickItems[state.quickIndex]
      if (!conv) return
      closeQuickSwitcher()
      void openConversation(conv.id)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeQuickSwitcher()
    }
  })
  els.quickSwitcher?.addEventListener('click', (event) => {
    if (event.target === els.quickSwitcher) closeQuickSwitcher()
  })
  els.quickClose?.addEventListener('click', closeQuickSwitcher)

  function activeOverlay() {
    for (const overlay of [
      els.permissionMenu,
      els.palette,
      els.filePreview,
      els.renameModal,
      els.quickSwitcher,
      els.statsModal,
      els.settingsSheet,
      els.archiveSheet,
      els.bookmarksSheet,
      els.promptSheet,
      els.memorySheet,
      els.confirmModal,
      els.filesSheet,
      els.scenarioSheet,
      els.shortcutsSheet,
    ]) {
      if (overlay && !overlay.hidden) return overlay
    }
    return null
  }

  function navigateMessage(direction) {
    const nodes = [...els.thread.querySelectorAll('.msg')]
    if (!nodes.length) return
    const viewportCenter = els.scrollArea.scrollTop + els.scrollArea.clientHeight / 2
    let index = nodes.findIndex((node) => node.offsetTop + node.offsetHeight / 2 > viewportCenter)
    if (index < 0) index = nodes.length - 1
    if (direction > 0) index = Math.min(nodes.length - 1, index + 1)
    else index = Math.max(0, index - 1)
    const target = nodes[index]
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.classList.remove('msg-flash')
    void target.offsetWidth
    target.classList.add('msg-flash')
    setTimeout(() => target.classList.remove('msg-flash'), 1600)
  }

  document.addEventListener('keydown', (event) => {
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      navigateMessage(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Tab') {
      const overlay = activeOverlay()
      if (!overlay) return
      const panel = overlay.querySelector('.sheet-panel, .modal-card, .permission-menu-card') || overlay
      const focusables = [...panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((node) => node.tabIndex >= 0 && node.getClientRects().length > 0)
      const toastAction = !els.toast.hidden && els.toast.classList.contains('show')
        ? els.toast.querySelector('.toast-action') : null
      if (toastAction) focusables.push(toastAction)
      if (!focusables.length) {
        event.preventDefault()
        return
      }
      const index = focusables.indexOf(document.activeElement)
      const next = index < 0 ? (event.shiftKey ? focusables.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length
      event.preventDefault()
      focusables[next].focus({ preventScroll: true })
      return
    }

    const target = event.target
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') || target?.isContentEditable
    if (event.key === '?' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      openShortcutsSheet()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      if (state.currentId) {
        openFind()
        return
      }
      if (window.innerWidth < 1024) openSidebar()
      els.convSearch.focus()
      els.convSearch.select()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault()
      openQuickSwitcher()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === '/') {
      event.preventDefault()
      els.input.focus()
      return
    }
  })

  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault()
    els.input.focus({ preventScroll: false })
    els.input.scrollIntoView({ block: 'center' })
  })

  /* ── streaming ─────────────────────────────────────────────────────── */

  function setComposerStreaming(streaming) {
    const wasStreaming = els.sendBtn.classList.contains('stop')
    els.sendBtn.classList.toggle('stop', streaming)
    els.sendBtn.setAttribute('aria-label', streaming ? '停止生成' : '发送')
    els.sendBtn.disabled = streaming ? false : !els.input.value.trim() && !state.stagedFiles.length
    els.input.placeholder = streaming ? '可以先输入下一条消息…' : '询问任何问题'
    if (wasStreaming && !streaming && document.hidden) state.unread = true
    setDocumentTitle(state.baseTitle)
  }

  function resizeInput() {
    els.input.style.height = 'auto'
    els.input.style.height = Math.min(Math.max(els.input.scrollHeight, 44), 168) + 'px'
  }

  function draftKey(id = state.currentId) {
    return `dsh.draft.${id || 'new'}`
  }

  function saveDraftNow() {
    try {
      const value = els.input.value
      if (value.trim()) localStorage.setItem(draftKey(), value)
      else localStorage.removeItem(draftKey())
    } catch {}
  }

  function scheduleDraftSave() {
    clearTimeout(state.draftTimer)
    state.draftTimer = setTimeout(saveDraftNow, 320)
  }

  function restoreDraft() {
    let value = ''
    try {
      value = localStorage.getItem(draftKey()) || ''
    } catch {}
    if (els.input.value === value) return
    els.input.value = value
    resizeInput()
    updateComposerMeta()
    els.sendBtn.disabled = state.streaming ? false : (!value.trim() && !state.stagedFiles.length) || [...value].length > 24000
  }

  function clearDraft(id = state.currentId) {
    try {
      localStorage.removeItem(draftKey(id))
    } catch {}
  }

  function updateComposerMeta() {
    const length = [...els.input.value].length
    const visible = length > 12000
    els.charCount.hidden = !visible
    if (visible) {
      els.charCount.textContent = `${length.toLocaleString('zh-CN')} / 24,000`
      els.charCount.classList.toggle('warn', length > 20000 && length <= 24000)
      els.charCount.classList.toggle('over', length > 24000)
      els.input.classList.toggle('over-limit', length > 24000)
    } else {
      els.charCount.classList.remove('warn', 'over')
      els.input.classList.remove('over-limit')
    }
    if (!state.streaming) {
      els.sendBtn.disabled = (length === 0 && !state.stagedFiles.length) || length > 24000
    }
  }

  els.input.addEventListener('input', () => {
    resizeInput()
    updateComposerMeta()
    scheduleDraftSave()
    updateCommandMenu()
    if (!state.streaming) {
      els.sendBtn.disabled = (!els.input.value.trim() && !state.stagedFiles.length) || [...els.input.value].length > 24000
    }
  })

  els.input.addEventListener('keydown', (event) => {
    if (!els.commandMenu.hidden) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveCommand(event.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeCommandMenu()
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        const command = state.commandItems?.[state.commandIndex]
        if (command) {
          event.preventDefault()
          runCommand(command.id)
          return
        }
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      if (state.streaming) {
        showToast('请先停止当前生成')
        return
      }
      els.composer.requestSubmit()
    }
  })

  els.sendBtn.addEventListener('click', (event) => {
    event.preventDefault()
    if (state.streaming) {
      stopStreaming()
      return
    }
    els.composer.requestSubmit()
  })

  els.scenarioGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-scenario]')
    if (card) useScenario(card.dataset.scenario)
  })

  els.scenarioList.addEventListener('click', (event) => {
    const card = event.target.closest('[data-scenario]')
    if (card) useScenario(card.dataset.scenario)
  })

  els.scenarioBtn.addEventListener('click', openScenarioSheet)
  els.engineDsr?.addEventListener('click', () => void selectEngine('dsr'))
  els.engineCodex?.addEventListener('click', () => void selectEngine('codex'))
  els.permissionBtn?.addEventListener('click', (event) => {
    event.stopPropagation()
    openPermissionMenu()
  })
  els.heroScenarios?.addEventListener('click', openScenarioSheet)
  els.heroStart?.addEventListener('click', () => {
    els.input.focus({ preventScroll: true })
    els.input.scrollIntoView({ block: 'nearest' })
  })
  els.scenarioSheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-scenario-close]')) closeScenarioSheet()
  })

  els.uploadBtn.addEventListener('click', () => els.fileInput.click())
  els.filesUploadBtn?.addEventListener('click', () => els.fileInput.click())

  els.convSearch.addEventListener('input', () => {
    state.search = els.convSearch.value
    els.convSearchClear.hidden = !state.search.trim()
    if (!state.search.trim()) {
      state.searchResults = []
      state.searchTotal = 0
      state.searchHasMore = false
      clearTimeout(state.searchTimer)
      renderConversations()
      return
    }
    scheduleSearch()
  })

  els.convSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.convSearch.value) {
      event.preventDefault()
      event.stopPropagation()
      els.convSearch.value = ''
      state.search = ''
      state.searchResults = []
      els.convSearchClear.hidden = true
      renderConversations()
    }
  })

  els.convSearchClear.addEventListener('click', () => {
    els.convSearch.value = ''
    state.search = ''
    state.searchResults = []
    state.searchTotal = 0
    state.searchHasMore = false
    els.convSearchClear.hidden = true
    renderConversations()
    els.convSearch.focus()
  })

  els.convLoadMore.addEventListener('click', () => void loadMoreConversations())

  els.scrollBottom.addEventListener('click', () => scrollToBottom())

  els.composer.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitComposer()
  })

  els.fileInput.addEventListener('change', () => {
    addStagedFiles(els.fileInput.files)
    els.fileInput.value = ''
  })

  els.input.addEventListener('paste', (event) => {
    const items = [...(event.clipboardData?.items || [])]
    const files = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean)
    if (!files.length) return
    event.preventDefault()
    addStagedFiles(files, '粘贴')
  })

  let dragDepth = 0
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files')
  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth += 1
    els.dropOverlay.hidden = false
  })
  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  })
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) els.dropOverlay.hidden = true
  })
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth = 0
    els.dropOverlay.hidden = true
    addStagedFiles(event.dataTransfer.files, '拖拽')
  })

  async function selectEngine(engine) {
    if (state.streaming || state.messages.length) return
    if (engine !== 'dsr' && engine !== 'codex') return
    if (engine === 'codex' && !state.codexAvailable) {
      showToast('本机未找到 Codex CLI')
      return
    }
    if (engine === state.currentEngine) return
    if (state.currentId) {
      try {
        await api(`/api/conversations/${state.currentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ engine }),
        })
      } catch (error) {
        if (isNetworkError(error)) setConnection('offline')
        showToast(error.message || '切换引擎失败')
        return
      }
    }
    state.engine = engine
    state.currentEngine = engine
    localStorage.setItem('dsh.engine', engine)
    const conv = state.conversations.find((item) => item.id === state.currentId)
    if (conv) conv.engine = engine
    setModelLabels()
    updateEngineBar()
    updatePermissionUI()
    renderConversations()
  }

  async function ensureConversation() {
    if (state.currentId) return state.currentId
    const data = await api('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ engine: state.engine, permission: state.permission }),
    })
    const conv = data.conversation
    state.currentId = conv.id
    state.currentEngine = conv.engine === 'codex' ? 'codex' : 'dsr'
    state.engine = state.currentEngine
    state.permission = conv.permission || state.permission
    state.messages = []
    localStorage.removeItem(draftKey(null))
    localStorage.setItem('dsh.current', conv.id)
    localStorage.setItem('dsh.engine', state.currentEngine)
    state.conversations.unshift(conv)
    els.topbarName.textContent = conv.title
    pushRoute(conv.id)
    setModelLabels()
    updatePermissionUI()
    renderConversations()
    return conv.id
  }

  async function sendMessage(text, options = {}) {
    clearQuestions()
    closeFind()
    if (state.threadEnd != null && !state.streaming) {
      state.threadEnd = null
      state.threadWindow = 60
      renderMessages(state.messages)
    }
    let conversationId = options.conversationId || null
    if (!conversationId) {
      try {
        conversationId = await ensureConversation()
      } catch (err) {
        showToast(err.message, { tone: 'error' })
        if (!options.skipUserBubble) {
          els.input.value = text
          resizeInput()
          updateComposerMeta()
        }
        return
      }
    }

    const now = Date.now()
    const attachments = Array.isArray(options.attachments) ? options.attachments : []
    let bubble = null
    if (!options.skipUserBubble) {
      const userMessage = {
        id: options.editOf || `local_${now}`,
        role: 'user',
        text,
        createdAt: now,
        ...(attachments.length ? { attachments } : {}),
      }
      state.messages.push(userMessage)
      updateEngineBar()
      bubble = userBubble(text, now, attachments)
      bubble.dataset.messageId = userMessage.id
      els.thread.appendChild(bubble)
      els.emptyState.hidden = true
      els.thread.hidden = false
    }

    const view = createAssistantView()
    els.thread.appendChild(view.el)
    state.stick = true
    scrollToBottom()
    view.setStatus(state.currentEngine === 'codex' ? '正在启动 Codex…' : '正在启动 DeepSeek Harness…')

    const controller = new AbortController()
    state.streaming = { controller, view, conversationId }
    const streamingRef = state.streaming
    setComposerStreaming(true)
    if (!state.stagedFiles.length) els.input.focus({ preventScroll: true })

    let sawDone = false
    let failed = false
    try {
      const payload = { text }
      if (attachments.length) payload.attachments = attachments
      if (options.retryOf) payload.retryOf = options.retryOf
      if (options.editOf) payload.editOf = options.editOf
      if (options.internal) payload.internal = true
      const res = await fetch(`/api/conversations/${conversationId}/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': options.idempotencyKey || `send_${conversationId}_${now}_${Math.random().toString(36).slice(2, 8)}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (res.status === 401) {
        showLogin()
        throw new Error('登录已失效，请重新输入访问码')
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `请求失败（${res.status}）`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const handle = (line) => {
        if (!line.trim()) return
        let event
        try {
          event = JSON.parse(line)
        } catch {
          return
        }
        if (event.t === 'ready') {
          if (bubble && event.userMessageId) bubble.dataset.messageId = event.userMessageId
          if (event.messageId) view.el.dataset.messageId = event.messageId
        }
        applyStreamEvent(view, event, conversationId)
        if (event.t === 'done') sawDone = true
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          handle(line)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) handle(buffer)

      if (!sawDone) {
        failed = true
        view.finish({ status: 'error', error: '连接提前结束，回答可能不完整' })
        view.addRetry(() => retryRun({ text, conversationId, attachments, view }))
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (streamingRef.detached) return
        view.finish({ status: 'stopped', stopped: true, durationMs: Date.now() - view.startedAt })
        view.notice('已停止生成')
        view.addContinue(() => continueAfterStop())
      } else if (isNetworkError(err)) {
        failed = true
        setConnection('offline')
        state.pendingSend = { conversationId, text, attachments, view, bubble }
        view.finish({ status: 'error', error: '网络连接中断，消息已保留，可直接重试。' })
        view.addRetry(() => retryRun({ text, conversationId, attachments, view }))
        if (bubble) {
          bubble.classList.add('pending')
          if (!bubble.querySelector('.pending-label')) {
            const pending = document.createElement('span')
            pending.className = 'pending-label'
            pending.textContent = '待发送'
            bubble.querySelector('.bubble')?.appendChild(pending)
          }
        }
      } else {
        failed = true
        view.finish({ status: 'error', error: err.message || '网络错误' })
        if (!/正在生成|发送太频繁|已经发送过/.test(err.message || '')) {
          view.addRetry(() => retryRun({ text, conversationId, attachments, view }))
        }
      }
    } finally {
      const detached = Boolean(streamingRef.detached)
      if (state.streaming && state.streaming.view === view) state.streaming = null
      if (!detached) {
        setComposerStreaming(false)
        view.finish({ status: 'done' })
        if (!failed && bubble) {
          bubble.classList.remove('pending')
          bubble.querySelector('.pending-label')?.remove()
        }
        if (!failed) state.pendingSend = null
        if (!failed && document.hidden) markUnread()
      }
      scheduleCacheSave()
      void refreshConversations().catch(() => {})
      void refreshFiles(conversationId)
      void syncConversation(conversationId)
    }
  }

  function retryRun({ text, conversationId, attachments, view }) {
    const pendingBubble = state.pendingSend?.bubble
    if (pendingBubble) {
      pendingBubble.classList.remove('pending')
      pendingBubble.querySelector('.pending-label')?.remove()
    }
    if (state.pendingSend?.view === view) state.pendingSend = null
    if (view) {
      view.destroy?.()
      view.el.remove()
    }
    void sendMessage(text, {
      conversationId,
      attachments,
      skipUserBubble: true,
      idempotencyKey: `retry_${conversationId}_${Date.now()}`,
    })
  }

  function continueAfterStop() {
    void sendMessage('请从中断处继续完成刚才的回答，不要重复已经输出的内容。', {
      internal: true,
      skipUserBubble: true,
    })
  }

  async function submitComposer() {
    if (state.sending || state.streaming) return
    closePermissionMenu({ restoreFocus: false })
    let text = els.input.value.trim()
    const staged = state.stagedFiles.slice()
    if (!text && !staged.length) return
    if ([...text].length > 24000) {
      showToast('消息超过 24,000 字符，请精简后再发送', { tone: 'error' })
      return
    }
    const placeholder = text.match(/\{\{[^}]+\}\}/)
    if (placeholder) {
      showToast('请先替换占位符内容')
      const start = els.input.value.indexOf(placeholder[0])
      els.input.focus()
      els.input.setSelectionRange(start, start + placeholder[0].length)
      return
    }

    saveDraftNow()
    state.sending = true
    els.sendBtn.disabled = true
    try {
      let attachments = []
      if (staged.length) {
        const conversationId = await ensureConversation()
        els.uploadBtn.disabled = true
        const uploaded = await uploadStagedFiles(conversationId)
        if (!uploaded) return
        attachments = uploaded
        clearStagedAttachments()
      }
      els.input.value = ''
      resizeInput()
      updateComposerMeta()
      clearDraft()
      if (!text && attachments.length) text = '请分析我上传的文件。'
      await sendMessage(text, { attachments })
    } catch (error) {
      showToast(error.message || '发送失败', { tone: 'error' })
    } finally {
      state.sending = false
      els.uploadBtn.disabled = false
      updateComposerMeta()
    }
  }

  function applyStreamEvent(view, event, conversationId) {
    switch (event.t) {
      case 'ready':
        if (event.title && (!state.currentId || state.currentId === conversationId)) {
          els.topbarName.textContent = event.title
          setDocumentTitle(event.title)
        }
        break
      case 'session':
        break
      case 'status': {
        if (event.phase === 'turn_start' || event.phase === 'step_start') {
          view.setStatus('正在思考…')
        } else if (event.phase === 'step_end') {
          view.setStatus('正在分析结果…')
        }
        break
      }
      case 'thinking':
        view.addThinking(event.text)
        view.setStatus('正在思考…')
        break
      case 'text':
        view.addText(event.text)
        view.setStatus('正在整理回答…')
        break
      case 'tool_call': {
        const meta = toolMeta(event.tool)
        view.addTool({
          id: event.id,
          tool: event.tool,
          input: event.input,
          summary: event.summary || summarizeInput(event.input),
          status: 'running',
        })
        view.setStatus(`正在运行「${meta.label}」…`)
        break
      }
      case 'tool_result': {
        const pendingQuestion = [...state.questions.entries()].find(
          ([, value]) => value.callId && value.callId === event.id,
        )
        if (pendingQuestion) {
          markRequestResolved(conversationId, pendingQuestion[0])
          state.questions.clear()
          els.questionSlot.hidden = true
          els.questionSlot.replaceChildren()
        }
        const pendingApproval = [...state.approvals.entries()].find(
          ([, value]) => value.callId && value.callId === event.id,
        )
        if (pendingApproval) {
          markRequestResolved(conversationId, pendingApproval[0])
          clearApprovalInline()
        }
        view.updateTool(event.id, { status: event.status, result: event.result })
        view.setStatus('正在分析结果…')
        break
      }
      case 'question':
        showQuestion(event)
        break
      case 'question_resolved': {
        if (typeof event.requestId !== 'string') break
        markRequestResolved(conversationId, event.requestId)
        if (state.questions.has(event.requestId)) {
          state.questions.delete(event.requestId)
          els.questionSlot.hidden = true
          els.questionSlot.replaceChildren()
        }
        break
      }
      case 'delta':
        view.addDelta(event.kind, event.text)
        view.setStatus(event.kind === 'thinking' ? '正在思考…' : '正在生成回答…')
        break
      case 'approval':
        showApproval(event)
        view.setStatus('等待你的授权…')
        break
      case 'approval_resolved': {
        if (typeof event.requestId !== 'string') break
        markRequestResolved(conversationId, event.requestId)
        if (state.approvals.has(event.requestId)) {
          state.approvals.delete(event.requestId)
          clearApprovalInline()
        }
        break
      }
      case 'permission': {
        const allowed = ['read-only', 'workspace-write', 'danger-full-access', 'auto']
        if (allowed.includes(event.permission)) {
          state.permission = event.permission
          updatePermissionUI()
        }
        break
      }
      case 'approval_cancelled':
        expireApprovals('授权已失效')
        break
      case 'notice':
        view.notice(event.text)
        break
      case 'memory': {
        const saved = Array.isArray(event.saved) ? event.saved : []
        if (!saved.length) break
        if (Number.isFinite(Number(event.count))) state.memory.count = Number(event.count)
        if (typeof event.enabled === 'boolean') state.memory.enabled = event.enabled
        updateMemoryUI()
        if (els.memorySheet && !els.memorySheet.hidden) void loadMemory({ silent: true })
        const message =
          saved.length === 1
            ? `已记住：${saved[0].text.length > 28 ? `${saved[0].text.slice(0, 28)}…` : saved[0].text}`
            : `已记住 ${saved.length} 条新内容`
        showToast(message, {
          iconId: 'i-memory',
          actionLabel: '查看',
          onAction: () => void openMemory(),
          duration: 5200,
        })
        break
      }
      case 'error':
        view.setError(event.message)
        break
      case 'done':
        view.finish({
          status: event.status,
          durationMs: event.durationMs,
          usage: event.usage,
          stopped: event.status === 'stopped',
          files: event.files || [],
          createdAt: Date.now(),
          messageId: view.el.dataset.messageId,
          canRegenerate: true,
        })
        if (state.questions.size > 0 && event.status !== 'done') {
          expireQuestions('对话已结束，问题已失效')
        }
        setComposerStreaming(false)
        state.pendingSend = null
        if (state.approvals.size) expireApprovals('对话已结束，授权已失效')
        break
    }
  }

  async function syncConversation(id) {
    if (state.currentId !== id) return
    try {
      const data = await api(`/api/conversations/${id}`)
      state.messages = data.conversation.messages || []
      els.topbarName.textContent = data.conversation.title || 'DSH Chat'
      scheduleCacheSave()
    } catch {}
  }

  function detachStreaming() {
    clearTimeout(state.attachRetryTimer)
    state.attachRetryTimer = null
    const streaming = state.streaming
    if (!streaming) return
    streaming.detached = true
    try {
      streaming.controller.abort()
    } catch {}
    if (streaming.view) streaming.view.destroy?.()
    state.streaming = null
    setComposerStreaming(false)
  }

  async function stopStreaming() {
    clearTimeout(state.attachRetryTimer)
    state.attachRetryTimer = null
    const streaming = state.streaming
    if (!streaming) return
    streaming.stopping = true
    expireQuestions('已停止生成')
    try {
      streaming.controller.abort()
    } catch {}
    try {
      await fetch(`/api/conversations/${streaming.conversationId}/stop`, {
        method: 'POST',
        credentials: 'same-origin',
      })
    } catch {}
    state.streaming = null
    setComposerStreaming(false)
  }

  async function attachRun(conversationId, messageId, attempt = 0) {
    if (state.streaming) detachStreaming()
    const controller = new AbortController()
    let view = null
    let streamRef = null
    let finished = false
    try {
      let response
      try {
        response = await fetchWithRetry(
          `/api/conversations/${conversationId}/attach`,
          {
            credentials: 'same-origin',
            signal: controller.signal,
            headers: { Accept: 'application/x-ndjson' },
          },
          3,
        )
      } catch (error) {
        if (isNetworkError(error)) {
          setConnection('offline')
          const cached = state.liveViews.get(messageId)
          if (cached) cached.setStatus('正在重新连接…')
          scheduleAttachRetry(conversationId, messageId, attempt + 1)
          return
        }
        throw error
      }
      if (response.status === 409) {
        clearTimeout(state.attachRetryTimer)
        state.attachRetryTimer = null
        setConnection('online')
        await openConversation(conversationId, { skipAttach: true })
        return
      }
      if (!response.ok) throw new Error(`恢复生成失败（${response.status}）`)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const handle = (line) => {
        if (!line.trim()) return
        let event
        try {
          event = JSON.parse(line)
        } catch {
          return
        }
        if (event.t === 'reset') {
          clearTimeout(state.attachRetryTimer)
          state.attachRetryTimer = null
          setConnection('online')
          clearQuestionSlot()
          const id = event.messageId || messageId
          const old = state.liveViews.get(id)
          if (old) {
            old.destroy?.()
            state.liveViews.delete(id)
          }
          if (view) view.destroy?.()
          view = createAssistantView()
          view.el.dataset.messageId = id
          const existing = document.querySelector(`[data-message-id="${id}"]`)
          if (existing) existing.replaceWith(view.el)
          else els.thread.appendChild(view.el)
          els.emptyState.hidden = true
          els.thread.hidden = false
          if (event.title) {
            els.topbarName.textContent = event.title
            setDocumentTitle(event.title)
          }
          view.setStatus('正在恢复生成…')
          streamRef = { controller, view, conversationId, attached: true }
          state.streaming = streamRef
          state.liveViews.set(id, view)
          setComposerStreaming(true)
          if (state.stick) scrollToBottom()
          return
        }
        if (!view) return
        applyStreamEvent(view, event, conversationId)
        if (event.t === 'done') {
          finished = true
          clearTimeout(state.attachRetryTimer)
          state.attachRetryTimer = null
          state.streaming = null
          setComposerStreaming(false)
          view.finish({
            status: event.status,
            stopped: event.status === 'stopped',
            durationMs: event.durationMs,
            usage: event.usage,
            files: event.files || [],
            createdAt: Date.now(),
            messageId: view.el.dataset.messageId,
            canRegenerate: true,
          })
          state.liveViews.delete(view.el.dataset.messageId)
          scheduleCacheSave()
          void refreshConversations().catch(() => {})
          void refreshFiles(conversationId)
          void syncConversation(conversationId)
        }
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          handle(line)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) handle(buffer)
      if (!finished && !controller.signal.aborted) {
        if (view) view.finish({ status: 'error', error: '连接提前结束，回答可能不完整' })
        state.streaming = null
        setComposerStreaming(false)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        if (streamRef?.stopping && view) {
          view.finish({
            status: 'stopped',
            stopped: true,
            durationMs: Date.now() - view.startedAt,
          })
          view.notice('已停止生成')
        }
        return
      }
      if (isNetworkError(error)) {
        setConnection('offline')
        if (state.streaming?.controller === controller) state.streaming = null
        setComposerStreaming(false)
        if (view) view.setStatus('正在重新连接…')
        scheduleAttachRetry(conversationId, messageId, attempt + 1)
        return
      }
      if (view) view.finish({ status: 'error', error: error.message || '恢复生成失败' })
      state.streaming = null
      setComposerStreaming(false)
      showToast(error.message || '恢复生成失败')
      void refreshConversations().catch(() => {})
      void refreshFiles(conversationId)
    }
  }

  /* ── markdown copy buttons ─────────────────────────────────────────── */

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('.code-copy')
    if (!button) return
    const block = button.closest('.code-block')
    const code = block?.querySelector('pre code')
    if (!code) return
    const ok = await copyText(code.textContent)
    if (!ok) return showToast('复制失败')
    button.textContent = '已复制'
    button.classList.add('copied')
    setTimeout(() => {
      button.textContent = '复制'
      button.classList.remove('copied')
    }, 1500)
  })

  /* ── boot ──────────────────────────────────────────────────────────── */

  window.addEventListener('focus', () => {
    if (document.hidden || state.streaming) return
    void refreshConversations().catch(() => {})
  })

  window.addEventListener('online', () => {
    setConnection('connecting', '网络已恢复，正在同步…')
    const pending = state.pendingSend
    if (pending && !state.streaming && pending.conversationId === state.currentId) {
      showToast('网络已恢复，正在重试发送…', { icon: 'i-refresh' })
      retryRun(pending)
      return
    }
    void resumeConnection()
  })

  window.addEventListener('offline', () => {
    setConnection('offline', '网络已断开，等待恢复…')
  })

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void resumeConnection()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      writeCache()
      return
    }
    clearUnread()
    void resumeConnection()
  })

  window.addEventListener('storage', (event) => {
    if (!event.key) return
    if (event.key === BOOKMARK_KEY) {
      state.bookmarks = loadBookmarks()
      if (els.bookmarksSheet && !els.bookmarksSheet.hidden) renderBookmarks()
      for (const button of document.querySelectorAll('[data-bookmark-id]')) {
        button.classList.toggle('bookmarked', isBookmarked(button.dataset.bookmarkId))
      }
    } else if (event.key === PROMPT_KEY) {
      state.prompts = loadPrompts()
      if (els.promptSheet && !els.promptSheet.hidden) renderPrompts()
    } else if (event.key === PREFS_KEY) {
      state.prefs = loadPrefs()
      applyPrefs()
    }
  })

  window.addEventListener('pagehide', () => {
    writeCache()
  })

  window.addEventListener('popstate', () => {
    const id = routeConversationId()
    state.routing = true
    const done = () => {
      state.routing = false
    }
    if (id) {
      void openConversation(id, { fromRoute: true }).finally(done)
    } else {
      if (state.currentId) showEmptyChat()
      done()
    }
  })

  function syncAppHeight() {
    const height = window.visualViewport?.height || window.innerHeight
    if (height) document.documentElement.style.setProperty('--app-h', `${Math.round(height)}px`)
  }

  function syncComposerHeight() {
    const wrap = document.querySelector('.composer-wrap')
    if (!wrap) return
    const height = Math.ceil(wrap.getBoundingClientRect().height)
    if (height > 0) document.documentElement.style.setProperty('--composer-h', `${height}px`)
  }

  window.visualViewport?.addEventListener('resize', syncAppHeight)
  window.addEventListener('resize', syncAppHeight)
  syncAppHeight()

  const composerWrap = document.querySelector('.composer-wrap')
  if (composerWrap && 'ResizeObserver' in window) {
    new ResizeObserver(() => syncComposerHeight()).observe(composerWrap)
  }
  syncComposerHeight()

  els.input.addEventListener('focus', () => {
    setTimeout(() => {
      if (!desktopQuery.matches) els.composer.scrollIntoView({ block: 'nearest' })
    }, 280)
  })

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing
            worker?.addEventListener('statechange', () => {
              if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return
              showToast('新版本已就绪', {
                icon: 'i-refresh',
                actionLabel: '刷新',
                duration: 12_000,
                onAction: () => {
                  worker.postMessage({ type: 'SKIP_WAITING' })
                  setTimeout(() => location.reload(), 160)
                },
              })
            })
          })
        })
        .catch(() => {})
    })
  }

  const coarsePointerQuery = window.matchMedia('(hover: none) and (pointer: coarse)')

  function updateComposerHint() {
    if (!els.composerHint) return
    const touchOnly = coarsePointerQuery.matches && !state.hasPhysicalKeyboard
    els.composerHint.textContent = touchOnly ? '点按 ↑ 发送' : 'Enter 发送 · Shift + Enter 换行'
    els.composerHint.classList.toggle('is-touch', touchOnly)
    els.composerHint.title = touchOnly
      ? '触控输入：点按发送按钮发送；连接实体键盘后可用 Enter'
      : 'Enter 发送，Shift + Enter 换行'
  }

  coarsePointerQuery.addEventListener?.('change', updateComposerHint)
  document.addEventListener(
    'keydown',
    (event) => {
      if (state.hasPhysicalKeyboard) return
      // Chromium marks events synthesized by a soft keyboard; ignore those so
      // typing on glass does not masquerade as a hardware keyboard.
      if (event.sourceCapabilities?.firesTouchEvents) return
      if (!event.key || event.key.length !== 1) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // Safari has no sourceCapabilities. A shrunken visual viewport means
      // the on-screen keyboard is up, so a printable key is still touch
      // input and must not be mistaken for a hardware keyboard.
      if (!event.sourceCapabilities && window.visualViewport) {
        if (window.visualViewport.height + 80 < window.innerHeight) return
      }
      state.hasPhysicalKeyboard = true
      updateComposerHint()
    },
    true,
  )

  resizeInput()
  setComposerStreaming(false)
  renderScenarios()
  updateComposerHint()
  els.scrollBottom.hidden = true
  void init()
})()
