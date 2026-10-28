/* Interaction polish shared by every page that loads the chat shell.
 * CSS owns the timing; this file adds pointer-origin ripples and animates
 * overlays out by keeping a short-lived visual ghost of the closing layer.
 * The real element is hidden/removed immediately, so focus, inert, IDs and
 * every existing close-state assertion keep working. */
(() => {
  const TARGETS = [
    '.send-btn',
    '.new-chat',
    '.primary-btn',
    '.scenario-card',
    '.scenario-row',
    '.ghost-btn',
    '.danger-btn',
    '.sidebar-link',
    '.batch-btn',
    '.toast-action',
    '.share-primary',
    '.project-save',
  ].join(',')
  const OVERLAY_SELECTOR = [
    '.sheet',
    '.modal',
    '.palette',
    '#permissionMenu',
    '#commandMenu',
    '#chatInfo',
    '#connectionDetail',
    '#engineInfo',
    '#findBar',
  ].join(',')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (reduceMotion.matches) return
      const target = event.target instanceof Element ? event.target.closest(TARGETS) : null
      if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return

      const rect = target.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const size = Math.max(rect.width, rect.height) * 2.1
      target.querySelector(':scope > .press-ripple')?.remove()

      const ripple = document.createElement('span')
      ripple.className = 'press-ripple'
      ripple.setAttribute('aria-hidden', 'true')
      ripple.style.setProperty('--ripple-size', `${size}px`)
      ripple.style.left = `${event.clientX - rect.left}px`
      ripple.style.top = `${event.clientY - rect.top}px`
      target.appendChild(ripple)

      const cleanup = () => ripple.remove()
      ripple.addEventListener('animationend', cleanup, { once: true })
      setTimeout(cleanup, 800)
    },
    { passive: true },
  )

  // Copy live form/scroll state into the ghost. Attributes alone would reset
  // text fields, checked switches and scrolled panels.
  function syncClone(source, ghost) {
    const from = [source, ...source.querySelectorAll('*')]
    const to = [ghost, ...ghost.querySelectorAll('*')]
    from.forEach((node, index) => {
      const copy = to[index]
      if (!copy) return
      if (node.scrollTop) copy.scrollTop = node.scrollTop
      if (node.scrollLeft) copy.scrollLeft = node.scrollLeft
      if (node instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
        if (node.type === 'checkbox' || node.type === 'radio') copy.checked = node.checked
        else if (node.type !== 'file') copy.value = node.value
      } else if (node instanceof HTMLTextAreaElement && copy instanceof HTMLTextAreaElement) {
        copy.value = node.value
      } else if (node instanceof HTMLSelectElement && copy instanceof HTMLSelectElement) {
        copy.value = node.value
      }
    })
  }

  function exitOverlay(source) {
    if (!source || !source.isConnected || source.hidden) return
    if (reduceMotion.matches) return
    // A cloned iframe would reload a PDF. Keep that close instant instead.
    if (source.querySelector('iframe')) return
    const rect = source.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    // Only the latest close needs a ghost; two fading layers would stack.
    document.querySelectorAll('.m-exit-ghost').forEach((node) => node.remove())

    const ghost = source.cloneNode(true)
    ghost.removeAttribute('id')
    ghost.removeAttribute('role')
    ghost.removeAttribute('aria-modal')
    ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
    ghost.setAttribute('aria-hidden', 'true')
    ghost.setAttribute('inert', '')
    ghost.classList.add('m-exit-ghost')

    const full = rect.width >= window.innerWidth - 4 && rect.height >= window.innerHeight - 4
    if (full) {
      ghost.classList.add('m-exit-full')
      if (!source.matches('.sheet, .modal, .palette')) ghost.classList.add('m-exit-fade')
    } else {
      ghost.classList.add('m-exit-rect')
      ghost.classList.add(source.classList.contains('chat-info') ? 'm-exit-side' : 'm-exit-pop')
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        right: 'auto',
        bottom: 'auto',
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        transform: 'none',
      })
    }

    const layer = Number.parseInt(getComputedStyle(source).zIndex, 10)
    ghost.style.zIndex = String(Math.max(1, (Number.isFinite(layer) ? layer : 100) - 1))
    syncClone(source, ghost)
    document.body.appendChild(ghost)
    window.setTimeout(() => ghost.remove(), 280)
  }

  // Wrap the static overlays' `hidden` property. Every close path already
  // toggles it, so exits are animated without touching dozens of functions.
  function wrapOverlay(element) {
    if (!element || element.__mExitWrapped) return
    element.__mExitWrapped = true
    let hidden = element.hasAttribute('hidden')
    Object.defineProperty(element, 'hidden', {
      configurable: true,
      enumerable: true,
      get: () => hidden,
      set(next) {
        const value = Boolean(next)
        if (value && !hidden) exitOverlay(element)
        if (!value) document.querySelectorAll('.m-exit-ghost').forEach((node) => node.remove())
        hidden = value
        element.toggleAttribute('hidden', value)
      },
    })
  }

  document.querySelectorAll(OVERLAY_SELECTOR).forEach(wrapOverlay)
  window.DSHMotion = { exitOverlay }
})()
