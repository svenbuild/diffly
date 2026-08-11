<script context="module" lang="ts">
  // Presentational recents column shared by the Git and GitHub setup panels.
  // Panels map their stored recents (repos, pull requests) onto plain items.
  export interface RecentSourceListItem {
    id: string
    name: string
    detail: string
    detailTitle?: string
    extra?: string | null
  }
</script>

<script lang="ts">
  export let title = 'Recent sources'
  export let items: RecentSourceListItem[] = []
  export let loadError = false
  export let loadErrorMessage = 'Recent sources could not be loaded.'
  export let emptyMessage = 'No recent sources'
  export let activeId = ''
  export let onSelect: (id: string) => void
  export let onRemove: ((id: string) => void | Promise<void>) | null = null
  export let actionErrorMessage = ''
</script>

<section class="git-setup-recent" aria-label={title}>
  <h2 class="git-setup-recent-title">{title}</h2>

  {#if loadError}
    <p class="git-setup-recent-empty">{loadErrorMessage}</p>
  {:else if items.length === 0}
    <p class="git-setup-recent-empty">{emptyMessage}</p>
  {:else}
    <ul class="git-setup-recent-list">
      {#each items as item (item.id)}
        <li>
          <button
            type="button"
            class="git-setup-recent-item"
            class:active={item.id === activeId}
            aria-pressed={item.id === activeId}
            title={item.detailTitle ?? item.detail}
            on:click={() => onSelect(item.id)}
          >
            <span class="git-setup-recent-copy">
              <span class="git-setup-recent-name">{item.name}</span>
              <span class="git-setup-recent-path">{item.detail}</span>
            </span>
            {#if item.extra}
              <span class="git-setup-recent-branch">{item.extra}</span>
            {/if}
            <span class="git-setup-recent-arrow" aria-hidden="true">→</span>
          </button>
          {#if onRemove}
            <button
              aria-label={`Remove ${item.name} from recent sources`}
              class="git-setup-recent-remove"
              title="Remove from recent sources"
              type="button"
              on:click={() => onRemove?.(item.id)}
            >×</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if actionErrorMessage}
    <p class="git-setup-recent-action-error" role="alert">{actionErrorMessage}</p>
  {/if}
</section>

<style>
  .git-setup-recent {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--panel-bg);
    overflow: hidden;
  }

  .git-setup-recent-title {
    margin: 0;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.2;
    color: var(--panel-title);
    border-bottom: 1px solid var(--border-subtle);
  }

  .git-setup-recent-empty {
    margin: 0;
    padding: 12px;
    color: var(--muted);
    font-size: 12px;
  }

  .git-setup-recent-list {
    margin: 0;
    padding: 6px;
    list-style: none;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .git-setup-recent-list li {
    position: relative;
    min-width: 0;
  }

  .git-setup-recent-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    gap: 10px;
  }

  .git-setup-recent-list li:has(.git-setup-recent-remove) .git-setup-recent-item {
    padding-right: 36px;
  }

  .git-setup-recent-remove {
    position: absolute;
    top: 50%;
    right: 7px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    font-size: 18px;
    line-height: 1;
    opacity: 0;
    transform: translateY(-50%);
    transition: opacity 100ms ease, color 100ms ease, background 100ms ease;
  }

  .git-setup-recent-list li:hover .git-setup-recent-remove,
  .git-setup-recent-remove:focus-visible {
    opacity: 1;
  }

  .git-setup-recent-remove:hover,
  .git-setup-recent-remove:focus-visible {
    background: var(--surface-alt);
    color: var(--danger);
  }

  .git-setup-recent-action-error {
    margin: 0;
    padding: 0 12px 10px;
    color: var(--danger);
    font-size: 11px;
  }

  .git-setup-recent-item.active {
    border-color: var(--active-border);
    background: var(--active-surface);
  }

  .git-setup-recent-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }

  .git-setup-recent-name {
    min-width: 0;
    color: var(--text);
    font-size: 13px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-setup-recent-path {
    min-width: 0;
    color: var(--text-faint);
    font-family: var(--code, var(--font-code));
    font-size: 11px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-setup-recent-branch {
    min-width: 0;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-setup-recent-arrow {
    color: var(--muted);
    font-size: 14px;
  }
</style>
