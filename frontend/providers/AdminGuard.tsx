// providers/AdminGuard.tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/store/AuthContext"
import { Spinner } from "@/components/ui/spinner"

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext()
  const router = useRouter()

  useEffect(() => {
    if (!user.isLoading) {
      if (!user.isLoggedIn) {
        router.replace("/login")
      } else if (!user.isAdmin) {
        router.replace("/") // or /unauthorized
      }
    }
  }, [user, router])

  if (user.isLoading) {
    return (
      <div className="h-[100dvh] w-full flex justify-center items-center">
        <Spinner />
      </div>
    )
  }

  if (!user.isLoggedIn || !user.isAdmin) {
    return null
  }

  return <>{children}</>
}
