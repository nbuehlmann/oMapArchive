import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'oMapArchive' }

const HomePage = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="space-y-6 max-w-lg">
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-tight">oMapArchive</h1>
          <p className="text-lg text-muted-foreground">
            Archive, georeference, and relive your orienteering maps.
          </p>
        </div>

        <Link
          href="/login"
          className="inline-block rounded-md bg-primary px-8 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring transition-opacity"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}

export default HomePage
