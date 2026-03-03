import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Azure Blob Storage — optional; omit for local filesystem fallback in dev
  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),
  AZURE_STORAGE_SAS_TOKEN: z.string().optional(),
})

export const env = envSchema.parse(process.env)
