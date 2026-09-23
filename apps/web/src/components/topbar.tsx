import { Search, UserRound } from 'lucide-react'
import { useLanguageMode } from '../app/language'
import { useThemeMode } from '../app/theme'
import { Button } from './ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { SidebarTrigger } from './ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip'

interface TopbarProps {
  pathname?: string
}

function pageMeta(pathname: string) {
  if (pathname.startsWith('/app/products')) {
    return { en: 'Products', bn: 'পণ্য ও স্টক' }
  }

  return { en: 'Dashboard', bn: 'আজকের অবস্থা' }
}
export function Topbar({ pathname = '/app' }: TopbarProps) {
  const { mode: languageMode, setMode: setLanguageMode } = useLanguageMode()
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode()
  const meta = pageMeta(pathname)

  return (
    <header className="topbar">
      <SidebarTrigger className="topbar-menu-button" />

      <div className="topbar-title">
        <strong lang={languageMode === 'bn' ? 'bn' : undefined}>
          {languageMode === 'bn' ? meta.bn : meta.en}
        </strong>
        {languageMode === 'en-bn' ? (
          <span lang="bn">{meta.bn}</span>
        ) : null}
      </div>

      <div className="topbar-actions">
        <Select
          onValueChange={(value) =>
            setLanguageMode(value as 'en-bn' | 'en' | 'bn')
          }
          value={languageMode}
        >
          <SelectTrigger aria-label="Language" className="topbar-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="en-bn">English + বাংলা</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="bn">বাংলা</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) =>
            setThemeMode(value as 'light' | 'dark' | 'system')
          }
          value={themeMode}
        >
          <SelectTrigger aria-label="Theme" className="topbar-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Search" size="icon-sm" variant="ghost">
              <Search aria-hidden="true" size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Search</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Account" size="icon-sm" variant="ghost">
              <UserRound aria-hidden="true" size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Account</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
