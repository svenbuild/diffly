import type {
  AnnotationSide,
  DiffLineAnnotation,
  LineAnnotation,
} from '@pierre/diffs'
import { pickAvatar } from '../assets/avatars'
import { createAppIcon } from '../icons/app-icons'
import { markDraftSaved, registerDraftEditor } from './comment-drafts'

export interface DifflyCommentAnnotation {
  id: string
  text: string
  draft?: boolean
  savedAt?: string
}

type CommentAnnotation =
  | DiffLineAnnotation<DifflyCommentAnnotation>
  | LineAnnotation<DifflyCommentAnnotation>

interface StoredComment {
  side: AnnotationSide
  lineNumber: number
  id: string
  text: string
}

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

export function commentsStorageKey(compareKey: string) {
  return `diffly:comments:${compareKey}`
}

export function persistCommentAnnotations(
  compareKey: string,
  commentAnnotations: Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>,
) {
  if (typeof localStorage === 'undefined' || !compareKey) {
    return
  }

  const payload: Record<string, StoredComment[]> = {}
  for (const [itemId, list] of commentAnnotations) {
    const stored = list
      .filter((entry) => entry.metadata.text.trim().length > 0)
      .map((entry) => ({
        side: entry.side,
        lineNumber: entry.lineNumber,
        id: entry.metadata.id,
        text: entry.metadata.text,
      }))
    if (stored.length > 0) {
      payload[itemId] = stored
    }
  }

  try {
    if (Object.keys(payload).length === 0) {
      localStorage.removeItem(commentsStorageKey(compareKey))
    } else {
      localStorage.setItem(commentsStorageKey(compareKey), JSON.stringify(payload))
    }
  } catch {
    // Storage may be unavailable or full; comments stay in-memory.
  }
}

export function loadStoredCommentAnnotations(
  compareKey: string,
  currentCommentId: number,
) {
  if (typeof localStorage === 'undefined' || !compareKey) {
    return {
      annotations: new Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>(),
      commentId: currentCommentId,
    }
  }

  let raw: string | null = null
  try {
    raw = localStorage.getItem(commentsStorageKey(compareKey))
  } catch {
    raw = null
  }

  const next = new Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>()
  let maxId = currentCommentId
  let generatedCommentId = currentCommentId

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, StoredComment[]>
      for (const [itemId, list] of Object.entries(parsed)) {
        if (!Array.isArray(list)) {
          continue
        }
        const annotations = list
          .filter((entry) => entry && typeof entry.lineNumber === 'number')
          .map((entry) => {
            const match = /(\d+)$/.exec(String(entry.id ?? ''))
            if (match) {
              maxId = Math.max(maxId, Number(match[1]))
            }

            return {
              side: (entry.side === 'deletions' ? 'deletions' : 'additions') as AnnotationSide,
              lineNumber: entry.lineNumber,
              metadata: {
                id: String(entry.id ?? `comment-${(generatedCommentId += 1)}`),
                text: String(entry.text ?? ''),
              },
            }
          })
        if (annotations.length > 0) {
          next.set(itemId, annotations)
        }
      }
    } catch {
      return {
        annotations: new Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>(),
        commentId: currentCommentId,
      }
    }
  }

  return {
    annotations: next,
    commentId: Math.max(generatedCommentId, maxId),
  }
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
  onSave: () => void
  onDelete: (annotation: CommentAnnotation) => void
}

function buildSavedCard(annotation: CommentAnnotation, callbacks: CommentCallbacks): HTMLElement {
  const card = document.createElement('div')
  card.className = 'diffly-comment-card'

  const body = document.createElement('div')
  body.className = 'diffly-comment-body'
  const author = document.createElement('strong')
  author.className = 'diffly-comment-author'
  author.textContent = pickAvatar(annotation.metadata.id).name
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
    callbacks.onDelete(annotation)
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
    annotation.metadata.text = input.value
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      callbacks.onDelete(annotation)
    }
  })
  const unregisterDraftEditor = registerDraftEditor(annotation.metadata.id, input)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const value = input.value.trim()
    if (!value) {
      callbacks.onDelete(annotation)
      return
    }
    annotation.metadata.text = value
    markDraftSaved(annotation)
    unregisterDraftEditor()
    callbacks.onSave()
    onSaved()
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
