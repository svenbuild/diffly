export interface DirectoryComparePair {
  id: string
  leftBase: string
  rightBase: string
  label: string
}

export function buildDirectoryComparePairs(
  leftPaths: string[],
  rightPaths: string[],
): DirectoryComparePair[] {
  // Selection order on left and right is independent (the user clicks in
  // arbitrary order). Pair by basename first so e.g. CPU on the left gets
  // matched with CPU on the right regardless of click order. Anything that
  // does not have a same-named partner falls back to index pairing on the
  // remaining items.
  const remainingRight = [...rightPaths]
  const matchedLeft: Array<{ leftBase: string; rightBase: string }> = []
  const unmatchedLeft: string[] = []

  for (const leftBase of leftPaths) {
    const leftName = basenameOf(leftBase)
    const matchIndex = remainingRight.findIndex(
      (candidate) => basenameOf(candidate) === leftName,
    )

    if (matchIndex >= 0) {
      const [rightBase] = remainingRight.splice(matchIndex, 1)
      matchedLeft.push({ leftBase, rightBase })
    } else {
      unmatchedLeft.push(leftBase)
    }
  }

  const fallbackPairs: Array<{ leftBase: string; rightBase: string }> = []
  for (const [index, leftBase] of unmatchedLeft.entries()) {
    const rightBase = remainingRight[index] ?? leftBase
    fallbackPairs.push({ leftBase, rightBase })
  }

  const orderedPairs = [...matchedLeft, ...fallbackPairs]
  const labels: string[] = []

  return orderedPairs.map(({ leftBase, rightBase }, index) => {
    const leftName = basenameOf(leftBase)
    const rightName = basenameOf(rightBase)
    const baseLabel = leftName === rightName ? leftName : `${leftName} ↔ ${rightName}`

    let label = baseLabel
    let suffix = 2
    while (labels.includes(label)) {
      label = `${baseLabel} (${suffix})`
      suffix += 1
    }
    labels.push(label)

    return {
      id: `${index}-${leftBase}-${rightBase}`,
      leftBase,
      rightBase,
      label,
    }
  })
}

export function findDirectoryComparePairForPath(
  pairs: DirectoryComparePair[],
  prefixedPath: string,
) {
  if (pairs.length === 0) {
    return null
  }

  if (pairs.length === 1) {
    return { pair: pairs[0], relativePath: prefixedPath }
  }

  for (const pair of pairs) {
    const prefix = `${pair.label}/`
    if (prefixedPath === pair.label) {
      return { pair, relativePath: '' }
    }

    if (prefixedPath.startsWith(prefix)) {
      return { pair, relativePath: prefixedPath.slice(prefix.length) }
    }
  }

  return null
}

export function prefixedRelativePathFor(
  pairs: DirectoryComparePair[],
  pair: DirectoryComparePair,
  relativePath: string,
) {
  if (pairs.length <= 1) {
    return relativePath
  }

  return relativePath ? `${pair.label}/${relativePath}` : pair.label
}

function basenameOf(path: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  const last = parts[parts.length - 1] ?? path
  return /^[A-Za-z]:$/.test(last) ? `${last}\\` : last
}
