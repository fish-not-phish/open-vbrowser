'use client'

/**
 * Authenticated app shell layout.
 * Wraps all main app pages (home, history, cases, workspaces, account)
 * with the collapsible sidebar + sticky topbar.
 *
 * Auth guard: if the user is not logged in, redirect to the Django allauth
 * login page. We check isLoggedIn === false (not just falsy) so we don't
 * redirect while the AuthContext is still loading.
 */
import { useEffect } from 'react'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app/app-sidebar'
import { useAuthContext } from '@/store/AuthContext'
import { baseUrlAccounts } from '@/constants/constants'
import { NotificationsProvider } from '@/store/NotificationsContext'
import { HalftoneBackground } from '@/components/ui/halftone-background'
import AppFooter from '@/components/app/app-footer'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext()

  useEffect(() => {
    if (user.isLoggedIn === false) {
      window.location.replace(
        `${baseUrlAccounts}accounts/login/?next=${encodeURIComponent(window.location.pathname)}`
      )
    }
  }, [user.isLoggedIn])

  // Don't render the shell until we know the user is authenticated
  if (user.isLoggedIn !== true) return null

  return (
    <NotificationsProvider>
    <HalftoneBackground
      background="#0d0d14"
      color="#CF728718"
      dotSpacing={18}
      maxRadius={5}
      speed={0.4}
      scale={0.8}
    />
    <div className="flex min-h-dvh w-full relative z-10 bg-transparent">
      <SidebarProvider>
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 bg-transparent">
          <header className="bg-card/80 backdrop-blur-sm sticky top-0 z-50 h-14 border-b">
            <div className="flex h-full items-center gap-4 px-4 sm:px-6">
              <SidebarTrigger className="[&_svg]:size-5!" />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 bg-transparent">
            {children}
          </main>
          <AppFooter />
        </div>
      </SidebarProvider>
    </div>
    </NotificationsProvider>
  )
}
