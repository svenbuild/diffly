import type {
  AnnotationSide,
  DiffLineAnnotation,
  LineAnnotation,
} from '@pierre/diffs'
import type { DifflyCommentAnnotation } from './directory-code-view-comments'

type CommentAnnotation =
  | DiffLineAnnotation<DifflyCommentAnnotation>
  | LineAnnotation<DifflyCommentAnnotation>

export function commentDraftKey(itemId: string, side: AnnotationSide, lineNumber: number) {
  return `${itemId}\u0000${side}\u0000${lineNumber}`
}

export function isOpenDraft(annotation: CommentAnnotation) {
  return annotation.metadata.draft === true || annotation.metadata.text.trim().length === 0
}

export function findOpenDraft(
  annotations: ReadonlyArray<DiffLineAnnotation<DifflyCommentAnnotation>>,
  side: AnnotationSide,
  lineNumber: number,
) {
  return (
    annotations.find(
      (annotation) =>
        annotation.side === side &&
        annotation.lineNumber === lineNumber &&
        isOpenDraft(annotation),
    ) ?? null
  )
}

export function markDraftSaved(annotation: CommentAnnotation) {
  annotation.metadata.draft = false
  annotation.metadata.savedAt ??= new Date().toISOString()
}

// Pierre caches annotation DOM by id, so the composer input rendered for a
// draft stays alive across re-renders. Track the inputs so a second gutter
// click on the same line can focus the existing editor instead of opening a
// duplicate one.
const draftEditors = new Map<string, HTMLInputElement | HTMLTextAreaElement>()

export function registerDraftEditor(annotationId: string, input: HTMLInputElement | HTMLTextAreaElement) {
  draftEditors.set(annotationId, input)
  return () => {
    if (draftEditors.get(annotationId) === input) {
      draftEditors.delete(annotationId)
    }
  }
}

export function focusDraftEditor(annotationId: string) {
  const input = draftEditors.get(annotationId)
  if (!input || !input.isConnected) {
    return false
  }

  input.focus()
  const wrapper = input.closest('.diffly-comment-annotation') ?? input
  if (typeof wrapper.animate === 'function') {
    wrapper.animate(
      [
        { outline: '2px solid currentColor', outlineOffset: '2px' },
        { outline: '2px solid transparent', outlineOffset: '2px' },
      ],
      { duration: 600, easing: 'ease-out' },
    )
  }
  return true
}
