'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/server/auth'

export const loginAction = async (
  _prev: string | null,
  formData: FormData,
): Promise<string | null> => {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/maps',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return 'Invalid email or password'
    }
    // Re-throw redirect errors — Next.js needs these to perform the redirect
    throw error
  }
  return null
}
