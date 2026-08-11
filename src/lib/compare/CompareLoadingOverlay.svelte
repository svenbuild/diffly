<script lang="ts">
  import type { CompareLoadingState } from '../app/compare-timing'
  import {
    compareLoadingCopy,
    compareLoadingStageLabel,
  } from './compare-loading-labels'

  const SLOW_HINT_MS = 12000

  export let state: CompareLoadingState = {
    active: false,
    detail: undefined,
    elapsedMs: 0,
    label: '',
    stage: '',
    startedAt: 0,
  }

  $: loadingCopy = compareLoadingCopy(state.label)
  $: stageLabel = compareLoadingStageLabel(state.stage)
  $: elapsedLabel = formatElapsed(state.elapsedMs)
  $: showSlowHint = state.elapsedMs >= SLOW_HINT_MS

  function formatElapsed(elapsedMs: number) {
    const seconds = Math.max(0, elapsedMs / 1000)
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  }
</script>

{#if state.active}
  <section
    aria-busy="true"
    aria-live="polite"
    class="compare-loading-overlay"
    role="status"
  >
    <div class="loading-panel">
      <div class="diff-machine" aria-hidden="true">
        <div class="machine-rail rail-top"></div>
        <div class="machine-rail rail-middle"></div>
        <div class="machine-rail rail-bottom"></div>
        <div class="diff-token token-remove">-</div>
        <div class="diff-token token-change">~</div>
        <div class="diff-token token-add">+</div>
        <div class="sorter-gate"></div>
        <div class="output-stack">
          <span class="stack-line remove"></span>
          <span class="stack-line change"></span>
          <span class="stack-line add"></span>
        </div>
      </div>

      <div class="loading-copy">
        <p class="loading-kicker">{loadingCopy.context}</p>
        <h2>{loadingCopy.title}</h2>
        <p class="loading-stage">
          <span>{stageLabel}</span>
          <span aria-hidden="true">|</span>
          <span>{elapsedLabel}</span>
        </p>
        {#if showSlowHint}
          <p class="loading-hint">This is taking longer than usual. Large files or repositories may need more time.</p>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .compare-loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      color-mix(in srgb, var(--pane-bg) 88%, transparent);
    backdrop-filter: blur(2px);
    pointer-events: auto;
  }

  .loading-panel {
    display: grid;
    grid-template-columns: 178px minmax(0, 280px);
    align-items: center;
    gap: 24px;
    width: min(560px, 100%);
    padding: 20px 22px;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 94%, var(--pane-bg));
    box-shadow: 0 20px 54px rgb(0 0 0 / 0.38);
  }

  .diff-machine {
    position: relative;
    width: 178px;
    height: 124px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border-strong) 84%, var(--accent));
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface-strong) 90%, var(--pane-bg));
  }

  .machine-rail {
    position: absolute;
    left: 14px;
    right: 14px;
    height: 1px;
    background: var(--border-subtle);
  }

  .rail-top {
    top: 32px;
  }

  .rail-middle {
    top: 61px;
  }

  .rail-bottom {
    top: 90px;
  }

  .diff-token {
    position: absolute;
    left: 14px;
    display: grid;
    width: 32px;
    height: 18px;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 5px;
    font-family: var(--font-code);
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    opacity: 0;
    animation: sort-token 1.9s cubic-bezier(0.32, 0.72, 0.18, 1) infinite;
  }

  .token-remove {
    top: 23px;
    color: var(--danger);
  }

  .token-change {
    top: 52px;
    color: var(--warning);
    animation-delay: 0.22s;
  }

  .token-add {
    top: 81px;
    color: var(--success);
    animation-delay: 0.44s;
  }

  .sorter-gate {
    position: absolute;
    top: 16px;
    left: 86px;
    width: 2px;
    height: 92px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
    animation: gate-pulse 950ms ease-in-out infinite;
  }

  .output-stack {
    position: absolute;
    right: 14px;
    bottom: 18px;
    display: grid;
    gap: 5px;
    width: 42px;
  }

  .stack-line {
    display: block;
    height: 7px;
    border-radius: 999px;
    transform-origin: left center;
    animation: stack-fill 1.9s ease-in-out infinite;
  }

  .stack-line.remove {
    background: var(--danger);
  }

  .stack-line.change {
    background: var(--warning);
    animation-delay: 0.2s;
  }

  .stack-line.add {
    background: var(--success);
    animation-delay: 0.4s;
  }

  .loading-copy {
    min-width: 0;
  }

  .loading-kicker {
    margin: 0 0 6px;
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .loading-copy h2 {
    margin: 0;
    color: var(--title);
    font-size: 18px;
    font-weight: 720;
    letter-spacing: 0;
    line-height: 1.18;
  }

  .loading-stage,
  .loading-hint {
    margin: 8px 0 0;
    color: var(--panel-meta);
    font-size: 12px;
    line-height: 1.35;
  }

  .loading-stage {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 6px;
  }

  .loading-stage > span:last-child {
    font-family: var(--font-code);
    font-variant-numeric: tabular-nums;
  }

  .loading-hint {
    color: var(--warning);
  }

  @keyframes sort-token {
    0% {
      opacity: 0;
      transform: translateX(0) scale(0.86);
    }
    14% {
      opacity: 1;
      transform: translateX(10px) scale(1);
    }
    52% {
      opacity: 1;
      transform: translateX(70px) scale(1);
    }
    72% {
      opacity: 1;
      transform: translateX(100px) scale(0.92);
    }
    100% {
      opacity: 0;
      transform: translateX(136px) scale(0.78);
    }
  }

  @keyframes gate-pulse {
    0%,
    100% {
      opacity: 0.55;
      transform: scaleY(0.82);
    }
    50% {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  @keyframes stack-fill {
    0%,
    28% {
      opacity: 0.34;
      transform: scaleX(0.45);
    }
    58% {
      opacity: 1;
      transform: scaleX(1);
    }
    100% {
      opacity: 0.5;
      transform: scaleX(0.72);
    }
  }

  @media (max-width: 620px) {
    .loading-panel {
      grid-template-columns: 1fr;
      gap: 16px;
      justify-items: center;
    }

    .loading-copy {
      text-align: center;
    }

    .loading-stage {
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .diff-token,
    .sorter-gate,
    .stack-line {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }
</style>
