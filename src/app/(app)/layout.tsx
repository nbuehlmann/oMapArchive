import { redirect } from 'next/navigation'
import { auth } from '@/server/auth'
import { SignOutButton } from '@/components/auth/SignOutButton'

const AppLayout = async ({ children }: { children: React.ReactNode }) => {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-3">
        <nav className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="font-semibold tracking-tight">oMapArchive</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{session.user.email}</span>
            <SignOutButton />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}

export default AppLayout
