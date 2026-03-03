# oMapArchive

A personal web application for archiving orienteering maps, georeferencing them onto OpenStreetMap, and tracking competition results.

---

## Features

- **Map archive** — Upload scanned maps in any format (JPEG, PNG, PDF, GeoTIFF, OCAD, OOM) with full metadata (scale, equidistance, cartographer, publisher, year)
- **Georeferencing** — Place maps onto OpenStreetMap via an in-browser control-point tool, or automatically via GeoTIFF geotransform extraction
- **Overview map** — Interactive MapLibre GL map showing all georeferenced maps as overlays
- **Competition entries** — Record past results and plan upcoming events with course data, GPS traces, and rich-text notes
- **Public sharing** — Generate shareable links for individual maps — no login required for viewers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| API | tRPC |
| Database | PostgreSQL 16 + PostGIS |
| ORM | Drizzle ORM |
| Auth | Auth.js v5 (email + password, JWT) |
| File storage | Azure Blob Storage (local filesystem fallback in dev) |
| Job queue | BullMQ + Redis |
| Map renderer | MapLibre GL JS |
| Styling | Tailwind CSS + shadcn/ui |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22 LTS |
| pnpm | Latest (`corepack enable`) |
| PostgreSQL | 16 + PostGIS extension |
| Redis | 7+ (for BullMQ — optional in early dev) |

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/nbuehlmann/oMapArchive.git
cd oMapArchive
pnpm install
```

### 2. Set up the database

Start a PostgreSQL 16 instance with PostGIS and create the database:

```bash
# Using Docker (Linux/macOS)
docker compose up -d

# Or point to an existing PostgreSQL 16 + PostGIS instance
# and create the database manually:
psql -U postgres -c "CREATE DATABASE omaparchive;"
psql -U postgres -c "CREATE USER omaparchive WITH PASSWORD 'localdev';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE omaparchive TO omaparchive;"
psql -U postgres -d omaparchive -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://omaparchive:localdev@localhost:5432/omaparchive
AUTH_SECRET=<generate with: openssl rand -hex 32>
NODE_ENV=development
```

Azure Blob Storage is optional for local development — file uploads fall back to `.local-storage/` on the local filesystem when the Azure credentials are not set.

### 4. Run migrations

```bash
pnpm db:migrate
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm typecheck` | TypeScript type-check (no emit) |
| `pnpm lint` | ESLint |
| `pnpm lint:fix` | ESLint with auto-fix |
| `pnpm format` | Prettier |
| `pnpm test` | Vitest unit + component tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm db:generate` | Generate Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Drizzle Studio (DB browser) |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login page (no app shell)
│   ├── (app)/           # Authenticated app shell
│   │   ├── maps/        # Map list + upload form
│   │   └── dashboard/
│   └── page.tsx         # Public homepage
├── components/
│   ├── auth/            # LoginForm, SignOutButton
│   └── maps/            # MapCard, UploadMapForm, badges
├── server/
│   ├── auth/            # Auth.js config + server actions
│   ├── db/              # Drizzle schema + connection
│   └── maps/            # Map server actions
├── lib/
│   └── storage/         # Blob storage client (Azure / local fallback)
├── env.ts               # Zod-validated environment variables
└── middleware.ts         # Route protection
drizzle/
└── migrations/          # Auto-generated SQL migrations
```

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design including the data model, processing pipeline, georeferencing subsystem, and Azure infrastructure.

---

## Security

See [SECURITY.md](./SECURITY.md) for the threat model, security controls, and operational security guidelines.

---

## Contributing

This is a personal project. Contributions are not expected, but issues and suggestions are welcome.
