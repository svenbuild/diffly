import type {
  AnnotationSide,
  DiffLineAnnotation,
  LineAnnotation,
} from '@pierre/diffs'
import { getReviewProfile, replyReviewThread, resolveReviewThread, reopenReviewThread } from '../api'
import { createAppIcon } from '../icons/app-icons'
import type { ReviewAuthor, ReviewThread } from '../review-types'
import { markDraftSaved, registerDraftEditor } from './comment-drafts'

export interface DifflyCommentAnnotation {
  render?: () => HTMLElement
  id: string
  text: string
  draft?: boolean
  replyDraft?: string
  savedAt?: string
  threadId?: string
  commentId?: string
  author?: ReviewAuthor
  state?: ReviewThread['state']
  comments?: ReviewThread['comments']
  sessionId?: string
  entryId?: string
}

type CommentAnnotation =
  | DiffLineAnnotation<DifflyCommentAnnotation>
  | LineAnnotation<DifflyCommentAnnotation>

const sendIcon = () => createAppIcon('send')

export function removeCommentAnnotation(
  commentAnnotations: Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>,
  annotation: CommentAnnotation,
) {
  const targetId = annotation.metadata.id
  const next = new Map(commentAnnotations)

  for (const [itemId, list] of commentAnnotations) {
    if (!list.some((entry) => entry.metadata.id === targetId)) {
      continue
    }

    next.set(
      itemId,
      list.filter((entry) => entry.metadata.id !== targetId),
    )
    return {
      removed: true,
      annotations: next,
    }
  }

  return {
    removed: false,
    annotations: commentAnnotations,
  }
}

interface CommentCallbacks {
  onSave: (annotation: CommentAnnotation) => void | Promise<void>
  onDelete: (annotation: CommentAnnotation) => void | Promise<void>
}

export function reviewThreadsToAnnotations(threads: ReviewThread[], sessionId?: string, entryId?: string, previous: Array<DiffLineAnnotation<DifflyCommentAnnotation>> = []) {
  const existing = new Map(previous.filter(item => item.metadata.threadId).map(item => [item.metadata.threadId, item]))
  return threads.flatMap((thread): Array<DiffLineAnnotation<DifflyCommentAnnotation>> => {
    if (thread.state === 'outdated') return []
    const prior = existing.get(thread.id)
    if (prior?.metadata.savedAt === thread.updatedAt && prior.metadata.state === thread.state) return [prior]
    const comment = thread.comments[0]
    if (!comment) return []
    return [{
      side: thread.anchor.side,
      lineNumber: thread.anchor.lineNumber,
      metadata: {
        id: prior?.metadata.id ?? `thread-${thread.id}`,
        replyDraft: prior?.metadata.replyDraft,
        text: thread.comments.map((item) => item.body).join('\n\n'),
        sessionId, entryId, comments: thread.comments,
        threadId: thread.id,
        commentId: comment.id,
        author: comment.author,
        state: thread.state,
        savedAt: thread.updatedAt,
      },
    }]
  })
}

function buildSavedCard(annotation: CommentAnnotation): HTMLElement {
  const card = document.createElement('section')
  card.className = 'diffly-review-thread'
  card.setAttribute('aria-label', 'Review thread')
  let saving = false
  const render = () => {
    card.replaceChildren()
    const metadata = annotation.metadata
    const heading = document.createElement('div')
    heading.className = 'diffly-thread-actions'
    const label = document.createElement('strong')
    label.textContent = metadata.state === 'resolved' ? 'Resolved' : 'Discussion'
    heading.append(label)
    card.append(heading)
    const error = document.createElement('p')
    error.setAttribute('role', 'alert')
    const run = async (operation: () => Promise<ReviewThread>, clearReply = false) => {
      if (saving) return
      saving = true
      card.querySelectorAll('button').forEach(button => button.disabled = true)
      try {
        const thread = await operation()
        if (clearReply) metadata.replyDraft = ''
        metadata.comments = thread.comments
        metadata.state = thread.state
        metadata.text = thread.comments.map(comment => comment.body).join('\n\n')
        metadata.savedAt = thread.updatedAt
        render()
        window.dispatchEvent(new CustomEvent('diffly:review-changed', {
          detail: { sessionId: metadata.sessionId, entryId: metadata.entryId },
        }))
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : 'Unable to update review.'
        card.querySelectorAll('button').forEach(button => button.disabled = false)
      } finally {
        saving = false
      }
    }
    if (metadata.sessionId && metadata.threadId) {
      const resolve = document.createElement('button')
      resolve.type = 'button'
      resolve.textContent = metadata.state === 'resolved' ? 'Reopen' : 'Resolve'
      resolve.onclick = () => void run(() => metadata.state === 'resolved'
        ? reopenReviewThread(metadata.sessionId!, metadata.threadId!)
        : resolveReviewThread(metadata.sessionId!, metadata.threadId!))
      heading.append(resolve)
    }
    for (const comment of metadata.comments ?? [{ author: metadata.author, body: metadata.text }]) {
      const body = document.createElement('div')
      body.className = 'diffly-comment-body'
      const author = document.createElement('strong')
      author.textContent = comment.author?.name ?? 'Local reviewer'
      const text = document.createElement('p')
      text.className = 'diffly-comment-text'
      text.textContent = comment.body
      body.append(author, text)
      card.append(body)
    }
    if (metadata.sessionId && metadata.threadId && metadata.state !== 'resolved') {
      const form = document.createElement('form')
      const input = document.createElement('textarea')
      input.placeholder = 'Add a reply…'
      input.setAttribute('aria-label', 'Reply')
      input.rows = 2
      input.value = metadata.replyDraft ?? ''
      input.oninput = () => { metadata.replyDraft = input.value }
      const submit = document.createElement('button')
      submit.type = 'submit'
      submit.textContent = 'Reply'
      form.append(input, submit)
      form.onsubmit = event => {
        event.preventDefault()
        if (!input.value.trim()) return
        void run(async () => replyReviewThread({
          sessionId: metadata.sessionId!, threadId: metadata.threadId!,
          body: input.value.trim(), author: await getReviewProfile(),
        }), true)
      }
      card.append(form)
    }
    card.append(error)
  }
  render()
  return card
}

function buildComposer(
  annotation: CommentAnnotation,
  callbacks: CommentCallbacks,
  onSaved: () => void,
): HTMLElement {
  const form = document.createElement('form')
  form.className = 'diffly-comment-composer'

  const input = document.createElement('textarea')
  input.rows = 3
  input.setAttribute('aria-label', 'Comment')
  input.placeholder = 'Add a comment...'
  input.value = annotation.metadata.text

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'diffly-comment-submit'
  submit.setAttribute('aria-label', 'Save comment')
  submit.title = 'Save comment'
  submit.appendChild(sendIcon())

  input.addEventListener('input', () => {
    input.setCustomValidity('')
    annotation.metadata.text = input.value
  })
  input.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      form.requestSubmit()
    }
    if (event.key === 'Escape' && !submit.disabled) {
      event.stopPropagation()
      void Promise.resolve(callbacks.onDelete(annotation)).catch((error) => {
        input.setCustomValidity(error instanceof Error ? error.message : 'Unable to delete comment.')
        input.reportValidity()
      })
    }
  })
  const unregisterDraftEditor = registerDraftEditor(annotation.metadata.id, input)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (submit.disabled) return
    const value = input.value.trim()
    if (!value) {
      callbacks.onDelete(annotation)
      return
    }
    annotation.metadata.text = value
    submit.disabled = true
    cancel.disabled = true
    input.readOnly = true
    try {
      await callbacks.onSave(annotation)
      markDraftSaved(annotation)
      unregisterDraftEditor()
      onSaved()
    } catch (error) {
      input.setCustomValidity(error instanceof Error ? error.message : 'Unable to save comment.')
      input.reportValidity()
    } finally {
      submit.disabled = false
      cancel.disabled = false
      input.readOnly = false
    }
  })

  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Cancel'
  cancel.onclick = () => {
    void Promise.resolve(callbacks.onDelete(annotation)).then(unregisterDraftEditor).catch(error => {
      input.setCustomValidity(error instanceof Error ? error.message : 'Unable to cancel comment.')
      input.reportValidity()
    })
  }
  form.append(input, cancel, submit)
  window.requestAnimationFrame(() => input.focus())
  return form
}

export function renderCommentAnnotationElement(
  annotation: CommentAnnotation,
  callbacks: CommentCallbacks,
) {
  if (annotation.metadata.render) return annotation.metadata.render()
  const wrapper = document.createElement('div')
  wrapper.className = 'diffly-comment-annotation'

  const showSaved = () => wrapper.replaceChildren(buildSavedCard(annotation))
  const showComposer = () =>
    wrapper.replaceChildren(buildComposer(annotation, callbacks, showSaved))

  if (annotation.metadata.draft !== true && annotation.metadata.text.trim().length > 0) {
    showSaved()
  } else {
    showComposer()
  }

  return wrapper
}
