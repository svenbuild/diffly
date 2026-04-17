<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import {
    renderMinimap,
    computeViewport,
    scrollTopFromClick,
    buildHunkMarkers,
    type MinimapRow,
    type MinimapColors,
  } from './minimap-render'

  export let rows: MinimapRow[] = []
  export let scrollContainer: HTMLDivElement | null = null
  export let onScrollTo: (scrollTop: number) => void = () => {}

  let containerEl: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let viewportTop = 0
  let viewportHeight = 0
  let isDragging = false
  let dragStartY = 0
  let dragStartScrollTop = 0
  let mounted = false

  let boundScrollContainer: HTMLDivElement | null = null
  let scrollListener: (() => void) | null = null
  let resizeObserver: ResizeObserver | null = null

  function readColors(): MinimapColors {
    const style = getComputedStyle(containerEl)
    const get = (prop: string) => style.getPropertyValue(prop).trim()

    return {
      insertBg: get('--diff-insert-bg') || '#1a2e1f',
      deleteBg: get('--diff-delete-bg') || '#2e1a1f',
      gapBg: get('--diff-gap-bg') || '#232323',
      text: get('--text') || '#c8ccd4',
      insertText: get('--scroll-marker-insert') || '#35a85b',
      deleteText: get('--scroll-marker-delete') || '#d76572',
      markerInsert: get('--scroll-marker-insert') || '#35a85b',
      markerDelete: get('--scroll-marker-delete') || '#d76572',
      markerMixed: get('--scroll-marker-mixed') || '#22c7c7',
    }
  }

  function render() {
    if (!canvasEl || !containerEl || rows.length === 0) return
    const colors = readColors()
    const markers = buildHunkMarkers(rows)
    renderMinimap(canvasEl, rows, markers, colors)
  }

  function updateViewport() {
    if (!scrollContainer || !containerEl || rows.length === 0) return
    const vp = computeViewport(
      scrollContainer.scrollTop,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
      rows.length,
      containerEl.clientHeight,
    )
    viewportTop = vp.top
    viewportHeight = vp.height
  }

  function bindScrollContainer(container: HTMLDivElement | null) {
    if (boundScrollContainer && scrollListener) {
      boundScrollContainer.removeEventListener('scroll', scrollListener)
    }

    boundScrollContainer = container
    scrollListener = container ? () => updateViewport() : null

    if (container && scrollListener) {
      container.addEventListener('scroll', scrollListener, { passive: true })
    }
  }

  function handleMinimapClick(event: MouseEvent) {
    if (!scrollContainer || !containerEl) return

    const rect = containerEl.getBoundingClientRect()
    const y = event.clientY - rect.top
    const newScrollTop = scrollTopFromClick(
      y,
      rows.length,
      containerEl.clientHeight,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
    )
    onScrollTo(newScrollTop)
  }

  function handleViewportMouseDown(event: MouseEvent) {
    if (!scrollContainer) return
    event.preventDefault()
    event.stopPropagation()
    isDragging = true
    dragStartY = event.clientY
    dragStartScrollTop = scrollContainer.scrollTop
    window.addEventListener('mousemove', handleDragMove)
    window.addEventListener('mouseup', handleDragEnd)
  }

  function handleDragMove(event: MouseEvent) {
    if (!isDragging || !scrollContainer || !containerEl) return
    event.preventDefault()

    const deltaY = event.clientY - dragStartY
    const rowHeight = Math.min(3, containerEl.clientHeight / Math.max(1, rows.length))
    const usedHeight = Math.min(containerEl.clientHeight, rowHeight * rows.length)
    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight

    if (usedHeight <= 0 || maxScrollTop <= 0) return

    const vp = computeViewport(
      dragStartScrollTop,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
      rows.length,
      containerEl.clientHeight,
    )
    const maxVpTop = Math.max(1, usedHeight - vp.height)
    const scrollDelta = (deltaY / maxVpTop) * maxScrollTop

    onScrollTo(Math.max(0, Math.min(maxScrollTop, dragStartScrollTop + scrollDelta)))
  }

  function handleDragEnd() {
    isDragging = false
    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
  }

  $: if (mounted && scrollContainer !== boundScrollContainer) {
    bindScrollContainer(scrollContainer)
    updateViewport()
  }

  $: if (mounted && rows) {
    void tick().then(() => {
      render()
      updateViewport()
    })
  }

  onMount(() => {
    mounted = true
    bindScrollContainer(scrollContainer)

    resizeObserver = new ResizeObserver(() => {
      render()
      updateViewport()
    })
    resizeObserver.observe(containerEl)

    render()
    updateViewport()
  })

  onDestroy(() => {
    mounted = false
    bindScrollContainer(null)
    resizeObserver?.disconnect()

    if (isDragging) {
      window.removeEventListener('mousemove', handleDragMove)
      window.removeEventListener('mouseup', handleDragEnd)
    }
  })
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  bind:this={containerEl}
  class="minimap"
  on:mousedown={handleMinimapClick}
>
  <canvas bind:this={canvasEl} class="minimap-canvas"></canvas>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="minimap-viewport"
    class:dragging={isDragging}
    style:top={`${viewportTop}px`}
    style:height={`${viewportHeight}px`}
    on:mousedown={handleViewportMouseDown}
  ></div>
</div>
