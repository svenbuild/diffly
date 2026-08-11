export interface CompareLoadingCopy {
  context: string
  title: string
}

const STAGE_LABELS: Record<string, string> = {
  'compare-start': 'Loading changes',
  'session-request-start': 'Loading changes',
  'session-created': 'Preparing file list',
  'entries-published': 'Opening first changed file',
  'first-entry-load-start': 'Opening first changed file',
  'first-entry-loaded': 'Preparing diff',
  'first-text-entry-loaded': 'Preparing diff',
  'first-pierre-parse-start': 'Rendering diff',
  'first-pierre-parse-end': 'Rendering diff',
}

export function compareLoadingCopy(label: string): CompareLoadingCopy {
  if (label.startsWith('git workingTree:')) {
    return { context: 'Git', title: 'Loading working tree changes…' }
  }
  if (label === 'git refRange') {
    return { context: 'Git', title: 'Loading branch comparison…' }
  }
  if (label === 'git commit') {
    return { context: 'Git', title: 'Loading commit…' }
  }
  if (label === 'githubPullRequest') {
    return { context: 'GitHub', title: 'Loading pull request…' }
  }
  if (label === 'githubCompare') {
    return { context: 'GitHub', title: 'Loading branch comparison…' }
  }
  if (label === 'githubCommit') {
    return { context: 'GitHub', title: 'Loading commit…' }
  }
  if (label === 'local directory') {
    return { context: 'Local', title: 'Comparing folders…' }
  }
  if (label === 'local file') {
    return { context: 'Local', title: 'Comparing files…' }
  }

  return { context: 'Compare', title: 'Loading comparison…' }
}

export function compareLoadingStageLabel(stage: string) {
  return STAGE_LABELS[stage] ?? 'Preparing comparison'
}
