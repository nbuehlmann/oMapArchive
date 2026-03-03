# CLAUDE.md — oMapArchive

This file gives Claude Code the context it needs to work effectively in this codebase.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for full system design. Security guidance lives in SECURITY.md (TBD).

---

## Project overview

oMapArchive is a Next.js 15 (App Router) full-stack TypeScript application for archiving
orienteering maps, georeferencing them onto OpenStreetMap, recording competition results,
and preparing for future events. It targets Azure hosting with PostgreSQL + PostGIS.

---

## Environment requirements

| Tool | Version |
|---|---|
| Node.js | 22 LTS |
| pnpm | Latest (via `corepack enable`) |
| PostgreSQL | 16 + PostGIS extension |
| Redis | 7+ (for BullMQ job queue) |

---

## Common commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type-check (no emit)
pnpm typecheck

# Lint
pnpm lint

# Lint + auto-fix
pnpm lint:fix

# Format with Prettier
pnpm format

# Run unit + component tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate DB migration files from schema changes
pnpm db:generate

# Apply pending migrations
pnpm db:migrate

# Open Drizzle Studio (DB browser)
pnpm db:studio

# Push schema to dev DB without migration files (DEV ONLY — never use in prod)
pnpm db:push
```

---

## Before finishing any task

Always run these three checks in order. Do not mark a task done until all three pass:

```bash
pnpm typecheck   # Must produce zero errors
pnpm lint        # Must produce zero errors (warnings are OK)
pnpm test        # Must produce zero failing tests
```

---

## Code conventions

### File and directory naming

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase | `MapViewer.tsx`, `GeoreferenceEditor.tsx` |
| Hooks | kebab-case with `use-` prefix | `use-map-data.ts` |
| Utilities / helpers | kebab-case | `transform-utils.ts`, `blob-client.ts` |
| Server modules | kebab-case | `map-router.ts`, `processing-queue.ts` |
| DB schema files | kebab-case | `schema.ts`, `migrations/` |
| Next.js special files | Next.js convention | `page.tsx`, `layout.tsx`, `loading.tsx` |

### React components

Always use arrow function components:

```typescript
// ✅ Correct
const MapViewer = ({ mapId }: MapViewerProps) => {
  return <div>...</div>
}

export default MapViewer

// ❌ Never use function declarations for components
function MapViewer({ mapId }: MapViewerProps) { ... }
```

### Component size and responsibility

Keep components small — one major concern per file. If a component is doing more than one
distinct thing (e.g., fetching data AND rendering a complex UI AND handling a side effect),
split it up. Prefer composition over large monolithic components.

General guidelines:
- A component file should rarely exceed ~150 lines
- Extract sub-components when JSX nesting exceeds 3–4 levels
- Extract custom hooks for any non-trivial stateful logic

---

## TypeScript rules

### Strictness

`strict: true` is enabled. All strict checks must pass — do not disable them.

```typescript
// ✅ Handle nullability explicitly
const name = user?.displayName ?? 'Anonymous'

// ❌ Never assert non-null without a comment explaining why it's safe
const name = user!.displayName
```

### The `any` type is banned

Use proper types, `unknown`, or generics instead:

```typescript
// ✅ Use unknown for truly unknown data, then narrow
const parse = (raw: unknown): MapRecord => {
  return mapSchema.parse(raw)
}

// ✅ Use generics for reusable utilities
const first = <T>(arr: T[]): T | undefined => arr[0]

// ❌ Never
const doSomething = (data: any) => { ... }
```

### Import path alias

All imports from `src/` use the `@/` alias:

```typescript
import { db } from '@/server/db'
import { maps } from '@/server/db/schema'
import { MapViewer } from '@/components/maps/MapViewer'
```

Never use deep relative paths (`../../../`) for cross-module imports.

---

## Environment variables

All environment variables are validated with Zod at application startup. The schema lives in
`src/env.ts`. When adding a new env var:

1. Add it to the Zod schema in `src/env.ts`
2. Add it to `.env.example` with a placeholder value
3. Never hardcode values — always reference `env.VAR_NAME`

```typescript
// src/env.ts (example shape)
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().min(1),
  // ...
})

export const env = envSchema.parse(process.env)
```

---

## Data fetching patterns

### Server Components → direct DB call

Fetch data directly in async Server Components using Drizzle. No API round-trip needed.

```typescript
// ✅ app/(app)/maps/page.tsx
import { db } from '@/server/db'
import { maps } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

const MapsPage = async () => {
  const userMaps = await db.select().from(maps).where(eq(maps.userId, session.user.id))
  return <MapGrid maps={userMaps} />
}
```

### Client Components → tRPC

Client Components that need data use tRPC queries (backed by React Query):

```typescript
// ✅ components/maps/MapStatusBadge.tsx  (client component)
'use client'
import { api } from '@/lib/trpc/client'

const MapStatusBadge = ({ mapId }: { mapId: string }) => {
  const { data } = api.maps.getById.useQuery({ mapId })
  return <Badge>{data?.processingStatus}</Badge>
}
```

### Never mix concerns

- Server Components do not import tRPC client hooks
- Client Components do not call Drizzle directly

---

## Database conventions

### Drizzle ORM only

All database access goes through Drizzle ORM. No raw SQL string concatenation.

```typescript
// ✅ Use Drizzle query builder
const result = await db.select().from(maps).where(eq(maps.userId, userId))

// ✅ Use tagged sql template for PostGIS (parameterised, no injection)
import { sql } from 'drizzle-orm'
const nearby = await db.execute(
  sql`SELECT * FROM maps WHERE ST_DWithin(center_point, ST_MakePoint(${lng}, ${lat})::geography, ${radiusMetres})`
)

// ❌ Never concatenate SQL strings
const query = `SELECT * FROM maps WHERE user_id = '${userId}'`
```

### Migrations

Schema changes must always go through migration files:

```bash
# 1. Edit src/server/db/schema.ts
# 2. Generate migration
pnpm db:generate
# 3. Review the generated SQL in drizzle/migrations/
# 4. Apply to dev DB
pnpm db:migrate
# 5. Commit both schema.ts change AND migration file
```

`pnpm db:push` is only for rapid local experimentation. Never use it in staging or production.
Never commit without a corresponding migration file.

---

## tRPC conventions

Routers live in `src/server/trpc/routers/`. Each router covers one domain entity.
All routers are assembled in `src/server/trpc/router.ts`.

```typescript
// ✅ Naming: input validated with Zod, output typed via Drizzle return type
export const mapsRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ mapId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(maps).where(eq(maps.id, input.mapId)).then(r => r[0] ?? null)
    }),
})
```

- Use `protectedProcedure` for authenticated routes
- Use `publicProcedure` only for unauthenticated routes (share viewer, health check)
- Always validate input with Zod — never trust raw input

---

## Git workflow

### Branch naming

```
feat/<short-description>      # new feature
fix/<short-description>       # bug fix
chore/<short-description>     # tooling, deps, config
docs/<short-description>      # documentation only
refactor/<short-description>  # refactoring without behaviour change
```

### Commit messages — Conventional Commits

```
feat(maps): add GeoTIFF upload support
fix(georef): correct affine transform for rotated maps
chore(deps): update drizzle-orm to 0.31.0
docs(arch): update data model diagram
```

Format: `<type>(<scope>): <short imperative description>`

Breaking changes: append `!` after the type and add a `BREAKING CHANGE:` footer.

### Pull request workflow

1. Branch from `main`
2. Open a PR against `main`
3. Title follows Conventional Commits format
4. All CI checks must pass before merge (typecheck, lint, tests)
5. Squash merge preferred to keep `main` history clean

---

## Testing conventions

Test files live alongside source files with a `.test.ts` or `.test.tsx` suffix:

```
src/
  lib/georef/transform.ts
  lib/georef/transform.test.ts        ← unit test
  components/maps/MapViewer.tsx
  components/maps/MapViewer.test.tsx  ← component test
```

### What to test

- **Unit tests**: pure functions in `src/lib/` (especially geo/transform math)
- **Component tests**: user-visible behaviour of UI components (not implementation details)
- **tRPC routers**: test with a mocked DB context

### What not to test

- Drizzle schema definitions (they're just type declarations)
- Next.js framework internals
- Third-party library behaviour

### React Testing Library guidelines

Test what the user sees and does, not internal state:

```typescript
// ✅
expect(screen.getByText('Processing...')).toBeInTheDocument()
await userEvent.click(screen.getByRole('button', { name: /upload/i }))

// ❌ Don't test implementation details
expect(component.state.isLoading).toBe(true)
```

---

## Things Claude must never do

| Rule | Why |
|---|---|
| Never use the `any` type | Defeats TypeScript's safety; use `unknown` or proper types |
| Never hardcode secrets or env values in source | All config via env vars validated in `src/env.ts` |
| Never write raw SQL strings outside Drizzle's `sql` tag | SQL injection risk; use parameterised Drizzle queries |
| Never run `pnpm db:push` outside local dev | Bypasses migration history; breaks production schema tracking |
| Never commit `.env` or `.env.local` files | Contains secrets; `.env.example` is the committed reference |
| Never disable TypeScript strict checks with `@ts-ignore` without a comment | If suppression is truly needed, use `@ts-expect-error` with an explanation |
| Never put more than one major concern in a component | Keep components small and single-responsibility |

---

## Authoritative Requirements Source

The file `REQUIREMENTS.md` is the canonical source of structured requirement rules and design document generation standards.

Before performing any of the following tasks, you MUST:

* Read `REQUIREMENTS.md` in full
* Treat it as binding specification
* Follow all generation rules defined in that file
* Do not contradict or bypass its constraints

This applies to:

* GitHub issue → design document generation
* Architecture generation
* Security design output
* Workflow design
* CI/CD automation
* Prompt distribution features
* Policy design

If `REQUIREMENTS.md` conflicts with any other instruction in this repository, `REQUIREMENTS.md` takes precedence unless explicitly overridden in writing in this file.

---

## Mandatory Pre-Execution Rule

Before generating structured design documentation:

1. Load `REQUIREMENTS.md`
2. Identify required output structure
3. Apply all strict generation rules
4. Apply security baseline controls
5. Produce a complete document

Do not skip this step.

---

## File Hierarchy and Precedence

Order of authority:

1. REQUIREMENTS.md (generation rules + design template)
2. SECURITY.md (security constraints and policies)
3. ARCHITECTURE.md (system structure and conventions)
4. CLAUDE.md (behavioral execution instructions)

If ambiguity exists:

* Security constraints override architectural convenience.
* Requirements override stylistic preferences.