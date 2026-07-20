'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { workspacesApi, type Workspace } from '@/lib/api'
import { useAuthContext } from './AuthContext'

const LS_KEY = 'ovb_active_workspace_uuid'

function readStoredUuid(): string | null {
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

function writeStoredUuid(uuid: string | null) {
  try {
    if (uuid) localStorage.setItem(LS_KEY, uuid)
    else localStorage.removeItem(LS_KEY)
  } catch {}
}

interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  setActiveWorkspace: (ws: Workspace) => void
  reload: () => Promise<void>
  addWorkspace: (ws: Workspace) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  reload: async () => {},
  addWorkspace: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext()
  const router = useRouter()
  const pathname = usePathname()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null)

  // Wrap setter so every explicit selection is persisted immediately
  const setActiveWorkspace = useCallback((ws: Workspace) => {
    writeStoredUuid(ws.uuid)
    setActiveWorkspaceState(ws)
  }, [])

  const reload = useCallback(async () => {
    if (!user.isLoggedIn) return
    try {
      const ws = await workspacesApi.list()
      setWorkspaces(ws)

      // If the user has no workspaces and personal workspaces are disabled,
      // send them to the contact-admin page (unless already there or admin).
      if (ws.length === 0 && !user.personalWorkspacesEnabled && !user.isAdmin) {
        if (pathname !== '/no-workspace') {
          router.replace('/no-workspace')
        }
        return
      }

      // If they were on the no-workspace page but now have workspaces, redirect away.
      if (ws.length > 0 && pathname === '/no-workspace') {
        router.replace('/')
      }

      // If the user is currently on a workspace URL that is no longer accessible
      // (e.g. a personal workspace when allow_personal_workspaces was just disabled),
      // redirect them to a valid workspace or the no-workspace page.
      const uuidInPath = pathname.match(/^\/([0-9a-f-]{36})(\/|$)/)?.[1]
      if (uuidInPath && !ws.find((w) => w.uuid === uuidInPath)) {
        const fallback = ws[0]
        if (fallback) {
          // Preserve the sub-path (e.g. /settings, /history, /cases)
          const subPath = pathname.replace(`/${uuidInPath}`, '') || '/'
          router.replace(`/${fallback.uuid}${subPath}`)
        } else {
          router.replace('/no-workspace')
        }
        return
      }

      setActiveWorkspaceState((prev) => {
        // 1. Keep the in-memory selection if it's still valid
        if (prev) {
          const still = ws.find((w) => w.id === prev.id)
          if (still) return still
        }
        // 2. Try to restore from localStorage (skip if it points to an inaccessible workspace)
        const storedUuid = readStoredUuid()
        if (storedUuid) {
          const stored = ws.find((w) => w.uuid === storedUuid)
          if (stored) return stored
          // Stored UUID is no longer accessible — clear it
          writeStoredUuid(null)
        }
        // 3. Fall back to personal workspace, then first available
        return ws.find((w) => w.is_personal) ?? ws[0] ?? null
      })
    } catch {}
  }, [user.isLoggedIn, user.personalWorkspacesEnabled, user.isAdmin, pathname, router])

  useEffect(() => {
    reload()
  }, [reload])

  function addWorkspace(ws: Workspace) {
    setWorkspaces((prev) => [...prev, ws])
    setActiveWorkspace(ws)
  }

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, setActiveWorkspace, reload, addWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
