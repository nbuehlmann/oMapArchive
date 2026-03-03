const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      {children}
    </div>
  )
}

export default AuthLayout
