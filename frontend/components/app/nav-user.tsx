'use client'

import { useRouter } from 'next/navigation'
import {
  BadgeCheckIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuthContext } from '@/store/AuthContext'

function initials(first: string, last: string, email: string): string {
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
  }
  return email.charAt(0).toUpperCase()
}

export function NavUser() {
  const { isMobile } = useSidebar()
  const { user } = useAuthContext()
  const router = useRouter()

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.email ||
    'Account'
  const avatar = initials(user.first_name ?? '', user.last_name ?? '', user.email ?? '')

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs">{avatar}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start leading-tight min-w-0">
                <span className="text-sm font-medium truncate">{displayName}</span>
                <span className="text-xs text-sidebar-foreground/60 truncate">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4 shrink-0" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={isMobile ? 8 : 4}
            align="end"
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">{avatar}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push('/account/settings')}>
                <BadgeCheckIcon />
                Account Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/accounts/logout/" className="cursor-pointer text-destructive focus:text-destructive">
                <LogOutIcon />
                Log out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
