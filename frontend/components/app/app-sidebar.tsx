'use client'

import { type ReactElement, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  MonitorIcon,
  HistoryIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  SettingsIcon,
  UsersIcon,
  Settings2Icon,
} from 'lucide-react'
import { WorkspaceSwitcher } from './workspace-switcher'
import { NavUser } from './nav-user'
import { NotificationBell } from './notification-bell'
import { useAuthContext } from '@/store/AuthContext'
import { BellIcon } from 'lucide-react'
import { useWorkspace } from '@/store/WorkspaceContext'
import { workspacesApi } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// ─── Menu shape ───────────────────────────────────────────────────────────────

type MenuSubItem = { label: string; href: string; badge?: string }

type MenuItem = {
  icon: ReactElement
  label: string
} & (
  | { href: string; badge?: string; items?: never }
  | { href?: never; badge?: never; items: MenuSubItem[] }
)

// ─── Static nav items ─────────────────────────────────────────────────────────

// mainItems is now empty — Launch App is rendered dynamically in WorkspaceSection
const mainItems: MenuItem[] = []

const adminItems: MenuItem[] = [
  { icon: <SettingsIcon />, label: 'Site Settings', href: '/admin/settings' },
  { icon: <UsersIcon />, label: 'Users', href: '/admin/users' },
]

// ─── Reusable grouped section ─────────────────────────────────────────────────

function SidebarGroupedMenuItems({ data, groupLabel }: { data: MenuItem[]; groupLabel?: string }) {
  return (
    <SidebarGroup>
      {groupLabel && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {data.map((item) =>
            item.items ? (
              <Collapsible className="group/collapsible" key={item.label}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.label} className="truncate">
                      {item.icon}
                      <span>{item.label}</span>
                      <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((sub) => (
                        <SidebarMenuSubItem key={sub.label}>
                          <SidebarMenuSubButton className="justify-between" asChild>
                            <a href={sub.href}>
                              {sub.label}
                              {sub.badge && (
                                <span className="bg-primary/10 flex h-5 min-w-5 items-center justify-center rounded-full text-xs">
                                  {sub.badge}
                                </span>
                              )}
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ) : (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton tooltip={item.label} asChild>
                  <a href={item.href}>
                    {item.icon}
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
                {item.badge && (
                  <SidebarMenuBadge className="bg-primary/10 top-1/2! right-2 -translate-y-1/2! rounded-full">
                    {item.badge}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// ─── Workspace section ────────────────────────────────────────────────────────

function WorkspaceSection() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuthContext()
  const { activeWorkspace, addWorkspace } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const open = () => { if (user.canCreateWorkspaces) setCreating(true) }
    window.addEventListener('open-create-workspace', open)
    return () => window.removeEventListener('open-create-workspace', open)
  }, [user.canCreateWorkspaces])

  async function create() {
    if (!user.csrfToken || !newName || !newSlug) return
    setSaving(true)
    try {
      const ws = await workspacesApi.create({ name: newName, slug: newSlug }, user.csrfToken)
      addWorkspace(ws)
      setCreating(false)
      setNewName('')
      setNewSlug('')
      toast.success('Workspace created')
      router.push(`/${ws.uuid}/settings`)
    } catch (e: any) {
      toast.error(e?.message?.includes('409') ? 'Slug already in use' : 'Failed to create workspace')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Launch App" asChild
                isActive={activeWorkspace ? pathname === `/${activeWorkspace.uuid}` : false}>
                <a href={activeWorkspace ? `/${activeWorkspace.uuid}` : '/'}>
                  <MonitorIcon /><span>Launch App</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="History" asChild
                isActive={activeWorkspace ? pathname.startsWith(`/${activeWorkspace.uuid}/history`) : false}>
                <a href={activeWorkspace ? `/${activeWorkspace.uuid}/history` : '#'}>
                  <HistoryIcon /><span>History</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Cases" asChild
                isActive={activeWorkspace ? pathname.startsWith(`/${activeWorkspace.uuid}/cases`) : false}>
                <a href={activeWorkspace ? `/${activeWorkspace.uuid}/cases` : '#'}>
                  <FolderOpenIcon /><span>Cases</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {activeWorkspace && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Settings"
                  asChild
                  isActive={pathname.startsWith(`/${activeWorkspace.uuid}/settings`) || pathname === '/workspaces/settings'}
                >
                  <a href={`/${activeWorkspace.uuid}/settings`}>
                    <Settings2Icon /><span>Settings</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Workspace</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="My Team"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={!newName || !newSlug || saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── AppSidebar ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { user } = useAuthContext()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NotificationBell />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <WorkspaceSection />
        {user.isAdmin && (
          <SidebarGroupedMenuItems data={adminItems} groupLabel="Admin" />
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
