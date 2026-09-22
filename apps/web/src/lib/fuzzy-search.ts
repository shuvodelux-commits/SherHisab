function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function fuzzyMatch(query: string, candidate: string): boolean {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return true
  }

  const normalizedCandidate = normalizeSearchText(candidate)

  if (normalizedCandidate.includes(normalizedQuery)) {
    return true
  }

  let queryIndex = 0

  for (const character of normalizedCandidate) {
    if (character === normalizedQuery[queryIndex]) {
      queryIndex += 1

      if (queryIndex === normalizedQuery.length) {
        return true
      }
    }
  }

  return false
}

export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getSearchText: (item: T) => string | readonly string[],
): T[] {
  if (!query.trim()) {
    return [...items]
  }

  return items.filter((item) => {
    const searchText = getSearchText(item)
    const values = Array.isArray(searchText) ? searchText : [searchText]

    return values.some((value) => fuzzyMatch(query, value))
  })
}
