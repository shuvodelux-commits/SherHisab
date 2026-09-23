export interface FormatNumberOptions {
  maximumFractionDigits?: number
  useGrouping?: boolean
}

const DECIMAL_STRING_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/

function formatExactDecimalString(
  value: string,
  maximumFractionDigits: number,
  useGrouping: boolean,
): string | null {
  const match = DECIMAL_STRING_PATTERN.exec(value.trim())

  if (!match) {
    return null
  }

  const isNegative = match[1] === '-'
  let whole = match[2]!.replace(/^0+(?=\d)/, '')
  let fraction = match[3] ?? ''

  if (fraction.length > maximumFractionDigits) {
    const keptFraction = fraction.slice(0, maximumFractionDigits)
    const roundUp = fraction[maximumFractionDigits]! >= '5'
    const scale = 10n ** BigInt(maximumFractionDigits)
    let magnitude =
      BigInt(whole) * scale +
      BigInt(keptFraction.padEnd(maximumFractionDigits, '0') || '0')

    if (roundUp) {
      magnitude += 1n
    }

    if (maximumFractionDigits === 0) {
      whole = magnitude.toString()
      fraction = ''
    } else {
      whole = (magnitude / scale).toString()
      fraction = (magnitude % scale)
        .toString()
        .padStart(maximumFractionDigits, '0')
    }
  }

  fraction = fraction.replace(/0+$/, '')

  const groupedWhole = useGrouping
    ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : whole
  const sign = isNegative ? '-' : ''

  return fraction
    ? `${sign}${groupedWhole}.${fraction}`
    : `${sign}${groupedWhole}`
}

export function formatNumber(
  value: number | string | bigint,
  options: FormatNumberOptions = {},
): string {
  const useGrouping = options.useGrouping ?? true
  const maximumFractionDigits = options.maximumFractionDigits ?? 20

  if (typeof value === 'bigint') {
    return new Intl.NumberFormat('en-US', {
      useGrouping,
    }).format(value)
  }

  if (typeof value === 'string') {
    const exactValue = formatExactDecimalString(
      value,
      maximumFractionDigits,
      useGrouping,
    )

    if (exactValue !== null) {
      return exactValue
    }
  }

  const numericValue = typeof value === 'string' ? Number(value) : value

  if (!Number.isFinite(numericValue)) {
    return String(value)
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping,
  }).format(numericValue)
}
