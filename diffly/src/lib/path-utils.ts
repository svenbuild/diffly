import type { EntryGroup, FolderSection } from './ui-types'

export const ROOT_GROUP = '__root__'

export function getParentPath(relativePath: string) {
  const normalized = relativePath.replaceAll('\\', '/')
  const lastSlash = normalized.lastIndexOf('/')

  if (lastSlash === -1) {
    return ROOT_GROUP
  }

  return normalized.slice(0, lastSlash)
}

export function getFileName(relativePath: string) {
  const normalized = relativePath.replaceAll('\\', '/')
  const lastSlash = normalized.lastIndexOf('/')

  if (lastSlash === -1) {
    return normalized
  }

  return normalized.slice(lastSlash + 1)
}

export function normalizeSelectionPath(path: string) {
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

export function buildFolderSections(groups: EntryGroup[]) {
  type Node = {
    key: string
    label: string
    entries: EntryGroup['entries']
    children: string[]
    totalCount: number
  }

  const nodes = new Map<string, Node>()

  const ensureNode = (key: string) => {
    if (!nodes.has(key)) {
      nodes.set(key, {
        key,
        label: key === ROOT_GROUP ? 'Root' : getFileName(key),
        entries: [],
        children: [],
        totalCount: 0,
      })
    }

    return nodes.get(key)!
  }

  ensureNode(ROOT_GROUP)

  for (const group of groups) {
    const parts = group.key === ROOT_GROUP ? [] : group.key.split('/')
    let currentKey = ROOT_GROUP

    for (const part of parts) {
      const nextKey = currentKey === ROOT_GROUP ? part : `${currentKey}/${part}`
      const currentNode = ensureNode(currentKey)
      ensureNode(nextKey)

      if (!currentNode.children.includes(nextKey)) {
        currentNode.children = [...currentNode.children, nextKey]
      }

      currentKey = nextKey
    }

    ensureNode(group.key).entries = group.entries
  }

  const computeCounts = (key: string) => {
    const node = ensureNode(key)
    let total = node.entries.length

    for (const childKey of node.children) {
      total += computeCounts(childKey)
    }

    node.totalCount = total
    return total
  }

  computeCounts(ROOT_GROUP)

  const sections: FolderSection[] = []

  const appendSections = (key: string, depth: number) => {
    const node = ensureNode(key)

    sections.push({
      key: node.key,
      label: node.label,
      depth,
      entries: node.entries,
      totalCount: node.totalCount,
    })

    const sortedChildren = [...node.children].sort((left, right) => left.localeCompare(right))

    for (const childKey of sortedChildren) {
      appendSections(childKey, depth + 1)
    }
  }

  appendSections(ROOT_GROUP, 0)

  return sections
}

export function getVisibleFolderSections(
  sections: FolderSection[],
  collapsedState: Record<string, boolean>,
) {
  return sections.filter((section) => {
    if (section.key === ROOT_GROUP) {
      return true
    }

    if (collapsedState[ROOT_GROUP]) {
      return false
    }

    const parts = section.key.split('/')
    let current = ''

    for (let index = 0; index < parts.length - 1; index += 1) {
      current = current ? `${current}/${parts[index]}` : parts[index]

      if (collapsedState[current]) {
        return false
      }
    }

    return true
  })
}
