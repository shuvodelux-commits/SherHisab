import {
  forwardRef,
  type ButtonHTMLAttributes,
} from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'small' | 'normal' | 'large'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className = '',
      variant = 'secondary',
      size = 'normal',
      type = 'button',
      ...props
    },
    ref,
  ) {
    return (
      <button
        className={`ui-button ui-button-${variant} ui-button-${size} ${className}`.trim()}
        ref={ref}
        type={type}
        {...props}
      />
    )
  },
)
