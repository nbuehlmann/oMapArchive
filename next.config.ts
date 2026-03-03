import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=()' },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'pdf2pic', 'ioredis', 'bullmq', 'geotiff', 'ocad2geojson'],
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
