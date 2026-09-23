import Decimal from 'decimal.js'
import { ProductValidationError } from './product.errors'

export function requireName(value: string, label: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new ProductValidationError(`${label} is required`)
  }

  return trimmed
}

export function parseMoneyPaisa(value: string, label: string): string {
  if (!/^\d+$/.test(value)) {
    throw new ProductValidationError(
      `${label} must be a non-negative integer paisa amount`,
    )
  }

  return BigInt(value).toString()
}

export function parseQuantity(value: string, label: string): string {
  let decimal: Decimal

  try {
    decimal = new Decimal(value)
  } catch {
    throw new ProductValidationError(`${label} must be a valid quantity`)
  }

  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new ProductValidationError(`${label} must be non-negative`)
  }

  return decimal.toFixed()
}

export function parsePositiveConversion(
  value: string,
  label: string,
): string {
  let decimal: Decimal

  try {
    decimal = new Decimal(value)
  } catch {
    throw new ProductValidationError(`${label} must be a valid number`)
  }

  if (!decimal.isFinite() || decimal.lte(0)) {
    throw new ProductValidationError(`${label} must be greater than zero`)
  }

  return decimal.toFixed()
}
