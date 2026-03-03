import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = { title: 'Sign in — oMapArchive' }

const LoginPage = () => {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">oMapArchive</h1>
        <p className="text-sm text-muted-foreground">Sign in to access your map archive</p>
      </div>
      <LoginForm />
    </div>
  )
}

export default LoginPage
