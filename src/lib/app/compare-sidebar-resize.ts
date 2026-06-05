export const DEFAULT_COMPARE_SIDEBAR_WIDTH = 238

const MIN_COMPARE_SIDEBAR_WIDTH = 206
const MAX_COMPARE_SIDEBAR_WIDTH = 380

interface CompareSidebarResizeControllerOptions {
  getEnabled: () => boolean
  setActive: (active: boolean) => void
  setWidth: (width: number) => void
}

export function createCompareSidebarResizeController(
  options: CompareSidebarResizeControllerOptions,
) {
  let resizeFrame: number | null = null
  let pendingWidth = DEFAULT_COMPARE_SIDEBAR_WIDTH

  const clampWidth = (value: number) =>
    Math.min(MAX_COMPARE_SIDEBAR_WIDTH, Math.max(MIN_COMPARE_SIDEBAR_WIDTH, Math.round(value)))

  const stop = () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = null
    }
    options.setWidth(pendingWidth)
    options.setActive(false)
  }

  const updateWidth = (clientX: number) => {
    if (typeof window === 'undefined') {
      return
    }

    pendingWidth = clampWidth(clientX)
    if (resizeFrame !== null) {
      return
    }

    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null
      options.setWidth(pendingWidth)
    })
  }

  return {
    dispose() {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame)
        resizeFrame = null
      }
    },
    reset() {
      pendingWidth = DEFAULT_COMPARE_SIDEBAR_WIDTH
      options.setWidth(DEFAULT_COMPARE_SIDEBAR_WIDTH)
      stop()
    },
    start(event: PointerEvent) {
      if (!options.getEnabled()) {
        return
      }

      options.setActive(true)
      updateWidth(event.clientX)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        updateWidth(moveEvent.clientX)
      }

      const handlePointerUp = () => {
        stop()
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
    },
  }
}
