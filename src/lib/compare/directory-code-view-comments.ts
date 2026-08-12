import type {
  AnnotationSide,
  DiffLineAnnotation,
  LineAnnotation,
} from '@pierre/diffs'
import { pickAvatar } from '../assets/avatars'
import { createAppIcon } from '../icons/app-icons'
import type { ReviewAuthor, ReviewThread } from '../review-types'
import { markDraftSaved, registerDraftEditor } from './comment-drafts'

export interface DifflyCommentAnnotation {
  id: string
  text: string
  draft?: boolean
  savedAt?: string
  threadId?: string
  commentId?: string
  author?: ReviewAuthor
  state?: ReviewThread['state']
}

type CommentAnnotation =
  | DiffLineAnnotation<DifflyCommentAnnotation>
  | LineAnnotation<DifflyCommentAnnotation>

const sendIcon = () => createAppIcon('send')
const closeIcon = () => createAppIcon('close')

function createCommentAvatar(seed: string): HTMLImageElement {
  const img = document.createElement('img')
  img.className = 'diffly-comment-avatar'
  img.src = pickAvatar(seed).url
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  img.draggable = false
  return img
}

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

export function reviewThreadsToAnnotations(threads: ReviewThread[]) {
  return threads.flatMap((thread): Array<DiffLineAnnotation<DifflyCommentAnnotation>> => {
    if (thread.state === 'outdated') return []
    const comment = thread.comments[0]
    if (!comment) return []
    return [{
      side: thread.anchor.side,
      lineNumber: thread.anchor.lineNumber,
      metadata: {
        id: `thread-${thread.id}`,
        text: thread.comments.map((item) => item.body).join('\n\n'),
        threadId: thread.id,
        commentId: comment.id,
        author: comment.author,
        state: thread.state,
        savedAt: thread.updatedAt,
      },
    }]
  })
}

function buildSavedCard(annotation: CommentAnnotation, callbacks: CommentCallbacks): HTMLElement {
  const card = document.createElement('div')
  card.className = 'diffly-comment-card'

  const body = document.createElement('div')
  body.className = 'diffly-comment-body'
  const author = document.createElement('strong')
  author.className = 'diffly-comment-author'
  author.textContent = annotation.metadata.author?.name ?? pickAvatar(annotation.metadata.id).name
  const text = document.createElement('p')
  text.className = 'diffly-comment-text'
  text.textContent = annotation.metadata.text
  body.append(author, text)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'diffly-comment-delete'
  remove.setAttribute('aria-label', 'Delete comment')
  remove.title = 'Delete comment'
  remove.appendChild(closeIcon())
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    remove.disabled = true
    void Promise.resolve(callbacks.onDelete(annotation)).catch((error) => {
      remove.disabled = false
      remove.title = error instanceof Error ? error.message : 'Unable to delete comment.'
    })
  })

  card.append(createCommentAvatar(annotation.metadata.id), body, remove)
  return card
}

function buildComposer(
  annotation: CommentAnnotation,
  callbacks: CommentCallbacks,
  onSaved: () => void,
): HTMLElement {
  const form = document.createElement('form')
  form.className = 'diffly-comment-composer'

  const input = document.createElement('input')
  input.type = 'text'
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
    if (event.key === 'Escape') {
      void Promise.resolve(callbacks.onDelete(annotation)).catch((error) => {
        input.setCustomValidity(error instanceof Error ? error.message : 'Unable to delete comment.')
        input.reportValidity()
      })
    }
  })
  const unregisterDraftEditor = registerDraftEditor(annotation.metadata.id, input)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const value = input.value.trim()
    if (!value) {
      callbacks.onDelete(annotation)
      return
    }
    annotation.metadata.text = value
    submit.disabled = true
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
    }
  })

  form.append(createCommentAvatar(annotation.metadata.id), input, submit)
  window.requestAnimationFrame(() => input.focus())
  return form
}

export function renderCommentAnnotationElement(
  annotation: CommentAnnotation,
  callbacks: CommentCallbacks,
) {
  const wrapper = document.createElement('div')
  wrapper.className = 'diffly-comment-annotation'

  // Toggle composer <-> saved card in-place so it doesn't depend on Pierre
  // re-running renderAnnotation (it caches annotation DOM by id). "Saved" is
  // simply derived from whether there is any text yet.
  const showSaved = () => wrapper.replaceChildren(buildSavedCard(annotation, callbacks))
  const showComposer = () =>
    wrapper.replaceChildren(buildComposer(annotation, callbacks, showSaved))

  if (annotation.metadata.text.trim().length > 0) {
    showSaved()
  } else {
    showComposer()
  }

  return wrapper
}
