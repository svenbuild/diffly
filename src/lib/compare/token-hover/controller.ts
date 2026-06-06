import { lookupToken, type TokenHoverEntry } from './index'

interface TokenHoverProps {
  tokenText: string
  tokenElement: HTMLElement
}

const SHOW_DELAY_MS = 120
const HIDE_DELAY_MS = 80
const VIEWPORT_MARGIN = 8
const TOKEN_GAP = 6

export interface TokenHoverController {
  handleEnter(props: TokenHoverProps, event: PointerEvent, language: string | null | undefined): void
  handleLeave(): void
  destroy(): void
}

export function createTokenHoverController(): TokenHoverController {
  let card: HTMLDivElement | null = null
  let showTimer: number | null = null
  let hideTimer: number | null = null
  let activeToken: HTMLElement | null = null

  function applyUnderline(token: HTMLElement) {
    if (activeToken === token) {
      return
    }
    clearUnderline()
    activeToken = token
    // Tokens live inside Pierre's shadow root, so our stylesheet can't reach
    // them — set the decoration inline instead.
    token.style.textDecorationLine = 'underline'
    token.style.textDecorationStyle = 'dotted'
    token.style.textUnderlineOffset = '2px'
    token.style.cursor = 'help'
  }

  function clearUnderline() {
    if (activeToken) {
      activeToken.style.textDecorationLine = ''
      activeToken.style.textDecorationStyle = ''
      activeToken.style.textUnderlineOffset = ''
      activeToken.style.cursor = ''
      activeToken = null
    }
  }

  function clearShowTimer() {
    if (showTimer !== null) {
      window.clearTimeout(showTimer)
      showTimer = null
    }
  }

  function clearHideTimer() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function ensureCard(): HTMLDivElement {
    if (!card) {
      card = document.createElement('div')
      card.className = 'token-hover'
      card.setAttribute('role', 'tooltip')
      card.style.display = 'none'
      // Keep the card alive while the pointer is over it (so the footer link is
      // clickable and the card doesn't vanish when you move onto it); hide once
      // the pointer leaves the card itself.
      card.addEventListener('pointerenter', clearHideTimer)
      card.addEventListener('pointerleave', scheduleHide)
      document.body.appendChild(card)
    }
    return card
  }

  function appendRow(parent: HTMLElement, className: string, text: string) {
    const row = document.createElement('div')
    row.className = className
    row.textContent = text
    parent.appendChild(row)
    return row
  }

  function buildCard(entry: TokenHoverEntry): HTMLDivElement {
    const element = ensureCard()

    const header = document.createElement('div')
    header.className = 'token-hover-header'
    const name = document.createElement('span')
    name.className = 'token-hover-name'
    name.textContent = entry.name
    const kind = document.createElement('span')
    kind.className = 'token-hover-kind'
    kind.textContent = entry.kind
    header.append(name, kind)

    const children: Node[] = [header]

    if (entry.description) {
      const description = document.createElement('p')
      description.className = 'token-hover-description'
      description.textContent = entry.description
      children.push(description)
    }

    if (entry.syntax) {
      const pre = document.createElement('pre')
      pre.className = 'token-hover-syntax'
      pre.textContent = entry.syntax
      children.push(pre)
    }

    if (entry.baseline) {
      const baseline = document.createElement('div')
      baseline.className = 'token-hover-baseline'
      const check = document.createElement('span')
      check.className = 'token-hover-baseline-check'
      check.textContent = '✓'
      check.setAttribute('aria-hidden', 'true')
      const text = document.createElement('span')
      text.textContent = entry.baseline
      baseline.append(check, text)
      children.push(baseline)
    }

    if (entry.reference) {
      const footer = document.createElement('div')
      footer.className = 'token-hover-footer'
      const link = document.createElement('a')
      link.className = 'token-hover-link'
      link.href = entry.reference.url
      link.target = '_blank'
      link.rel = 'noreferrer'
      link.textContent = `Learn more on ${entry.reference.label}`
      footer.appendChild(link)
      children.push(footer)
    }

    element.replaceChildren(...children)
    return element
  }

  function position(element: HTMLDivElement, target: HTMLElement) {
    const rect = target.getBoundingClientRect()
    // Reset to top-left to measure the natural card size without clamping skew.
    element.style.left = '0px'
    element.style.top = '0px'
    const cardRect = element.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight

    let left = rect.left
    const maxLeft = viewportWidth - cardRect.width - VIEWPORT_MARGIN
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, Math.max(VIEWPORT_MARGIN, maxLeft)))

    let top = rect.bottom + TOKEN_GAP
    const overflowsBottom = top + cardRect.height + VIEWPORT_MARGIN > viewportHeight
    if (overflowsBottom) {
      const above = rect.top - TOKEN_GAP - cardRect.height
      top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, top)
    }

    element.style.left = `${Math.round(left)}px`
    element.style.top = `${Math.round(top)}px`
  }

  function show(entry: TokenHoverEntry, target: HTMLElement) {
    const element = buildCard(entry)
    element.style.display = 'block'
    element.style.visibility = 'hidden'
    position(element, target)
    element.style.visibility = 'visible'
  }

  function hide() {
    if (card) {
      card.style.display = 'none'
      card.replaceChildren()
    }
    clearUnderline()
  }

  function scheduleHide() {
    clearShowTimer()
    clearHideTimer()
    hideTimer = window.setTimeout(() => {
      hideTimer = null
      hide()
    }, HIDE_DELAY_MS)
  }

  function handleEnter(
    props: TokenHoverProps,
    _event: PointerEvent,
    language: string | null | undefined,
  ) {
    const entry = lookupToken(language, props.tokenText)
    if (!entry) {
      return
    }

    clearHideTimer()
    clearShowTimer()
    const target = props.tokenElement
    // Underline immediately so hovering any known token gives instant feedback,
    // even before the tooltip's show delay elapses.
    applyUnderline(target)
    showTimer = window.setTimeout(() => {
      showTimer = null
      show(entry, target)
    }, SHOW_DELAY_MS)
  }

  function handleLeave() {
    scheduleHide()
  }

  function destroy() {
    clearShowTimer()
    clearHideTimer()
    clearUnderline()
    if (card) {
      card.remove()
      card = null
    }
  }

  return { handleEnter, handleLeave, destroy }
}
