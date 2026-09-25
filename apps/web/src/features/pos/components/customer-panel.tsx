import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { formatPaisaToTaka } from '../../../lib/money'
import { searchPosCustomers } from '../pos-api'
import type { PosCustomerSearchDto } from '../pos-types'

export interface PosCustomerDraft {
  selectedCustomerId: string | null
  selectedCustomerCode: string | null
  name: string
  phone: string
  guardianName: string
  address: string
  balancePaisa: string | null
}

interface CustomerPanelProps {
  value: PosCustomerDraft
  onChange: (next: PosCustomerDraft) => void
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('8801')) {
    return `0${digits.slice(3)}`
  }
  return digits
}

function hasValidSalesHistoryPhone(raw: string): boolean {
  const phone = normalizePhone(raw)
  return /^01\d{9}$/.test(phone)
}

function balanceLabel(balancePaisa: string): string {
  const balance = BigInt(balancePaisa)
  if (balance > 0n) {
    return `Outstanding Due ৳${formatPaisaToTaka(balance.toString())}`
  }
  if (balance < 0n) {
    return `Customer Credit ৳${formatPaisaToTaka((-balance).toString())}`
  }
  return 'Balance ৳0.00'
}

export function CustomerPanel({
  value,
  onChange,
}: CustomerPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [searchField, setSearchField] = useState<
    'name' | 'phone' | null
  >(null)

  const queryValue =
    searchField === 'name'
      ? value.name.trim()
      : searchField === 'phone'
        ? value.phone.trim()
        : ''

  const customersQuery = useQuery({
    queryKey: ['pos-customers', searchField, queryValue],
    queryFn: () => searchPosCustomers(queryValue, 20),
    enabled: queryValue.length > 0,
  })

  const clearSelection = (
    next: Pick<PosCustomerDraft, 'name' | 'phone'>,
  ): PosCustomerDraft => ({
    ...value,
    ...next,
    selectedCustomerId: null,
    selectedCustomerCode: null,
    balancePaisa: null,
  })

  function selectCustomer(customer: PosCustomerSearchDto) {
    onChange({
      selectedCustomerId: customer.id,
      selectedCustomerCode: customer.customerCode,
      name: customer.name,
      phone: customer.phone,
      guardianName: customer.guardianName,
      address: customer.address,
      balancePaisa: customer.balancePaisa,
    })
    setSearchField(null)
  }

  return (
    <section className="pos-customer-panel">
      <div className="pos-customer-grid">
        <div className="pos-customer-field">
          <Input
            aria-label="Customer Name"
            autoComplete="off"
            onChange={(event) => {
              onChange(
                clearSelection({
                  name: event.target.value,
                  phone: value.phone,
                }),
              )
              setSearchField('name')
            }}
            placeholder="Customer name — কাস্টমারের নাম"
            value={value.name}
          />
        </div>
        <div className="pos-customer-field">
          <Input
            aria-label="Customer Phone"
            autoComplete="off"
            inputMode="tel"
            onChange={(event) => {
              onChange(
                clearSelection({
                  name: value.name,
                  phone: event.target.value,
                }),
              )
              setSearchField('phone')
            }}
            placeholder="Phone number — ফোন নম্বর"
            value={value.phone}
          />
        </div>
      </div>

      {queryValue && searchField ? (
        <div className="pos-customer-results">
          {customersQuery.isPending ? (
            <span className="pos-muted">Searching Customers…</span>
          ) : customersQuery.isError ? (
            <span className="pos-error" role="alert">
              {customersQuery.error.message}
            </span>
          ) : (
            (customersQuery.data ?? []).map((customer) => (
              <Button
                aria-label={`Select ${customer.name}`}
                className="pos-customer-result"
                key={customer.id}
                onClick={() => selectCustomer(customer)}
                size="sm"
                type="button"
                variant="outline"
              >
                <span>{customer.name}</span>
                <span>{customer.phone}</span>
              </Button>
            ))
          )}
        </div>
      ) : null}

      <div className="pos-customer-meta">
        {value.selectedCustomerId && value.selectedCustomerCode ? (
          <Badge variant="secondary">
            Selected {value.selectedCustomerCode}
          </Badge>
        ) : null}
        {value.balancePaisa !== null ? (
          <span className="pos-customer-balance">
            {balanceLabel(value.balancePaisa)}
          </span>
        ) : null}
      </div>

      <div className="pos-customer-actions">
        <Button
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
          size="sm"
          type="button"
          variant="ghost"
        >
          More customer details
        </Button>
        <Button
          disabled={
            !value.selectedCustomerId &&
            !hasValidSalesHistoryPhone(value.phone)
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Sales History
        </Button>
      </div>

      {detailsOpen ? (
        <div className="pos-customer-extra">
          <Input
            aria-label="Customer Guardian"
            onChange={(event) =>
              onChange({
                ...value,
                guardianName: event.target.value,
              })
            }
            placeholder="Guardian — অভিভাবক"
            value={value.guardianName}
          />
          <Input
            aria-label="Customer Address"
            onChange={(event) =>
              onChange({
                ...value,
                address: event.target.value,
              })
            }
            placeholder="Address — ঠিকানা"
            value={value.address}
          />
        </div>
      ) : null}
    </section>
  )
}
