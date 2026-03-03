import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'oMapArchive',
  description: 'Archive and georeference your orienteering maps',
}

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

export default RootLayout
