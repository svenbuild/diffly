<script lang="ts">
  import { onMount } from 'svelte'
  import type { ReviewBundle } from '../review-types'
  import { reviewThreadController } from './thread-controller'
  import { reviewThreads, visibleReviewThreads, type ReviewThreadFilter } from './thread-store'

  export let sessionId: string
  export let entryId: string
  export let entryPath = ''
  export let onNavigate: (side: 'deletions' | 'additions', lineNumber: number) => Promise<void> | void = () => {}

  let side: 'deletions' | 'additions' = 'additions'
  let lineNumber = 1
  let newBody = ''
  let replyBodies: Record<string, string> = {}
  let editing: { threadId: string; commentId: string; body: string } | null = null
  let importInput: HTMLInputElement | null = null
  let hydratedFor = ''

  $: newDraftKey = `new:${entryId}`
  $: hydrationKey = `${sessionId}:${entryId}:${$reviewThreads.loading ? 'loading' : 'ready'}`
  $: if (!$reviewThreads.loading && hydratedFor !== hydrationKey) {
    newBody = $reviewThreads.drafts.get(newDraftKey)?.body ?? ''
    const recoveredReplies: Record<string, string> = {}
    for (const thread of $reviewThreads.threads) {
      const body = $reviewThreads.drafts.get(`reply:${thread.id}`)?.body
      if (body) recoveredReplies[thread.id] = body
    }
    replyBodies = recoveredReplies
    hydratedFor = hydrationKey
  }

  onMount(() => void reviewThreadController.load(sessionId, entryId))
  $: if ($reviewThreads.sessionId !== sessionId || $reviewThreads.entryId !== entryId) {
    void reviewThreadController.load(sessionId, entryId)
  }

  async function createThread() {
    const body = newBody.trim()
    if (!body || lineNumber < 1) return
    await reviewThreadController.create(side, lineNumber, body)
    newBody = ''
    reviewThreadController.deleteDraft(newDraftKey)
  }

  async function reply(threadId: string) {
    const body = replyBodies[threadId]?.trim()
    if (!body) return
    await reviewThreadController.reply(threadId, body)
    replyBodies = { ...replyBodies, [threadId]: '' }
    reviewThreadController.deleteDraft(`reply:${threadId}`)
  }

  async function saveEdit() {
    if (!editing?.body.trim()) return
    await reviewThreadController.edit(editing.threadId, editing.commentId, editing.body.trim())
    editing = null
  }

  async function download(format: 'json' | 'markdown') {
    const contents = await reviewThreadController.export(format)
    const blob = new Blob([contents], { type: format === 'json' ? 'application/json' : 'text/markdown' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `diffly-review.${format === 'json' ? 'json' : 'md'}`
    anchor.click()
    URL.revokeObjectURL(href)
  }

  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      await reviewThreadController.import(JSON.parse(await file.text()) as ReviewBundle)
    } finally {
      input.value = ''
    }
  }

  function selectFilter(event: Event) {
    reviewThreadController.setFilter((event.currentTarget as HTMLSelectElement).value as ReviewThreadFilter)
  }
</script>

<section class="thread-panel" aria-label="Review threads">
  <header>
    <div><strong>Review threads</strong><span>{entryPath || entryId}</span></div>
    <nav aria-label="Thread navigation">
      <button class="secondary" type="button" title="Previous thread" on:click={() => reviewThreadController.navigate(-1)}>↑</button>
      <button class="secondary" type="button" title="Next thread" on:click={() => reviewThreadController.navigate(1)}>↓</button>
    </nav>
  </header>

  <div class="thread-tools">
    <select value={$reviewThreads.filter} aria-label="Filter review threads" on:change={selectFilter}>
      <option value="open">Open</option>
      <option value="resolved">Resolved</option>
      <option value="outdated">Outdated</option>
      <option value="all">All</option>
    </select>
    <span>{$visibleReviewThreads.length} / {$reviewThreads.threads.length}</span>
    <button class="secondary" type="button" on:click={() => download('json')}>JSON</button>
    <button class="secondary" type="button" on:click={() => download('markdown')}>Markdown</button>
    <button class="secondary" type="button" on:click={() => importInput?.click()}>Import</button>
    <input class="hidden" bind:this={importInput} type="file" accept="application/json,.json" on:change={importFile} />
  </div>

  <details class="author-settings">
    <summary>Author: {$reviewThreads.author.name}</summary>
    <label>Name <input value={$reviewThreads.author.name} on:change={(event) => reviewThreadController.setAuthor((event.currentTarget as HTMLInputElement).value, $reviewThreads.author.avatar)} /></label>
    <label>Avatar URL <input value={$reviewThreads.author.avatar ?? ''} on:change={(event) => reviewThreadController.setAuthor($reviewThreads.author.name, (event.currentTarget as HTMLInputElement).value || null)} /></label>
  </details>

  <div class="new-thread">
    <div>
      <select bind:value={side} aria-label="Comment side"><option value="additions">New</option><option value="deletions">Old</option></select>
      <label>Line <input type="number" min="1" bind:value={lineNumber} /></label>
    </div>
    <textarea bind:value={newBody} rows="3" placeholder="Add a multiline review comment…" on:input={() => reviewThreadController.saveDraft(newDraftKey, newBody)}></textarea>
    <button type="button" disabled={!newBody.trim() || $reviewThreads.saving} on:click={createThread}>Start thread</button>
  </div>

  {#if $reviewThreads.loading}<p class="muted">Loading threads…</p>{/if}
  {#if $reviewThreads.error}<p class="error">{$reviewThreads.error}</p>{/if}

  <div class="threads">
    {#each $visibleReviewThreads as thread (thread.id)}
      <article class:selected={$reviewThreads.selectedThreadId === thread.id} class:outdated={thread.state === 'outdated'}>
        <button class="anchor" type="button" on:click={() => { reviewThreadController.select(thread.id); void onNavigate(thread.anchor.side, thread.anchor.lineNumber) }}>
          <span class:resolved={thread.state === 'resolved'}>{thread.state}</span>
          <strong>{thread.anchor.side === 'additions' ? 'New' : 'Old'} line {thread.anchor.lineNumber}</strong>
        </button>
        {#if thread.state === 'outdated'}
          <p class="outdated-note">The original line is no longer unique. Review the old context before reattaching.</p>
          <pre>{[...thread.anchor.contextBefore, thread.anchor.contextAfter[0] ?? ''].join('\n')}</pre>
        {/if}
        {#each thread.comments as comment (comment.id)}
          <div class="comment">
            <div class="comment-meta"><strong>{comment.author.name}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time></div>
            {#if editing?.commentId === comment.id}
              <textarea rows="3" bind:value={editing.body}></textarea>
              <div class="comment-actions"><button type="button" on:click={saveEdit}>Save</button><button class="secondary" type="button" on:click={() => editing = null}>Cancel</button></div>
            {:else}
              <p>{comment.body}</p>
              <div class="comment-actions">
                <button class="link" type="button" on:click={() => editing = { threadId: thread.id, commentId: comment.id, body: comment.body }}>Edit</button>
                <button class="link danger" type="button" on:click={() => reviewThreadController.remove(thread.id, comment.id)}>Delete</button>
              </div>
            {/if}
          </div>
        {/each}
        <textarea rows="2" value={replyBodies[thread.id] ?? ''} on:input={(event) => { const body = (event.currentTarget as HTMLTextAreaElement).value; replyBodies = { ...replyBodies, [thread.id]: body }; reviewThreadController.saveDraft(`reply:${thread.id}`, body) }} placeholder="Reply…"></textarea>
        <div class="thread-actions">
          <button type="button" disabled={!replyBodies[thread.id]?.trim()} on:click={() => reply(thread.id)}>Reply</button>
          {#if thread.state === 'resolved'}
            <button class="secondary" type="button" on:click={() => reviewThreadController.reopen(thread.id)}>Reopen</button>
          {:else if thread.state === 'open'}
            <button class="secondary" type="button" on:click={() => reviewThreadController.resolve(thread.id)}>Resolve</button>
          {/if}
        </div>
      </article>
    {/each}
    {#if !$reviewThreads.loading && $visibleReviewThreads.length === 0}<p class="muted">No {$reviewThreads.filter} threads.</p>{/if}
  </div>
</section>

<style>
  .thread-panel { min-height: 0; display: grid; grid-template-rows: auto auto auto auto auto minmax(0, 1fr); background: var(--panel-surface); }
  header, header > div, header nav, .thread-tools, .new-thread > div, .thread-actions, .comment-actions, .comment-meta { display: flex; align-items: center; gap: 6px; }
  header { justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
  header > div { min-width: 0; align-items: baseline; }
  header span, .thread-tools span, .muted, time { color: var(--muted-text); font-size: 11px; }
  header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thread-tools { flex-wrap: wrap; padding: 6px 8px; border-bottom: 1px solid var(--border-color); }
  .hidden { display: none; }
  .author-settings { padding: 6px 9px; border-bottom: 1px solid var(--border-color); font-size: 11px; }
  .author-settings label { display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 5px; margin-top: 5px; }
  .new-thread { display: grid; gap: 6px; padding: 8px; border-bottom: 1px solid var(--border-color); }
  .new-thread input[type='number'] { width: 62px; }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; }
  .threads { min-height: 0; overflow: auto; }
  article { display: grid; gap: 7px; padding: 9px; border-bottom: 1px solid var(--border-color); }
  article.selected { box-shadow: inset 2px 0 var(--accent); }
  article.outdated { background: color-mix(in srgb, var(--diff-removed) 6%, transparent); }
  .anchor { display: flex; justify-content: space-between; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; }
  .anchor span { text-transform: uppercase; color: var(--accent); font-size: 10px; }
  .anchor span.resolved { color: var(--muted-text); }
  .comment { display: grid; gap: 4px; padding-left: 8px; border-left: 2px solid var(--border-color); }
  .comment-meta { justify-content: space-between; }
  .comment p, .outdated-note, .muted, .error { margin: 0; white-space: pre-wrap; }
  .error, .danger { color: var(--diff-removed); }
  .link { min-height: 0; padding: 0; border: 0; background: none; color: var(--muted-text); }
  pre { overflow: auto; margin: 0; padding: 6px; background: var(--code-surface); font-size: 11px; }
</style>
