import type {
  AnnotationSide,
  DiffLineAnnotation,
  LineAnnotation,
} from '@pierre/diffs'

export interface DifflyCommentAnnotation {
  id: string
  text: string
}

interface StoredComment {
  side: AnnotationSide
  lineNumber: number
  id: string
  text: string
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
  annotation: DiffLineAnnotation<DifflyCommentAnnotation> | LineAnnotation<DifflyCommentAnnotation>,
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

export function renderCommentAnnotationElement(
  annotation: DiffLineAnnotation<DifflyCommentAnnotation> | LineAnnotation<DifflyCommentAnnotation>,
  callbacks: {
    onDelete: (
      annotation: DiffLineAnnotation<DifflyCommentAnnotation> | LineAnnotation<DifflyCommentAnnotation>,
    ) => void
    onSave: () => void
  },
) {
  const wrapper = document.createElement('div')
  const form = document.createElement('form')
  const avatar = document.createElement('div')
  const input = document.createElement('input')
  const submit = document.createElement('button')
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

  wrapper.className = 'diffly-comment-annotation'
  form.className = 'diffly-comment-composer'
  avatar.className = 'diffly-comment-avatar'
  avatar.textContent = 'D'
  input.type = 'text'
  input.placeholder = 'Add a comment...'
  input.value = annotation.metadata.text
  submit.type = 'submit'
  submit.className = 'diffly-comment-submit'
  submit.setAttribute('aria-label', 'Save comment')
  icon.setAttribute('viewBox', '0 0 16 16')
  icon.setAttribute('aria-hidden', 'true')
  path.setAttribute('d', 'M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('stroke-width', '1.8')
  icon.appendChild(path)
  submit.appendChild(icon)

  const remove = document.createElement('button')
  const removeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const removePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  remove.type = 'button'
  remove.className = 'diffly-comment-delete'
  remove.setAttribute('aria-label', 'Delete comment')
  remove.title = 'Delete comment'
  removeIcon.setAttribute('viewBox', '0 0 16 16')
  removeIcon.setAttribute('aria-hidden', 'true')
  removePath.setAttribute('d', 'M3 5h10M6.5 5V3.5h3V5M6.5 8v3.5M9.5 8v3.5M4.5 5l.5 7.5h6l.5-7.5')
  removePath.setAttribute('fill', 'none')
  removePath.setAttribute('stroke', 'currentColor')
  removePath.setAttribute('stroke-linecap', 'round')
  removePath.setAttribute('stroke-linejoin', 'round')
  removePath.setAttribute('stroke-width', '1.4')
  removeIcon.appendChild(removePath)
  remove.appendChild(removeIcon)

  input.addEventListener('input', () => {
    annotation.metadata.text = input.value
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    annotation.metadata.text = input.value.trim()
    callbacks.onSave()
  })
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    callbacks.onDelete(annotation)
  })

  form.append(avatar, input, submit, remove)
  wrapper.appendChild(form)

  return wrapper
}
