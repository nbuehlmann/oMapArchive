# SECURITY.md — oMapArchive

Security guidance specific to the oMapArchive architecture (Next.js 15 + PostgreSQL/PostGIS +
Azure Blob Storage + BullMQ on Azure). Every rule in this document is grounded in a concrete
threat relevant to this codebase. See [ARCHITECTURE.md](./ARCHITECTURE.md) for system context.

---

## Table of contents

1. [Security model & trust boundaries](#1-security-model--trust-boundaries)
2. [Authentication & session management](#2-authentication--session-management)
3. [Authorization & access control](#3-authorization--access-control)
4. [Input validation & output encoding](#4-input-validation--output-encoding)
5. [File upload security](#5-file-upload-security)
6. [HTTP security headers & CSP](#6-http-security-headers--csp)
7. [API security](#7-api-security)
8. [Database security](#8-database-security)
9. [File storage security](#9-file-storage-security)
10. [Secrets management](#10-secrets-management)
11. [Transport security](#11-transport-security)
12. [Rate limiting & DoS protection](#12-rate-limiting--dos-protection)
13. [Dependency security](#13-dependency-security)
14. [Logging & monitoring](#14-logging--monitoring)
15. [Azure cloud security](#15-azure-cloud-security)
16. [Pre-merge security checklist](#16-pre-merge-security-checklist)
17. [Incident response](#17-incident-response)

---

## 1. Security model & trust boundaries

### Trust zones

```
──────────────────────────────────────────────────────────────────
UNTRUSTED (internet)
  ├── Authenticated users (session-verified)
  │     Trust level: medium — own resources only
  ├── Public share link viewers (no auth)
  │     Trust level: low — read-only, single resource
  └── Anonymous visitors
        Trust level: zero — auth pages only
──────────────────────────────────────────────────────────────────
TRUSTED (server-side only)
  ├── Next.js server process
  ├── BullMQ worker
  └── Azure internal services (DB, Redis, Blob)
──────────────────────────────────────────────────────────────────
```

### Core threat model

| Threat | Attack vector | Primary control |
|---|---|---|
| Unauthorised data access | Bypassing auth middleware | Per-resource ownership check in every query |
| Account takeover | Credential stuffing, brute force | Rate limiting + bcrypt cost factor |
| Malicious file upload | Crafted PDF/OCAD/GeoTIFF/GPX | Magic-byte validation + size limits + sandboxed processing |
| Data exfiltration via IDOR | Guessing map/entry UUIDs | Ownership check on every DB query |
| XSS via rich text notes | TipTap HTML output | Server-side sanitisation before render |
| SQL injection via PostGIS | Raw SQL with user input | Parameterised `sql` tag only; no concatenation |
| Share token enumeration | Scanning UUID space | 128-bit UUID entropy + rate limiting |
| Secrets leakage | Logs, error messages, client bundle | Structured logging rules; env validation |
| Supply chain compromise | Malicious npm package update | pnpm lockfile + `pnpm audit` in CI |
| Cloud misconfiguration | Public DB, open Redis | Private endpoints; no public access |

---

## 2. Authentication & session management

### Password hashing

Use bcrypt with a cost factor of **12** (≥ 12 is required; increase as hardware improves):

```typescript
// src/server/auth/password.ts
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

export const hashPassword = (plaintext: string) =>
  bcrypt.hash(plaintext, BCRYPT_ROUNDS)

export const verifyPassword = (plaintext: string, hash: string) =>
  bcrypt.compare(plaintext, hash)
```

Never use MD5, SHA-1/256, or unsalted hashing for passwords. Never log plaintext passwords
at any log level.

### Password policy

Enforce at registration and password change:

- Minimum 12 characters
- No maximum length restriction (bcrypt prehash handles length; use a 72-byte server-side trim)
- Check against [HaveIBeenPwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords)
  using the k-anonymity model (send only the first 5 hex chars of the SHA-1 hash)

```typescript
// src/server/auth/pwned.ts
export const isPasswordPwned = async (password: string): Promise<boolean> => {
  const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true' },
  })
  const text = await res.text()
  return text.split('\r\n').some(line => line.startsWith(suffix))
}
```

### Session cookie configuration

Auth.js v5 must be configured with the following cookie options:

```typescript
// src/server/auth/index.ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 days
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,      // Inaccessible to JavaScript
        secure: true,        // HTTPS only — always true in production
        sameSite: 'lax',     // CSRF mitigation; lax allows top-level navigation
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      },
    },
  },
  // ...
})
```

Do not use `sameSite: 'none'` unless a specific cross-origin use case demands it (none exists
in this architecture).

### Account lockout

After 5 consecutive failed login attempts for the same email, lock the account for 15 minutes.
Track failures in Redis to survive process restarts:

```typescript
// src/server/auth/lockout.ts
const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 15 * 60

export const recordFailedAttempt = async (redis: Redis, email: string) => {
  const key = `lockout:${email}`
  const attempts = await redis.incr(key)
  if (attempts === 1) await redis.expire(key, LOCKOUT_SECONDS)
  return attempts
}

export const isLockedOut = async (redis: Redis, email: string) => {
  const attempts = await redis.get(`lockout:${email}`)
  return Number(attempts) >= MAX_ATTEMPTS
}

export const clearLockout = (redis: Redis, email: string) =>
  redis.del(`lockout:${email}`)
```

Clear the counter on successful login.

### Registration

- Validate email format (Zod `z.string().email()`)
- Check for duplicate email with a timing-safe response (return the same generic success
  message whether the email exists or not, to prevent user enumeration)
- Send an email verification link before activating the account

### Session invalidation

- On password change: invalidate all existing sessions for that user
- On explicit logout: delete the session record from the DB / invalidate the JWT
- Implement a `sessions` table or JWT version counter in `users` to allow server-side
  invalidation even for JWT-based sessions

---

## 3. Authorization & access control

### The golden rule

**Every server-side operation that touches user data must verify ownership.** Never rely on
the client to pass the correct `userId`. Extract the user from the verified session only.

```typescript
// ✅ Correct — userId comes from verified session
export const mapsRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ mapId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const map = await ctx.db
        .select()
        .from(maps)
        .where(
          and(
            eq(maps.id, input.mapId),
            eq(maps.userId, ctx.session.user.id), // ← ownership enforced here
          ),
        )
        .then(r => r[0] ?? null)

      if (!map) throw new TRPCError({ code: 'NOT_FOUND' })
      return map
    }),
})

// ❌ Wrong — trusting userId from the client
.query(async ({ ctx, input }) => {
  return ctx.db.select().from(maps).where(eq(maps.id, input.mapId))
  // If input.mapId belongs to another user, it will be returned — IDOR!
})
```

### Middleware layer

`src/middleware.ts` must protect all routes under `/(app)/`:

```typescript
export { auth as middleware } from '@/server/auth'

export const config = {
  matcher: [
    '/(app)/:path*',    // All authenticated app pages
    '/api/trpc/:path*', // All tRPC routes (protectedProcedure handles this internally too)
    '/api/upload',      // Upload endpoint
  ],
}
```

The `/share/[token]` route and `/api/trpc` routes using `publicProcedure` are deliberately
excluded. All other routes must be inside the protected matcher.

### Server Component auth guard

Every `layout.tsx` inside `/(app)/` must verify the session server-side and redirect if absent:

```typescript
// src/app/(app)/layout.tsx
import { auth } from '@/server/auth'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  return <>{children}</>
}
```

Do not rely solely on middleware — defence in depth requires the layout-level check too.

### Public share route

The `/share/[token]` route must:
1. Look up the token in the DB — never derive anything from the token itself
2. Verify `isPublic === true` on the map record
3. Return only the map's public fields (title, image URL) — no userId, no email, no other maps
4. Be strictly read-only — no tRPC mutations available on this route
5. Return a generic 404 for both "token not found" and "map not public" to prevent
   leaking whether a token is valid

```typescript
// src/app/share/[token]/page.tsx
const SharePage = async ({ params }: { params: { token: string } }) => {
  const map = await db
    .select({
      title: maps.title,
      processedUrl: maps.processedUrl,
      tileBaseUrl: maps.tileBaseUrl,
    })
    .from(maps)
    .where(and(eq(maps.shareToken, params.token), eq(maps.isPublic, true)))
    .then(r => r[0] ?? null)

  if (!map) notFound() // Never reveal why — same response for invalid token and non-public map
  return <ShareViewer map={map} />
}
```

### Competition entries cross-user access

Competition entries are strictly private. There is no sharing mechanism for entries.
Always filter by `userId` in every query, including when joining to maps.

---

## 4. Input validation & output encoding

### Validate all inputs at the server boundary

Every tRPC procedure, Server Action, and API route must validate its inputs with Zod before
any business logic runs. Trust no client-supplied data.

```typescript
// ✅ Validated input
.input(
  z.object({
    title: z.string().min(1).max(200).trim(),
    eventDate: z.string().date(),                 // ISO date string
    courseLength: z.number().min(0).max(100),     // km — realistic bounds
    mapId: z.string().uuid().optional(),
  })
)

// Validate coordinate ranges for georef control points
const controlPointSchema = z.object({
  mapX: z.number().min(0).max(100_000),
  mapY: z.number().min(0).max(100_000),
  lng:  z.number().min(-180).max(180),
  lat:  z.number().min(-90).max(90),
})
```

Apply semantic validation (realistic value ranges, coordinate bounds) not just type checking.

### TipTap rich text — sanitise before rendering

TipTap stores a JSON document (ProseMirror schema). When rendering notes as HTML, **never
render raw HTML from the DB** without sanitisation. Use DOMPurify server-side:

```typescript
// src/server/sanitise.ts
import { generateHTML } from '@tiptap/html'
import { StarterKit } from '@tiptap/starter-kit'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window as unknown as Window)

const ALLOWED_TAGS = ['p','strong','em','ul','ol','li','h2','h3','blockquote','code','pre','br','hr']
const ALLOWED_ATTR: string[] = [] // no href, no src, no event handlers

export const sanitiseNotes = (tiptapJson: unknown): string => {
  const html = generateHTML(tiptapJson as object, [StarterKit])
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
```

Never use `dangerouslySetInnerHTML` without running output through this function first.

### GPX file content validation

After parsing GPX with `@tmcw/togeojson`, validate the resulting GeoJSON before storing:

- Coordinate counts: reject traces with > 50,000 points (DoS via rendering)
- Coordinate bounds: all lat/lng must be within ±90 / ±180
- No inline `<script>` or other executable content (XML parser should strip, but validate)

### Filenames

Never trust uploaded filenames. Generate a new UUID-based key for blob storage:

```typescript
// ✅ Safe blob path
const blobKey = `originals/${session.user.id}/${crypto.randomUUID()}/${crypto.randomUUID()}`

// ❌ Never use the original filename in the path
const blobKey = `originals/${session.user.id}/${file.name}` // path traversal, XSS in content-disposition
```

Strip or reject filenames with path traversal characters (`..`, `/`, `\`) before logging them.

---

## 5. File upload security

### Allowed types — validate by content, not extension

Extensions are trivially spoofed. Validate by reading the file's magic bytes server-side:

```typescript
// src/server/processing/validate-upload.ts
import { fileTypeFromBuffer } from 'file-type'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/tiff',          // GeoTIFF
  'application/pdf',
  'application/octet-stream', // OCAD/OOM — no standard MIME; validate by extension after magic check
])

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.pdf', '.ocd', '.oom'])

export const validateUpload = async (buffer: Buffer, originalName: string): Promise<void> => {
  const type = await fileTypeFromBuffer(buffer)
  const ext = path.extname(originalName).toLowerCase()

  if (!type || !ALLOWED_MIME_TYPES.has(type.mime)) {
    throw new Error('Unsupported file type')
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Unsupported file extension')
  }
}
```

### File size limits

Enforce limits at multiple layers:

| Format | Max size | Rationale |
|---|---|---|
| JPEG / PNG | 100 MB | Scanned maps at 600 DPI |
| PDF | 50 MB | Multi-page competition maps |
| GeoTIFF | 500 MB | Full-resolution aerial rasters |
| OCAD / OOM | 20 MB | Vector map files are small |
| GPX trace | 5 MB | GPS tracks are tiny |

Set `maxFileSize` in the upload route before reading the body:

```typescript
// src/app/api/upload/route.ts
export const maxDuration = 60 // seconds — Next.js edge limit

// Reject oversized requests before buffering the body
const contentLength = request.headers.get('content-length')
if (contentLength && parseInt(contentLength) > 500 * 1024 * 1024) {
  return new Response('File too large', { status: 413 })
}
```

Also set `body-size-limit` in `next.config.ts` for the upload route.

### Malicious file content

Complex parsers (PDF, OCAD, GeoTIFF, GPX/XML) are common attack surfaces:

| File type | Risk | Mitigation |
|---|---|---|
| PDF | Embedded JavaScript, shellcode via parser CVEs | Use pdf2pic (poppler-based); disable JS; run in worker with resource limits |
| OCAD/OOM | Malformed binary triggering parser crashes or overflows | Pin `ocad2geojson` version; wrap in try/catch; set processing timeout |
| GeoTIFF | Extremely large decompressed size (zip bomb equivalent) | Limit decompressed dimensions before processing with gdal-js |
| GPX/XML | XXE (XML External Entities), billion laughs attack | Use a hardened XML parser with entity expansion disabled |
| PNG/JPEG | Pixel-flood attacks via malformed headers | Pin `sharp` version; set max dimension limits |

Worker-level resource limits for the BullMQ job:

```typescript
// src/server/processing/worker.ts
const JOB_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes max per job

worker.on('active', job => {
  job.updateProgress(0) // start heartbeat
  setTimeout(() => {
    if (!job.isCompleted()) job.moveToFailed(new Error('Processing timeout'), '0')
  }, JOB_TIMEOUT_MS)
})
```

### Upload to Blob before processing

Always write the raw upload to Azure Blob Storage **before** passing it to any parser.
This ensures that:
1. The file is durably stored even if processing fails
2. Processing operates on a copy, not the original stream
3. You can re-process without re-uploading if a parser is patched

---

## 6. HTTP security headers & CSP

Add the following headers in `next.config.ts`. The CSP is the most critical header for this
application due to MapLibre GL JS (WebGL + Web Workers) and TipTap.

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY', // This app is never embedded in an iframe
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    // Grant geolocation for "show my location on overview map" if implemented
    value: 'geolocation=(self), camera=(), microphone=(), payment=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // MapLibre GL JS requires worker-src and blob: for its web workers
      "script-src 'self' 'unsafe-eval'",      // unsafe-eval required by MapLibre WebGL shader compilation
      "worker-src blob: 'self'",               // MapLibre spawns workers via blob URLs
      // Tile URLs from OSM and Azure Blob CDN
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.blob.core.windows.net",
      // MapLibre fetches tile JSON and vector tiles
      "connect-src 'self' https://*.tile.openstreetmap.org https://*.blob.core.windows.net",
      // Azure Blob for map images displayed as raster overlays
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
```

> **Note on `unsafe-eval`:** MapLibre GL JS requires `unsafe-eval` for WebGL shader compilation.
> This is a known, accepted trade-off when using WebGL-based renderers. Mitigate by ensuring
> no user-controlled strings are ever passed to `eval` or `new Function` anywhere in the app code.

For the `/share/[token]` route, a tighter CSP can be applied via a more specific `source`
pattern since that route has no TipTap editor.

---

## 7. API security

### tRPC procedure guards

Every tRPC router must use the correct procedure type:

```typescript
// src/server/trpc/trpc.ts
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

// publicProcedure — ONLY for:
//   - Share route queries (by token, not by user)
//   - Health check endpoint
export const publicProcedure = t.procedure
```

Never add authenticated data access to a `publicProcedure`.

### CSRF protection

Next.js 15 Server Actions have built-in CSRF protection (origin header check). For the tRPC
API route, add an explicit origin check in the tRPC HTTP handler:

```typescript
// src/app/api/trpc/[trpc]/route.ts
export const POST = (req: Request) => {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (origin && new URL(origin).host !== host) {
    return new Response('Forbidden', { status: 403 })
  }
  return fetchRequestHandler({ /* ... */ })
}
```

### Error responses

Never leak internal details in API error messages:

```typescript
// ✅ Generic error for unexpected failures
throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'An unexpected error occurred',
  // cause: internalError — do NOT pass; it may be serialised to client
})

// ❌ Never expose stack traces, SQL errors, or internal paths
throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message })
```

Log the full error server-side (with stack trace) but return only the generic message to the
client. Use a logging middleware in the tRPC router for this.

### Upload route authentication

The `/api/upload` route is not a tRPC route, so it must explicitly verify the session:

```typescript
// src/app/api/upload/route.ts
import { auth } from '@/server/auth'

export const POST = async (req: Request) => {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  // ...
}
```

---

## 8. Database security

### Parameterised queries only

All SQL goes through Drizzle's query builder or the tagged `sql` template literal.
The tagged template is parameterised — never interpolate user values with string concatenation:

```typescript
// ✅ Parameterised — user-supplied lng/lat become bind parameters
const nearby = await db.execute(
  sql`SELECT id FROM "mapGeoreferences"
      WHERE ST_DWithin(
        "centerPoint",
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMetres}
      )`
)

// ❌ SQL injection
const query = `SELECT id FROM "mapGeoreferences" WHERE ... = '${lng}'`
```

### Row-level ownership enforcement

Add a database-level check as defence in depth. Use PostgreSQL Row-Level Security (RLS):

```sql
-- Enable RLS on all user-data tables
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competitionEntries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mapGeoreferences" ENABLE ROW LEVEL SECURITY;

-- Application role — used for all app DB connections
CREATE ROLE app_user;

-- Policy: users can only see their own maps
CREATE POLICY maps_owner ON maps
  FOR ALL TO app_user
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

Set the session variable per-request in the Drizzle connection middleware:

```typescript
// src/server/db/index.ts
export const withUserContext = async <T>(
  userId: string,
  fn: (db: typeof db) => Promise<T>,
): Promise<T> => {
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL app.current_user_id = ${userId}`)
    return fn(tx)
  })
}
```

### Connection security

- Use `sslmode=require` in the `DATABASE_URL` connection string
- Connect as a least-privilege application role (not `postgres` superuser)
- The application role must not have `DROP TABLE`, `CREATE TABLE`, or `TRUNCATE` permissions
  (only the migration role needs those)
- Store the connection string in Azure Key Vault, not in App Service environment variables
  directly (use Key Vault references)

### Migration role separation

Use two database roles:

| Role | Permissions | Used by |
|---|---|---|
| `app_user` | SELECT, INSERT, UPDATE, DELETE on app tables | Application at runtime |
| `migrator` | DDL (CREATE, ALTER, DROP) | `drizzle-kit migrate` in CI only |

---

## 9. File storage security

### Azure Blob Storage container configuration

| Container | Access level | Contents |
|---|---|---|
| `originals` | **Private** (no public access) | Raw uploaded files |
| `processed` | **Private** (no public access) | Processed PNGs |
| `tiles` | **Private** (no public access) | Tile pyramids |

> **Important:** Do not set any container to "Blob" or "Container" public access. All files
> are served through the Next.js server, which enforces authorisation before generating a
> signed URL or proxying the file. Public access on the container bypasses all application-level
> access control.

### Serving files — pre-signed URLs with short expiry

Never expose the Azure storage account key to the client. Instead, generate a short-lived
Shared Access Signature (SAS) URL per request, server-side:

```typescript
// src/server/storage/blob.ts
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob'

export const generateReadSasUrl = async (blobPath: string, expiryMinutes = 60): Promise<string> => {
  const client = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING)
  const containerClient = client.getContainerClient(env.AZURE_STORAGE_CONTAINER_NAME)
  const blobClient = containerClient.getBlobClient(blobPath)

  const expiresOn = new Date(Date.now() + expiryMinutes * 60 * 1000)
  const sas = generateBlobSASQueryParameters(
    {
      containerName: env.AZURE_STORAGE_CONTAINER_NAME,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('r'), // read-only
      expiresOn,
    },
    // Use a stored access policy or account key — prefer Managed Identity + user delegation SAS
    storageSharedKeyCredential,
  )
  return `${blobClient.url}?${sas.toString()}`
}
```

For public share routes, the SAS URL expiry should match the expected page session (e.g. 4 hours).

### Preferred: Managed Identity for Blob access

Replace connection-string-based auth with Azure Managed Identity to eliminate the storage
account key from secrets entirely:

```typescript
import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient } from '@azure/storage-blob'

const credential = new DefaultAzureCredential()
const blobServiceClient = new BlobServiceClient(
  `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
  credential,
)
```

Assign the App Service's managed identity the `Storage Blob Data Contributor` role on the
specific storage account.

### Blob path structure

Store files under user-scoped paths to make access auditing easier:

```
originals/{userId}/{mapId}/{randomUUID}.{ext}
processed/{mapId}/image.png
tiles/{mapId}/{z}/{x}/{y}.png
```

The `{userId}` prefix is not a security boundary (always enforce in application logic) but
helps with auditing and future RLS on storage.

---

## 10. Secrets management

### What is a secret

| Secret | Storage |
|---|---|
| `DATABASE_URL` (includes password) | Azure Key Vault |
| `AZURE_STORAGE_ACCOUNT_KEY` | Azure Key Vault (prefer Managed Identity instead) |
| `REDIS_URL` (includes password) | Azure Key Vault |
| `NEXTAUTH_SECRET` | Azure Key Vault |
| Application Insights connection string | Azure Key Vault |

### Azure Key Vault integration

Reference Key Vault secrets in Azure App Service via Key Vault references rather than
copying secrets into environment variables:

```
# In Azure App Service Configuration
DATABASE_URL = @Microsoft.KeyVault(SecretUri=https://omaparchive-kv.vault.azure.net/secrets/database-url/)
```

This means the App Service's managed identity must have `Key Vault Secrets User` role on
the Key Vault.

### Local development

Use `.env.local` for local secrets — this file is `.gitignore`d. Copy `.env.example` and
fill in local values. Never commit `.env.local`.

`.env.example` must contain only placeholder values:

```env
DATABASE_URL=postgresql://postgres:CHANGEME@localhost:5432/omaparchive
NEXTAUTH_SECRET=generate-with-openssl-rand-hex-32
```

### Secret rotation

Rotate secrets on the following triggers:
- Any engineer leaves the team
- A dependency CVE affects a service that uses a secret
- Annually as a baseline
- Immediately if a secret is suspected to have been exposed

The `NEXTAUTH_SECRET` rotation invalidates all active sessions — warn users first.

### What must never appear in code or logs

- Passwords (plaintext or hashed)
- Connection strings with credentials
- JWT secrets
- Storage account keys or SAS tokens (log the blob path, not the URL with the token)
- User email addresses in error messages or stack traces

---

## 11. Transport security

### TLS everywhere

- App Service: enforce HTTPS-only in Azure App Service settings (`httpsOnly: true`)
- PostgreSQL: `sslmode=require` in the connection string
- Redis: use `rediss://` (TLS) URI scheme, not `redis://`
- All Azure service-to-service traffic stays within the Azure backbone (private endpoints)

### HSTS

The `Strict-Transport-Security` header in section 6 enforces HTTPS for 2 years and includes
subdomains. Submit the domain to the [HSTS preload list](https://hstspreload.org/) once the
application is stable.

### TLS version

Require TLS 1.2 as the minimum. Disable TLS 1.0 and 1.1 in Azure App Service TLS settings.
Prefer TLS 1.3 where available.

---

## 12. Rate limiting & DoS protection

### Authentication endpoints

Apply rate limiting to `/login` and `/register` using an in-process rate limiter backed by
Redis (so limits are shared across App Service instances if scaled):

```typescript
// src/server/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit' // or use a custom Redis sliding window

export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '15 m'), // 10 attempts per 15 minutes per IP
  prefix: 'rl:auth',
})

export const uploadRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'), // 20 uploads per hour per user
  prefix: 'rl:upload',
})

export const shareViewRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute per IP
  prefix: 'rl:share',
})
```

### Upload endpoint

In addition to per-user upload rate limiting:
- Reject files larger than the per-format maximum before buffering (check `Content-Length`)
- Process a maximum of 3 jobs per user in the BullMQ queue at any time (configurable)

### tRPC API

Apply a general API rate limit for all authenticated tRPC calls:
- 300 requests per minute per authenticated user
- 50 requests per minute per IP for `publicProcedure` calls (share viewer)

### BullMQ job concurrency

Limit worker concurrency to prevent resource exhaustion from concurrent processing jobs:

```typescript
const worker = new Worker('map-processing', processJob, {
  concurrency: 2,           // At most 2 jobs processed simultaneously
  limiter: {
    max: 10,                // At most 10 jobs processed per duration
    duration: 60_000,       // Per minute
  },
})
```

---

## 13. Dependency security

### Lockfile discipline

The `pnpm-lock.yaml` file must be committed and kept up to date. Never use `--no-lockfile`
in production installs. Pin transitive dependencies for security-sensitive packages.

### CI audit gate

Run `pnpm audit` in every CI pipeline run. Fail the build on **high** or **critical**
severity findings:

```yaml
# .github/workflows/ci.yml
- name: Security audit
  run: pnpm audit --audit-level=high
```

### Automated dependency updates

Configure Dependabot or Renovate to:
- Auto-merge patch updates for non-security packages (after CI passes)
- Create PRs for minor/major updates for manual review
- Prioritise security advisories immediately

### Supply chain integrity

- Use exact versions or `^` ranges with a lockfile — never `*` or `latest` in `package.json`
- Review changelogs for minor/major updates to security-sensitive packages before merging:
  `sharp`, `pdf2pic`, `ocad2geojson`, `@tmcw/togeojson`, `bullmq`, `next-auth`, `drizzle-orm`
- Consider enabling npm package provenance verification for production installs

---

## 14. Logging & monitoring

### What to log

Log the following events at `INFO` level using structured JSON (not unstructured strings):

| Event | Fields to log |
|---|---|
| Login success | `userId`, `timestamp`, `ipAddress` (hashed) |
| Login failure | `email` (hashed), `timestamp`, `ipAddress` (hashed), `reason` |
| Account lockout triggered | `email` (hashed), `timestamp` |
| Map uploaded | `userId`, `mapId`, `format`, `fileSizeBytes` |
| Map processing failed | `mapId`, `jobId`, `errorCode` (not full error message) |
| Share token generated | `userId`, `mapId` |
| Share token accessed | `mapId`, `timestamp`, `ipAddress` (hashed) |
| Password changed | `userId`, `timestamp` |
| Access denied (403) | `userId`, `resource`, `timestamp` |

### What must never be logged

- Plaintext passwords or password hashes
- Session tokens or JWT values
- Full email addresses (hash with SHA-256 for correlation if needed)
- Azure storage SAS URLs (log the blob path only)
- `DATABASE_URL` or any other connection string
- Full request bodies (may contain file data or notes content)
- Stack traces in production responses (log server-side, never return to client)

### Log structure

```typescript
// src/lib/logger.ts — use a structured logger like pino
import pino from 'pino'

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
})
```

### Azure Monitor integration

- Stream App Service logs to Azure Monitor / Log Analytics workspace
- Set up alerts for:
  - Login failure rate > 50/minute (potential credential stuffing)
  - Processing job failure rate > 20% (potential malicious file attack)
  - 5xx error rate spike
  - Any `access denied` event (may indicate IDOR probe)

---

## 15. Azure cloud security

### Network isolation

| Service | Configuration |
|---|---|
| Azure PostgreSQL | Private endpoint only — no public access |
| Azure Cache for Redis | Private endpoint only — no public access |
| Azure Blob Storage | Private endpoint only — files served via SAS URLs through app |
| Azure App Service | Public access (it's the web server) — restrict to known IPs if behind Azure Front Door |

Configure all private endpoints to be in the same VNet as the App Service. Use Azure DNS
private zones for name resolution within the VNet.

### Identity and access management

- **No shared credentials** between services — use Managed Identity for App Service → Blob, App Service → Key Vault
- **Least privilege**: each Azure resource has only the permissions it needs
- **No owner-level access** for the application's managed identity

| Identity | Role assignment |
|---|---|
| App Service managed identity | `Storage Blob Data Contributor` on storage account |
| App Service managed identity | `Key Vault Secrets User` on Key Vault |
| CI/CD service principal | `Website Contributor` on App Service (deploy only) |
| CI/CD service principal | `Key Vault Secrets User` only for migration secrets |

### Azure Defender for Cloud

Enable Defender for Cloud on the subscription with at least:
- **Defender for Servers** (App Service plan)
- **Defender for Databases** (PostgreSQL)
- **Defender for Storage** (Blob Storage — detects malware uploads and anomalous access)

Defender for Storage performs malware scanning on uploaded blobs — this is a valuable
additional layer on top of the application-level file validation.

### Blob Storage additional hardening

- Enable **soft delete** for blobs with a 14-day retention (protects against accidental deletion)
- Enable **versioning** for the originals container
- Enable **immutability policy** if regulatory requirements apply
- Disable **Shared Key access** when Managed Identity is fully operational (forces SAS tokens
  to be generated via Azure AD, not account keys)

### App Service hardening

```
Azure App Service → Configuration:
  HTTPS Only: On
  Minimum TLS Version: 1.2
  Remote Debugging: Off
  Incoming client certificates: Off (not needed)
  HTTP/2: On

Azure App Service → Networking:
  Access Restrictions: allow only Azure Front Door if CDN is used
```

---

## 16. Pre-merge security checklist

Run through this checklist for every PR that touches auth, data access, file handling, or
infrastructure:

### Authentication & sessions
- [ ] No new unauthenticated routes added to the `/(app)/` group
- [ ] No session data modified without re-verifying the session
- [ ] Cookie options unchanged from the approved configuration

### Authorization
- [ ] Every new DB query that reads user data includes `eq(table.userId, ctx.session.user.id)`
- [ ] No route accepts `userId` as a client-supplied input parameter
- [ ] New public routes (if any) return only intended public data — no PII leakage

### Input validation
- [ ] All new tRPC inputs validated with a Zod schema including semantic bounds
- [ ] No `z.any()` or `z.unknown()` used as a final type (only for intermediate parsing)
- [ ] Coordinate inputs validated to realistic geographic bounds

### File handling
- [ ] File type validated by magic bytes, not extension
- [ ] File size limited before the body is buffered
- [ ] Blob paths use UUID keys, never user-supplied filenames

### SQL
- [ ] No string-concatenated SQL anywhere in the diff
- [ ] All PostGIS queries use the tagged `sql` template literal with bind parameters

### Output
- [ ] No new `dangerouslySetInnerHTML` without DOMPurify sanitisation
- [ ] No user-controlled strings inserted into `eval`, `new Function`, or `setTimeout(string)`
- [ ] Error messages returned to the client do not include stack traces or internal details

### Secrets
- [ ] No secrets committed to the repository
- [ ] Any new env vars added to `src/env.ts` Zod schema and `.env.example`
- [ ] No new secrets added as plain App Service environment variables (use Key Vault references)

### Dependencies
- [ ] `pnpm audit --audit-level=high` passes
- [ ] Any new dependency reviewed for maintenance status and known CVEs

---

## 17. Incident response

### Suspected account compromise

1. Immediately invalidate all sessions for the affected user (increment JWT version counter)
2. Force a password reset via email
3. Review audit logs for the affected `userId` in Azure Monitor for the past 30 days
4. Check if any maps were made public or share tokens generated unexpectedly
5. Notify the user

### Suspected secret exposure (connection string, API key, etc.)

1. Rotate the secret in Azure Key Vault immediately — App Service picks up new value
   within minutes via Key Vault reference refresh
2. If the old secret may have been used: review Azure activity logs for the affected resource
3. Revoke the old secret/key in Azure (disable the Key Vault secret version)
4. Review git history and CI logs to confirm the scope of the exposure
5. File a post-mortem — document how the exposure occurred and what controls were added

### Suspected malicious file processed

1. Set the affected map's `processingStatus` to `failed` to prevent it from being served
2. Delete the processed output from Azure Blob Storage
3. Do not delete the original — preserve it for forensic analysis
4. Review BullMQ job logs for the job ID associated with that map
5. If the file triggered a known CVE in a parser: patch the dependency and re-scan all
   recently uploaded files of that format
6. Review Azure Defender for Storage alerts for the blob

### Data breach (DB access or bulk data exfiltration)

1. Isolate the app: set App Service to maintenance mode or restrict IP access
2. Rotate all secrets immediately (DB passwords, Redis passwords, NextAuth secret)
3. Revoke all active user sessions by rotating the `NEXTAUTH_SECRET`
4. Notify affected users within 72 hours (GDPR obligation if EU users are involved)
5. Preserve all logs — do not delete or rotate logs during an active investigation
6. Engage Azure Support for a forensic review of access logs

### Contact

Security issues should be reported privately by opening a **GitHub Security Advisory** in this
repository (Security → Advisories → New draft advisory). Do not file public issues for
unpatched vulnerabilities.
