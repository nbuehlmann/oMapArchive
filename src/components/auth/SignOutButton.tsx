'use client'

import { signOut } from 'next-auth/react'

export const SignOutButton = () => {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      Sign out
    </button>
  )
}
