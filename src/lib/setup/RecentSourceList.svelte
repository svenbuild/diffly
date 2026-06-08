<script lang="ts">
  import type { RecentGitRepository } from '../types'

  export let title = 'Recent Git repositories'
  export let repositories: RecentGitRepository[] = []
  export let loadError = false
  export let activePath = ''
  export let onSelect: (repo: RecentGitRepository) => void
</script>

<section class="git-setup-recent" aria-label={title}>
  <h2 class="git-setup-recent-title">{title}</h2>

  {#if loadError}
    <p class="git-setup-recent-empty">Recent repositories could not be loaded.</p>
  {:else if repositories.length === 0}
    <p class="git-setup-recent-empty">No recent repositories</p>
  {:else}
    <ul class="git-setup-recent-list">
      {#each repositories as repo (repo.id)}
        <li>
          <button
            type="button"
            class="git-setup-recent-item"
            class:active={repo.repoPath === activePath}
            aria-pressed={repo.repoPath === activePath}
            title={repo.repoPath}
            on:click={() => onSelect(repo)}
          >
            <span class="git-setup-recent-name">{repo.name}</span>
            <span class="git-setup-recent-path">{repo.repoPath}</span>
            {#if repo.lastBranch}
              <span class="git-setup-recent-branch">{repo.lastBranch}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
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

  .git-setup-recent-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    gap: 1px;
  }

  .git-setup-recent-item.active {
    border-color: var(--active-border);
    background: var(--active-surface);
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
</style>
