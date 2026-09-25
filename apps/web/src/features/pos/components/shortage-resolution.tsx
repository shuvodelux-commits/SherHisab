import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { formatPaisaToTaka } from '../../../lib/money'
import {
  createPosVendor,
  searchPosVendors,
} from '../pos-api'
import type { PosVendorSearchDto } from '../pos-types'

interface ShortageResolutionProps {
  productName: string
  unitLabel: string
  ownBaseQty: string
  shortfallBaseQty: string
  resolution: 'VENDOR' | 'NEGATIVE_STOCK' | null
  vendorId: string | null
  vendorName: string
  vendorUnitCostInput: string
  vendorTotalPaisa: string
  onOwnStock: () => void
  onResolutionChange: (
    resolution: 'VENDOR' | 'NEGATIVE_STOCK',
  ) => void
  onVendorSelect: (vendor: PosVendorSearchDto) => void
  onVendorCostChange: (value: string) => void
}

export function ShortageResolution({
  productName,
  unitLabel,
  ownBaseQty,
  shortfallBaseQty,
  resolution,
  vendorId,
  vendorName,
  vendorUnitCostInput,
  vendorTotalPaisa,
  onOwnStock,
  onResolutionChange,
  onVendorSelect,
  onVendorCostChange,
}: ShortageResolutionProps) {
  const [vendorSearch, setVendorSearch] = useState(vendorName)
  const [showNewVendor, setShowNewVendor] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorPhone, setNewVendorPhone] = useState('')

  const vendorQuery = useQuery({
    queryKey: ['pos-vendors', vendorSearch.trim()],
    queryFn: () => searchPosVendors(vendorSearch.trim(), 20),
    enabled:
      resolution === 'VENDOR' &&
      vendorSearch.trim().length > 0 &&
      vendorSearch.trim() !== vendorName,
  })

  const createVendorMutation = useMutation({
    mutationFn: () =>
      createPosVendor({
        name: newVendorName,
        phone: newVendorPhone,
      }),
    onSuccess: (vendor) => {
      onVendorSelect(vendor)
      setVendorSearch(vendor.name)
      setShowNewVendor(false)
      setNewVendorName('')
      setNewVendorPhone('')
    },
  })

  return (
    <div className="pos-shortage-resolution">
      <div className="pos-shortage-heading">
        <strong>
          Shortfall: {shortfallBaseQty} {unitLabel}
        </strong>
        <span>Choose how to cover it.</span>
      </div>

      <div className="pos-shortage-actions">
        <Button
          onClick={onOwnStock}
          size="sm"
          type="button"
          variant="outline"
        >
          Own Stock ({ownBaseQty})
        </Button>
        <Button
          aria-pressed={resolution === 'VENDOR'}
          onClick={() => onResolutionChange('VENDOR')}
          size="sm"
          type="button"
          variant={resolution === 'VENDOR' ? 'default' : 'outline'}
        >
          Vendor / Consignment
        </Button>
        <Button
          aria-pressed={resolution === 'NEGATIVE_STOCK'}
          onClick={() => onResolutionChange('NEGATIVE_STOCK')}
          size="sm"
          type="button"
          variant={
            resolution === 'NEGATIVE_STOCK'
              ? 'default'
              : 'outline'
          }
        >
          Negative Stock Sale
        </Button>
      </div>

      {resolution === 'VENDOR' ? (
        <div className="pos-vendor-source">
          <div className="pos-vendor-picker">
            <Input
              aria-label={`Vendor for ${productName}`}
              onChange={(event) => {
                setVendorSearch(event.target.value)
                if (vendorId) {
                  onVendorSelect({
                    id: '',
                    vendorCode: '',
                    name: '',
                    phone: '',
                    address: '',
                    isActive: true,
                  })
                }
              }}
              placeholder="Search Vendor"
              value={vendorSearch}
            />
            {vendorQuery.data?.length ? (
              <div className="pos-vendor-results">
                {vendorQuery.data.map((vendor) => (
                  <Button
                    aria-label={`Select ${vendor.name}`}
                    key={vendor.id}
                    onClick={() => {
                      onVendorSelect(vendor)
                      setVendorSearch(vendor.name)
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <span>{vendor.name}</span>
                    <small>{vendor.vendorCode}</small>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <label className="pos-vendor-cost">
            <span>Sourcing Unit Cost</span>
            <Input
              aria-label={`Sourcing Unit Cost for ${productName}`}
              inputMode="decimal"
              onChange={(event) =>
                onVendorCostChange(event.target.value)
              }
              value={vendorUnitCostInput}
            />
          </label>

          <div className="pos-vendor-summary">
            <span>
              Shortage {shortfallBaseQty} {unitLabel}
            </span>
            <span>
              Vendor total ৳{formatPaisaToTaka(vendorTotalPaisa)}
            </span>
          </div>

          <Button
            onClick={() => setShowNewVendor((value) => !value)}
            size="sm"
            type="button"
            variant="link"
          >
            + New Vendor
          </Button>

          {showNewVendor ? (
            <div className="pos-new-vendor">
              <Input
                aria-label={`New Vendor Name for ${productName}`}
                onChange={(event) =>
                  setNewVendorName(event.target.value)
                }
                placeholder="Vendor name"
                value={newVendorName}
              />
              <Input
                aria-label={`New Vendor Phone for ${productName}`}
                onChange={(event) =>
                  setNewVendorPhone(event.target.value)
                }
                placeholder="Phone (optional)"
                value={newVendorPhone}
              />
              <Button
                disabled={
                  !newVendorName.trim() ||
                  createVendorMutation.isPending
                }
                onClick={() => createVendorMutation.mutate()}
                size="sm"
                type="button"
              >
                Save Vendor
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
