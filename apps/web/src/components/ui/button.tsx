import {
  forwardRef,
  type ButtonHTMLAttributes,
} from 'react'

type ButtonVariant =
  | 'default'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'link'

type ButtonSize =
  | 'default'
  | 'xs'
  | 'sm'
  | 'lg'
  | 'icon'
  | 'icon-xs'
  | 'icon-sm'
  | 'icon-lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className = '',
      variant = 'default',
      size = 'default',
      type = 'button',
      ...props
    },
    ref,
  ) {
    return (
      <button
        className={`ui-button ui-button-${variant} ui-button-${size} ${className}`.trim()}
        data-slot="button"
        ref={ref}
        type={type}
        {...props}
      />
    )
  },
)
