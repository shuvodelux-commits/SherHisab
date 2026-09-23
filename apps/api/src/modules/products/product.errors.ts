export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductValidationError'
  }
}

export class ProductNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductNotFoundError'
  }
}

export class ProductConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductConflictError'
  }
}
