export class SalesValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SalesValidationError'
  }
}

export class InsufficientStockError extends SalesValidationError {
  constructor(
    public readonly requestedBaseQty: string,
    public readonly availableBaseQty: string,
  ) {
    super(
      `Insufficient stock. Requested ${requestedBaseQty}, available ${availableBaseQty}.`,
    )
    this.name = 'InsufficientStockError'
  }
}
