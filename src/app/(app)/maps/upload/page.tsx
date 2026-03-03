import type { Metadata } from 'next'
import { UploadMapForm } from '@/components/maps/UploadMapForm'

export const metadata: Metadata = { title: 'Upload map — oMapArchive' }

const UploadMapPage = () => {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload map</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a new orienteering map to your archive.
        </p>
      </div>
      <UploadMapForm />
    </div>
  )
}

export default UploadMapPage
