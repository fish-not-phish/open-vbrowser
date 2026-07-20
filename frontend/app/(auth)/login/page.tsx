'use client'

import { useEffect } from 'react'
import { baseUrlAccounts } from '@/constants/constants'

export default function LoginPage() {
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next') ?? '/'
    window.location.replace(
      `${baseUrlAccounts}accounts/login/?next=${encodeURIComponent(next)}`
    )
  }, [])

  return null
}
