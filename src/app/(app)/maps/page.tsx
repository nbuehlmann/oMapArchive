import type { Metadata } from 'next'
import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { maps } from '@/server/db/schema'
import { MapCard } from '@/components/maps/MapCard'
import { MapsEmptyState } from '@/components/maps/MapsEmptyState'

export const metadata: Metadata = { title: 'My Maps — oMapArchive' }

const MapsPage = async () => {
  const session = await auth()
  // session is guaranteed non-null by the layout guard, but narrowing for TS
  if (!session?.user?.id) return null

  const userMaps = await db
    .select()
    .from(maps)
    .where(eq(maps.userId, session.user.id))
    .orderBy(desc(maps.uploadedAt))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Maps</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {userMaps.length === 1 ? '1 map' : `${userMaps.length} maps`}
          </p>
        </div>
        <Link
          href="/maps/upload"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring transition-opacity"
        >
          Upload map
        </Link>
      </div>

      {userMaps.length === 0 ? (
        <MapsEmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {userMaps.map((map) => (
            <MapCard key={map.id} map={map} />
          ))}
        </div>
      )}
    </div>
  )
}

export default MapsPage
