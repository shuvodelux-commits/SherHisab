import { Slot } from '@radix-ui/react-slot'
import { PanelLeft } from 'lucide-react'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Button } from './button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

interface SidebarContextValue {
  isMobile: boolean
  open: boolean
  openMobile: boolean
  closeMobile: () => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function readIsMobile() {
  return typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 640px)').matches
    : false
}

function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('Sidebar components must be used within SidebarProvider')
  }
  return context
}

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [openMobile, setOpenMobile] = useState(false)
  const [isMobile] = useState(readIsMobile)

  const value = useMemo<SidebarContextValue>(
    () => ({
      isMobile,
      open,
      openMobile,
      closeMobile: () => setOpenMobile(false),
      toggle: () => {
        if (isMobile) {
          setOpenMobile((current) => !current)
          return
        }
        setOpen((current) => !current)
      },
    }),
    [isMobile, open, openMobile],
  )

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider>
        <div
          className="ui-sidebar-provider"
          data-slot="sidebar-provider"
          data-state={open ? 'expanded' : 'collapsed'}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

export function Sidebar({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  const { isMobile, open, openMobile, closeMobile } = useSidebar()
  const state = open ? 'expanded' : 'collapsed'

  if (isMobile) {
    if (!openMobile) {
      return null
    }

    return (
      <div
        aria-label="Navigation menu"
        className="mobile-drawer"
        role="dialog"
      >
        <button
          aria-label="Dismiss navigation"
          className="mobile-drawer-backdrop"
          onClick={closeMobile}
          type="button"
        />
        <div className="mobile-drawer-panel">
          <button
            aria-label="Close navigation"
            className="mobile-drawer-close"
            onClick={closeMobile}
            type="button"
          >
            ×
          </button>
          <aside
            className={`ui-sidebar ui-sidebar-mobile ${className}`.trim()}
            data-slot="sidebar"
            data-state="expanded"
            {...props}
          >
            {children}
          </aside>
        </div>
      </div>
    )
  }

  return (
    <aside
      className={`ui-sidebar ${className}`.trim()}
      data-slot="sidebar"
      data-state={state}
      {...props}
    >
      {children}
    </aside>
  )
}

export function SidebarInset({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-sidebar-inset ${className}`.trim()}
      data-slot="sidebar-inset"
      {...props}
    />
  )
}

export function SidebarHeader({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-sidebar-header ${className}`.trim()}
      data-slot="sidebar-header"
      {...props}
    />
  )
}

export function SidebarContent({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-sidebar-content ${className}`.trim()}
      data-slot="sidebar-content"
      {...props}
    />
  )
}

export function SidebarGroup({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-sidebar-group ${className}`.trim()} {...props} />
}

export function SidebarGroupLabel({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-sidebar-group-label ${className}`.trim()}
      {...props}
    />
  )
}

export function SidebarGroupContent({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-sidebar-group-content ${className}`.trim()}
      {...props}
    />
  )
}

export function SidebarMenu({
  className = '',
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return <ul className={`ui-sidebar-menu ${className}`.trim()} {...props} />
}

export function SidebarMenuItem({
  className = '',
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return <li className={`ui-sidebar-menu-item ${className}`.trim()} {...props} />
}

interface SidebarMenuButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  tooltip?: string
}

export function SidebarMenuButton({
  asChild = false,
  className = '',
  tooltip,
  children,
  onClick,
  ...props
}: SidebarMenuButtonProps) {
  const { isMobile, open, closeMobile } = useSidebar()
  const Comp = asChild ? Slot : 'button'
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event as MouseEvent<HTMLButtonElement>)
    if (!event.defaultPrevented && isMobile) {
      closeMobile()
    }
  }
  const control = (
    <Comp
      className={`ui-sidebar-menu-button ${className}`.trim()}
      data-slot="sidebar-menu-button"
      onClick={handleClick}
      {...props}
    >
      {children}
    </Comp>
  )

  if (!tooltip || open || isMobile) {
    return control
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function SidebarTrigger({
  className = '',
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isMobile, toggle } = useSidebar()
  const label = isMobile ? 'Open navigation' : 'Toggle Sidebar'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          aria-label={label}
          className={`ui-sidebar-trigger ${className}`.trim()}
          onClick={(event) => {
            onClick?.(event)
            if (!event.defaultPrevented) {
              toggle()
            }
          }}
          size="icon-sm"
          variant="ghost"
        >
          <PanelLeft aria-hidden="true" size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isMobile ? 'Open navigation' : 'Toggle sidebar'}
      </TooltipContent>
    </Tooltip>
  )
}

export function SidebarRail({
  className = '',
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isMobile, toggle } = useSidebar()

  if (isMobile) {
    return null
  }

  return (
    <button
      {...props}
      aria-label="Toggle sidebar rail"
      className={`ui-sidebar-rail ${className}`.trim()}
      data-slot="sidebar-rail"
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          toggle()
        }
      }}
      type="button"
    />
  )
}
