export class SalesDraftVersionConflictError extends Error {
  readonly currentVersion: number

  constructor(currentVersion: number) {
    super(
      `Draft version conflict. Current version is ${currentVersion}.`,
    )
    this.name = 'SalesDraftVersionConflictError'
    this.currentVersion = currentVersion
  }
}

export class SalesDraftAccessError extends Error {
  constructor() {
    super('Draft access denied')
    this.name = 'SalesDraftAccessError'
  }
}
