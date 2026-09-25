export interface CreateVendorInput {
  name: string
  phone?: string
  address?: string
}

export interface VendorRecord {
  id: string
  vendorCode: string
  name: string
  phone: string
  address: string
  isActive: boolean
}
