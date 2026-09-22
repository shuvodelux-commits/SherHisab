export interface FormatNumberOptions {
  maximumFractionDigits?: number
  useGrouping?: boolean
}

export function formatNumber(
  value: number | string | bigint,
  options: FormatNumberOptions = {},
): string {
  const useGrouping = options.useGrouping ?? true

  if (typeof value === 'bigint') {
    return new Intl.NumberFormat('en-US', {
      useGrouping,
    }).format(value)
  }

  const numericValue = typeof value === 'string' ? Number(value) : value

  if (!Number.isFinite(numericValue)) {
    return String(value)
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 20,
    useGrouping,
  }).format(numericValue)
}
