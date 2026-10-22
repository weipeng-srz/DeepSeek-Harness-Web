/* Minimal, dependency-free markdown renderer for chat answers.
   Only safe HTML is emitted: source is escaped before formatting. */
(function () {
  'use strict'

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function inlineCode(raw) {
    const isPath = /[\/\\]/.test(raw) && raw.length > 10
    const isLong = raw.length >= 32
    if (!isPath && !isLong) return '<code>' + raw + '</code>'
    const inner = isPath ? raw.replace(/([\/\\])/g, '$1<wbr>') : raw
    const cls = isLong ? 'code-value' : 'code-path'
    const attrs = ['class="' + cls + '"']
    if (isPath || isLong) attrs.push('title="' + raw + '"')
    if (isLong) attrs.push('tabindex="0"', 'role="button"', 'aria-label="复制完整值"')
    return '<code ' + attrs.join(' ') + '>' + inner + '</code>'
  }

  function inline(text) {
    const codes = []
    let s = escapeHtml(text).replace(/`([^`\n]+)`/g, function (_, code) {
      codes.push(code)
      return '\u0000' + (codes.length - 1) + '\u0000'
    })

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, href) {
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
    })
    // Relative links in this app point at files in the chat workspace, which
    // the web UI does not serve; show the filename instead of raw markdown.
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="file-ref" data-file="$2">$1</span>')
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, index) {
      return inlineCode(codes[Number(index)])
    })
    return s
  }

  function indentOf(line) {
    return line.match(/^\s*/)[0].length
  }

  function isBlockStart(line) {
    return (
      /^\s*(```|~~~)/.test(line) ||
      /^\s*#{1,6}\s+/.test(line) ||
      /^\s*>/.test(line) ||
      /^\s*([-*+]|\d+\.)\s+/.test(line) ||
      /^\s*([-*_])\1{2,}\s*$/.test(line) ||
      /^\s*\|.*\|\s*$/.test(line)
    )
  }

  function renderList(lines, start, ordered) {
    const baseIndent = indentOf(lines[start])
    const items = []
    let i = start

    while (i < lines.length) {
      const match = lines[i].match(/^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/)
      if (!match) break
      const indent = match[1].length
      if (indent < baseIndent) break
      if (indent > baseIndent) {
        const nested = renderList(lines, i, !!match[3])
        if (items.length) items[items.length - 1].children.push(nested.html)
        i = nested.next
        continue
      }
      const content = [match[4]]
      i += 1
      while (i < lines.length) {
        if (/^\s*$/.test(lines[i])) break
        const next = lines[i].match(/^(\s*)(?:([-*+])|(\d+)\.)\s+.*$/)
        if (next && next[1].length <= baseIndent) break
        if (next && next[1].length > baseIndent) break
        if (isBlockStart(lines[i])) break
        content.push(lines[i].trim())
        i += 1
      }
      items.push({ html: inline(content.join(' ')), children: [] })
    }

    const tag = ordered ? 'ol' : 'ul'
    const body = items
      .map(function (item) {
        return '<li>' + item.html + (item.children.length ? item.children.join('') : '') + '</li>'
      })
      .join('')
    return { html: '<' + tag + '>' + body + '</' + tag + '>', next: i }
  }

  function renderTable(lines, start) {
    const rows = []
    let i = start
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
      rows.push(
        lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(function (cell) {
            return cell.trim()
          }),
      )
      i += 1
    }
    if (rows.length < 2) {
      return { html: '<p>' + inline(lines[start]) + '</p>', next: start + 1 }
    }
    const aligns = rows[1].map(function (cell) {
      const left = cell.startsWith(':')
      const right = cell.endsWith(':')
      if (left && right) return 'center'
      if (right) return 'right'
      return 'left'
    })
    const head = rows[0]
      .map(function (cell, index) {
        return '<th style="text-align:' + (aligns[index] || 'left') + '">' + inline(cell) + '</th>'
      })
      .join('')
    const body = rows
      .slice(2)
      .map(function (row) {
        return (
          '<tr>' +
          row
            .map(function (cell, index) {
              return '<td style="text-align:' + (aligns[index] || 'left') + '">' + inline(cell) + '</td>'
            })
            .join('') +
          '</tr>'
        )
      })
      .join('')
    return {
      html: '<div class="table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>',
      next: i,
    }
  }

  function renderBlocks(lines) {
    const out = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]

      if (/^\s*$/.test(line)) {
        i += 1
        continue
      }

      // Display math blocks: keep the TeX intact so KaTeX can typeset it.
      const mathOpen = line.match(/^\s*(\\\[|\$\$)\s*(.*)$/)
      const mathStart = i
      if (mathOpen) {
        const closer = mathOpen[1] === '\\[' ? '\\]' : '$$'
        const parts = []
        if (mathOpen[2] && !mathOpen[2].includes(closer)) parts.push(mathOpen[2])
        let rest = mathOpen[2].includes(closer)
          ? mathOpen[2].slice(0, mathOpen[2].indexOf(closer))
          : ''
        if (rest) parts.push(rest)
        i += 1
        let closed = mathOpen[2].includes(closer)
        while (!closed && i < lines.length) {
          const idx = lines[i].indexOf(closer)
          if (idx >= 0) {
            parts.push(lines[i].slice(0, idx))
            closed = true
            i += 1
            break
          }
          parts.push(lines[i])
          i += 1
        }
        if (closed) {
          out.push('<div class="math-display">' + escapeHtml(parts.join('\n').trim()) + '</div>')
          continue
        }
        // No closing delimiter: treat the opening line as ordinary text.
        i = mathStart + 1
      }

      const fence = line.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/)
      if (fence) {
        const marker = fence[1]
        const lang = fence[2] || ''
        const code = []
        i += 1
        while (i < lines.length && !new RegExp('^\\s*' + marker[0] + '{3,}\\s*$').test(lines[i])) {
          code.push(lines[i])
          i += 1
        }
        if (i < lines.length) i += 1
        out.push(
          '<div class="code-block"><div class="code-bar"><span class="code-lang">' +
            escapeHtml(lang || 'text') +
            '</span><button class="code-copy" type="button">复制</button></div><pre><code>' +
            escapeHtml(code.join('\n')) +
            '</code></pre></div>',
        )
        continue
      }

      const heading = line.match(/^\s*(#{1,6})\s+(.*)$/)
      if (heading) {
        const level = Math.min(heading[1].length, 4)
        out.push('<h' + level + '>' + inline(heading[2].trim()) + '</h' + level + '>')
        i += 1
        continue
      }

      if (/^\s*>\s?/.test(line)) {
        const quote = []
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''))
          i += 1
        }
        out.push('<blockquote>' + renderBlocks(quote) + '</blockquote>')
        continue
      }

      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        out.push('<hr>')
        i += 1
        continue
      }

      if (/^\s*\|.*\|\s*$/.test(line)) {
        const table = renderTable(lines, i)
        out.push(table.html)
        i = table.next
        continue
      }

      const listMatch = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+/)
      if (listMatch) {
        const list = renderList(lines, i, !!listMatch[2])
        out.push(list.html)
        i = list.next
        continue
      }

      const paragraph = [line.trim()]
      i += 1
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
        paragraph.push(lines[i].trim())
        i += 1
      }
      out.push('<p>' + inline(paragraph.join('\n')).replace(/\n/g, '<br>') + '</p>')
    }
    return out.join('')
  }

  function render(source) {
    if (!source) return ''
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n')
    return renderBlocks(lines)
  }

  window.Markdown = { render: render, escapeHtml: escapeHtml }
})()
