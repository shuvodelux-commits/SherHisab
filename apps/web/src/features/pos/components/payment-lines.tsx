import { Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import type {
  PosBootstrapDto,
  PosPaymentLineDraft,
  PosPaymentMethod,
} from '../pos-types'

interface PaymentLinesProps {
  accounts: PosBootstrapDto['financialAccounts']
  lines: PosPaymentLineDraft[]
  onAdd: () => void
  onChange: (
    clientLineId: string,
    patch: Partial<PosPaymentLineDraft>,
  ) => void
  onRemove: (clientLineId: string) => void
}

function accountType(
  method: PosPaymentMethod,
): 'BANK' | 'MOBILE_BANKING' | null {
  if (method === 'BANK') {
    return 'BANK'
  }
  if (method === 'MOBILE_BANKING') {
    return 'MOBILE_BANKING'
  }
  return null
}

export function PaymentLines({
  accounts,
  lines,
  onAdd,
  onChange,
  onRemove,
}: PaymentLinesProps) {
  return (
    <section className="pos-payment-lines">
      <div className="pos-payment-heading">
        <strong>Payments</strong>
        <Button
          onClick={onAdd}
          size="sm"
          type="button"
          variant="outline"
        >
          + Add Payment
        </Button>
      </div>

      <div className="pos-payment-list">
        {lines.map((line, index) => {
          const number = index + 1
          const requiredAccountType = accountType(line.method)
          const availableAccounts = requiredAccountType
            ? accounts.filter(
                (account) =>
                  account.isActive &&
                  account.type === requiredAccountType,
              )
            : []

          return (
            <div className="pos-payment-row" key={line.clientLineId}>
              <Select
                onValueChange={(value) =>
                  onChange(line.clientLineId, {
                    method: value as PosPaymentMethod,
                    accountId: null,
                  })
                }
                value={line.method}
              >
                <SelectTrigger
                  aria-label={`Payment method ${number}`}
                  className="pos-payment-method"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                    <SelectItem value="MOBILE_BANKING">
                      Mobile Banking
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              {requiredAccountType ? (
                <Select
                  onValueChange={(value) =>
                    onChange(line.clientLineId, {
                      accountId: value,
                    })
                  }
                  value={line.accountId ?? undefined}
                >
                  <SelectTrigger
                    aria-label={`Payment account ${number}`}
                    className="pos-payment-account"
                  >
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {availableAccounts.map((account) => (
                        <SelectItem
                          key={account.id}
                          value={account.id}
                        >
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : null}

              <Input
                aria-label={`Payment amount ${number}`}
                className="pos-payment-amount"
                inputMode="decimal"
                onChange={(event) =>
                  onChange(line.clientLineId, {
                    amountInput: event.target.value,
                  })
                }
                placeholder="0.00"
                value={line.amountInput}
              />

              {lines.length > 1 ? (
                <Button
                  aria-label={`Remove payment ${number}`}
                  onClick={() => onRemove(line.clientLineId)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
