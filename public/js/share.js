/* Read-only share page. No auth, no app shell, no API beyond /api/share/<token>. */
(function () {
  'use strict'

  const main = document.getElementById('shareMain')
  const expiry = document.getElementById('shareExpiry')
  const copyButton = document.getElementById('shareCopy')
  const printButton = document.getElementById('sharePrint')
  const toast = document.getElementById('shareToast')
  let toastTimer = null

  const token = (() => {
    const match = location.pathname.match(/^\/s\/([^/?#]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  })()

  function showToast(text) {
    if (!toast) return
    toast.textContent = text
    toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.hidden = true
    }, 2400)
  }

  function formatDate(value, withTime = true) {
    if (!value) return ''
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(new Date(value))
    } catch {
      return ''
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function renderError(title, detail) {
    main.replaceChildren()
    const box = el('div', 'share-error')
    box.appendChild(el('strong', '', title))
    box.appendChild(el('span', '', detail))
    main.appendChild(box)
    if (expiry) expiry.textContent = ''
    document.title = `${title} · DSH Chat`
  }

  function renderMessage(message) {
    const article = el('article', `share-msg ${message.role === 'user' ? 'user' : 'assistant'}`)
    const role = el('div', 'share-role')
    const avatar = el('span', 'share-avatar', message.role === 'user' ? '问' : '答')
    role.append(avatar, el('span', '', message.role === 'user' ? '提问' : '回答'))
    const time = formatDate(message.createdAt)
    if (time) role.append(el('span', '', time))

    const textWrap = el('div', 'share-text')
    const blocks = Array.isArray(message.blocks) && message.blocks.length ? message.blocks : null
    const textBlocks = blocks ? blocks.filter((block) => block.type === 'text') : []
    if (message.role === 'user') {
      textWrap.style.whiteSpace = 'pre-wrap'
      textWrap.textContent = message.text || ''
    } else if (textBlocks.length) {
      for (const block of textBlocks) {
        const div = el('div')
        div.innerHTML = window.Markdown ? window.Markdown.render(block.text || '') : ''
        if (!window.Markdown) div.textContent = block.text || ''
        textWrap.appendChild(div)
      }
    } else {
      textWrap.innerHTML = window.Markdown ? window.Markdown.render(message.text || '') : ''
      if (!window.Markdown) textWrap.textContent = message.text || ''
    }

    article.append(role)
    if (message.attachments?.length) {
      const files = el('div', 'share-attachments')
      for (const file of message.attachments) {
        files.appendChild(el('span', 'share-file', `📎 ${file.name}${file.size ? ` · ${Math.max(1, Math.round(file.size / 1024))}KB` : ''}`))
      }
      article.appendChild(files)
    }
    article.appendChild(textWrap)

    const tools = blocks ? blocks.filter((block) => block.type === 'tool') : []
    if (tools.length) {
      const toolWrap = el('div', 'share-tools')
      for (const tool of tools) {
        const details = el('details', 'share-tool')
        details.appendChild(el('summary', '', `工具 · ${tool.tool || 'tool'} · ${tool.status || ''}`))
        const pre = el('pre')
        const payload = {
          input: tool.input ?? null,
          ...(tool.result ? { result: tool.result } : {}),
        }
        pre.textContent = JSON.stringify(payload, null, 2)
        details.appendChild(pre)
        toolWrap.appendChild(details)
      }
      article.appendChild(toolWrap)
    }

    return article
  }

  function renderShare(data) {
    main.replaceChildren()
    const head = el('header', 'share-head')
    head.appendChild(el('p', 'share-eyebrow', '只读分享'))
    const title = el('h1', 'share-title', data.title || '未命名对话')
    head.appendChild(title)
    const meta = el('p', 'share-meta')
    if (data.sharedAt) meta.appendChild(el('span', '', `分享于 ${formatDate(data.sharedAt)}`))
    if (data.messages?.length) meta.appendChild(el('span', '', `${data.messages.length} 条消息`))
    head.appendChild(meta)

    const notice = el('p', 'share-notice')
    notice.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4.5 6.2v5.1c0 4.4 3 8.4 7.5 9.7 4.5-1.3 7.5-5.3 7.5-9.7V6.2L12 3Z"/><path d="m8.8 12.1 2.2 2.2 4.2-4.4"/></svg><span>这是创建时生成的只读快照，后续对话更新不会出现在这里。页面不含登录凭证，也不能继续提问。</span>'
    head.appendChild(notice)
    main.appendChild(head)

    const list = el('div', 'share-thread')
    for (const message of data.messages || []) list.appendChild(renderMessage(message))
    main.appendChild(list)

    const expiresText = data.expiresAt
      ? `链接有效期至 ${formatDate(data.expiresAt, false)}`
      : '链接长期有效，可由创建者随时撤销'
    if (expiry) expiry.textContent = expiresText
    document.title = `${data.title || '只读分享'} · DSH Chat`
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(main, {
          delimiters: [
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
            { left: '$$', right: '$$', display: true },
          ],
          throwOnError: false,
          errorColor: 'currentColor',
        })
      } catch {}
    }
    for (const button of main.querySelectorAll('.code-copy')) {
      button.addEventListener('click', async () => {
        const code = button.closest('.code-block')?.querySelector('pre code')
        if (!code) return
        try {
          await navigator.clipboard.writeText(code.textContent)
          button.textContent = '已复制'
          setTimeout(() => { button.textContent = '复制' }, 1500)
        } catch {
          showToast('复制失败，请手动选择')
        }
      })
    }
  }

  async function load() {
    if (!token) return renderError('链接不完整', '请向分享者索取完整链接。')
    try {
      const response = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        credentials: 'omit',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 404) return renderError('分享不存在', '链接可能已被撤销，或从未创建成功。')
      if (response.status === 410) return renderError('分享已失效', data.error || '这个链接已过期或被撤销。')
      if (!response.ok) return renderError('暂时无法打开', data.error || `服务返回 ${response.status}`)
      renderShare(data)
    } catch {
      renderError('网络不可用', '请确认你仍能访问这台 DSH Chat 服务器。')
    }
  }

  copyButton?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      showToast('链接已复制')
    } catch {
      showToast('复制失败，请手动复制地址栏')
    }
  })

  printButton?.addEventListener('click', () => window.print())

  void load()
})()
