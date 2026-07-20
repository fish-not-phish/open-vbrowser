'use client'

import { useEffect } from 'react'
import { baseUrlAccounts } from '@/constants/constants'

export default function SignupPage() {
  useEffect(() => {
    window.location.replace(`${baseUrlAccounts}accounts/signup/`)
  }, [])

  return null
}
