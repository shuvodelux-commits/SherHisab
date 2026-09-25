import {
  useEffect,
  useRef,
  useState,
} from 'react'
import { Eye } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { formatPaisaToTaka } from '../../../lib/money'

interface CostRevealProps {
  productName: string
  purchasePricePaisa?: string
}

export function CostReveal({
  productName,
  purchasePricePaisa,
}: CostRevealProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    },
    [],
  )

  if (purchasePricePaisa === undefined) {
    return null
  }

  function reveal() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    setVisible(true)
    timeoutRef.current = setTimeout(() => {
      setVisible(false)
      timeoutRef.current = null
    }, 500)
  }

  return (
    <span className="pos-cost-reveal">
      <Button
        aria-label={`Show purchase price for ${productName}`}
        onClick={reveal}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <Eye aria-hidden="true" />
      </Button>
      {visible ? (
        <span className="pos-cost-reveal-value">
          Purchase Price ৳{formatPaisaToTaka(purchasePricePaisa)}
        </span>
      ) : null}
    </span>
  )
}
