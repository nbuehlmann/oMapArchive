import { NextResponse } from 'next/server'
import { auth } from '@/server/auth'

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }
})

export const config = {
  // Protect all routes inside the authenticated app shell
  matcher: ['/(app)/:path*'],
}
