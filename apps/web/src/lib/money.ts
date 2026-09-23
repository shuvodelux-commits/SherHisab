const TAKA_PATTERN = /^\d+(?:\.\d{1,2})?$/
const PAISA_PATTERN = /^\d+$/

export function parseTakaToPaisa(input: string): string {
  const value = input.trim()

  if (!TAKA_PATTERN.test(value)) {
    throw new Error('Money must be a non-negative taka amount with at most two decimal places')
  }

  const [whole = '0', fraction = ''] = value.split('.')
  const fractionPaisa = fraction.padEnd(2, '0')
  const paisa = BigInt(whole) * 100n + BigInt(fractionPaisa || '0')

  return paisa.toString()
}

export function formatPaisaToTaka(input: string): string {
  const value = input.trim()

  if (!PAISA_PATTERN.test(value)) {
    throw new Error('Paisa must be a non-negative integer')
  }

  const paisa = BigInt(value)
  const whole = paisa / 100n
  const fraction = (paisa % 100n).toString().padStart(2, '0')

  return `${whole.toString()}.${fraction}`
}
