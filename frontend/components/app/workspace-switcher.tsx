'use client'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { ChevronRightIcon, PlusIcon, UserIcon, UsersIcon } from 'lucide-react'
import { useWorkspace } from '@/store/WorkspaceContext'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthContext } from '@/store/AuthContext'

export function WorkspaceSwitcher() {
  const { isMobile } = useSidebar()
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspace()
  const { user } = useAuthContext()
  const router = useRouter()
  const pathname = usePathname()

  function switchWorkspace(ws: typeof workspaces[number]) {
    setActiveWorkspace(ws)
    // Determine which section of the new workspace to navigate to
    const current = activeWorkspace
    if (!current) { router.push(`/${ws.uuid}`); return }
    if (pathname.startsWith(`/${current.uuid}/cases`)) {
      router.push(`/${ws.uuid}/cases`)
    } else if (pathname.startsWith(`/${current.uuid}/history`)) {
      router.push(`/${ws.uuid}/history`)
    } else {
      router.push(`/${ws.uuid}`)
    }
  }

  if (!activeWorkspace) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex size-8 items-center justify-center rounded-lg overflow-hidden shrink-0 bg-sidebar-primary text-sidebar-primary-foreground">
                {activeWorkspace.logo_url ? (
                  <img src={activeWorkspace.logo_url} alt={activeWorkspace.name} className="size-full object-cover" />
                ) : activeWorkspace.is_personal ? (
                  <UserIcon className="size-4" />
                ) : (
                  <UsersIcon className="size-4" />
                )}
              </div>
              <div className="flex flex-col items-start leading-tight group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium truncate max-w-[140px]">{activeWorkspace.name}</span>
                <span className="text-xs font-light text-sidebar-foreground/60">
                  {activeWorkspace.is_personal ? 'Personal' : 'Workspace'}
                </span>
              </div>
              <ChevronRightIcon className="ml-auto size-4 transition-transform duration-200 max-lg:rotate-90 [[data-state=open]>&]:rotate-270 lg:[[data-state=open]>&]:rotate-180 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={isMobile ? 8 : 16}
          >
            {workspaces.map((ws) => (
              <DropdownMenuCheckboxItem
                key={ws.id}
                className="gap-3 px-3 py-2.5 [&>span]:hidden"
                checked={activeWorkspace.id === ws.id}
                onCheckedChange={() => switchWorkspace(ws)}
              >
                <div className="flex size-8 items-center justify-center rounded-lg shrink-0 overflow-hidden bg-muted">
                  {ws.logo_url ? (
                    <img src={ws.logo_url} alt={ws.name} className="size-full object-cover" />
                  ) : ws.is_personal ? (
                    <UserIcon className="size-4" />
                  ) : (
                    <UsersIcon className="size-4" />
                  )}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">{ws.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {ws.is_personal ? 'Personal' : `${ws.member_count} member${ws.member_count === 1 ? '' : 's'}`}
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
            ))}
            {user.canCreateWorkspaces && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="bg-primary/10 text-primary mt-1 justify-center cursor-pointer"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-create-workspace'))}
                >
                  <span>New Workspace</span>
                  <PlusIcon className="text-primary" />
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
