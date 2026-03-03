# oMapArchive — Architecture

## 1. Overview

oMapArchive is a full-stack web application for archiving orienteering maps (scanned paper maps and
digital originals), georeferencing them onto a shared overview map, recording competition results,
and preparing for future events. It is designed for personal/club use (1–10 users) and hosted on
Azure.

### Core capabilities

| Capability | Description |
|---|---|
| Map archive | Upload scanned maps in any format (JPEG/PNG, PDF, GeoTIFF, OCAD/OOM) with full metadata |
| Georeferencing | Place maps onto OpenStreetMap via in-browser control-point tool or GeoTIFF upload |
| Overview map | Interactive map showing all georeferenced maps as overlays |
| Competition entries | Past results and "virtual" future entries with course data, GPS trace, and notes |
| Sharing | Public share links for individual maps (no login required for viewer) |
| Preparation | Rich-text notes, course data, and map display for upcoming events |

---

## 2. Technology Stack

### Framework & Language

| Layer | Technology | Rationale |
|---|---|---|
| Full-stack framework | **Next.js 15** (App Router) | TypeScript monolith; Server Components for data-heavy pages, Client Components for interactive maps |
| Language | **TypeScript** | End-to-end type safety |
| API layer | **tRPC** | Type-safe client–server communication without code generation |
| Styling | **Tailwind CSS** + **shadcn/ui** | Accessible component library, fast iteration |

### Data & Storage

| Layer | Technology | Rationale |
|---|---|---|
| Database | **PostgreSQL 16** + **PostGIS** | Geospatial queries (viewport intersection, nearest-map search) |
| ORM | **Drizzle ORM** | Lightweight, TypeScript-first, supports raw PostGIS SQL extensions |
| File storage | **Azure Blob Storage** | Original uploads + processed tiles; public access for share links |
| Job queue | **BullMQ** + **Azure Cache for Redis** | Async map processing pipeline with status tracking |

### Maps & Geo

| Layer | Technology | Rationale |
|---|---|---|
| Base map | **OpenStreetMap** tiles (free) | No API key, no cost, community-maintained |
| Map renderer | **MapLibre GL JS** | Open-source WebGL renderer; supports raster overlays for georeferenced maps |
| Coordinate transforms | **proj4js** | Client-side CRS reprojection for georeferencing tool |
| Raster processing | **sharp** + **gdal-js** (server) | Image conversion and GeoTIFF → tile generation |
| PDF conversion | **pdf2pic** / **pdf.js** | Server-side PDF → PNG rasterisation |
| OCAD/OOM parsing | **ocad2geojson** | Convert OCAD vector files to GeoJSON for rendering |
| GPS traces | GPX file upload + **@tmcw/togeojson** | Parse GPX tracks to GeoJSON for map overlay |

### Auth & Security

| Layer | Technology | Rationale |
|---|---|---|
| Authentication | **Auth.js v5** (NextAuth) | Email + password via Credentials provider; JWT session in HTTP-only cookie |
| Password hashing | **bcryptjs** | Industry-standard credential storage |
| Public share tokens | Random UUID stored on map record | No auth required to view shared maps |

### Rich Text

| Technology | Rationale |
|---|---|
| **TipTap** | ProseMirror-based editor with React integration; outputs JSON stored in DB and rendered as HTML |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐ │
│  │  Next.js RSC │  │  MapLibre GL JS  │  │  TipTap Editor    │ │
│  │  (pages/UI)  │  │  (overview map,  │  │  (notes / prep)   │ │
│  │              │  │   georef tool,   │  │                   │ │
│  │  shadcn/ui   │  │   share viewer)  │  │                   │ │
│  └──────┬───────┘  └────────┬─────────┘  └─────────┬─────────┘ │
│         │ tRPC              │ tile URLs              │           │
└─────────┼───────────────────┼────────────────────────┼──────────┘
          │                   │                        │
          ▼                   ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Azure App Service (Next.js)                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Next.js App Router                       │  │
│  │                                                           │  │
│  │  Server Components   Server Actions   tRPC Router         │  │
│  │  (SSR / RSC)         (mutations)      (queries)           │  │
│  │                                                           │  │
│  │  Auth.js middleware (session validation on all routes)    │  │
│  └──────────┬───────────────────────────────────────────────┘  │
│             │                                                    │
│  ┌──────────▼──────────────────────────────────────────────┐   │
│  │               Map Processing Service                      │   │
│  │                                                           │   │
│  │  BullMQ Worker (runs in same process, separate thread)    │   │
│  │  • PDF → PNG (pdf2pic)                                    │   │
│  │  • OCAD/OOM → GeoJSON (ocad2geojson)                     │   │
│  │  • GeoTIFF → tiles (gdal-js)                             │   │
│  │  • Image optimisation (sharp)                             │   │
│  │  • Write output to Azure Blob Storage                     │   │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼──────────────────────┐
          ▼               ▼                      ▼
┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐
│  Azure DB    │  │  Azure Cache  │  │  Azure Blob Storage  │
│  PostgreSQL  │  │  for Redis    │  │                      │
│  + PostGIS   │  │  (BullMQ)    │  │  /originals/         │
│              │  │               │  │  /tiles/             │
│  Users       │  │               │  │  /processed/         │
│  Maps        │  │               │  │  (CDN-accessible,    │
│  GeoRefs     │  │               │  │   public for shares) │
│  Competitions│  │               │  │                      │
│  Sessions    │  │               │  │                      │
└──────────────┘  └───────────────┘  └──────────────────────┘
```

### Request flow — map upload

```
User uploads file
      │
      ▼
Next.js API route
  1. Validates file type & size
  2. Streams file to Azure Blob Storage (/originals/{userId}/{mapId}/{filename})
  3. Creates Map record in DB (status: "pending")
  4. Enqueues processing job in BullMQ
      │
      ▼
BullMQ Worker (async)
  1. Downloads file from Blob
  2. Converts to canonical PNG (if PDF / OCAD)
  3. Generates tile pyramid (if large raster / GeoTIFF)
  4. Uploads processed output to Blob (/processed/{mapId}/...)
  5. Updates Map record in DB (status: "ready", sets tileUrl / imageUrl)
      │
      ▼
Client polls map status via tRPC query
  → Map appears in archive when status === "ready"
```

---

## 4. Data Model

### Entity Relationship (simplified)

```
User ──< Map ──< MapGeoreference
          │
          └──< CompetitionEntry
                    │
                    └── (optional) MapId FK
```

### Schema (Drizzle / PostgreSQL)

```typescript
// users
users {
  id           uuid PK default gen_random_uuid()
  email        text UNIQUE NOT NULL
  passwordHash text NOT NULL
  displayName  text
  createdAt    timestamp default now()
}

// maps — the core archive entity
maps {
  id              uuid PK
  userId          uuid FK → users.id
  title           text NOT NULL
  description     text
  originalFormat  enum('jpeg','png','pdf','geotiff','ocad','oom')
  originalFileUrl text NOT NULL          -- Azure Blob URL
  processedUrl    text                   -- Blob URL to canonical image
  tileBaseUrl     text                   -- Blob URL prefix for tile pyramid
  processingStatus enum('pending','processing','ready','failed')
  processingError text
  isPublic        boolean default false
  shareToken      uuid UNIQUE            -- set when isPublic = true
  uploadedAt      timestamp default now()
  updatedAt       timestamp
}

// georeference data for a map
mapGeoreferences {
  id            uuid PK
  mapId         uuid FK → maps.id UNIQUE  -- one active georef per map
  controlPoints jsonb NOT NULL            -- [{mapX, mapY, lng, lat}, ...]
  transformType enum('affine','tps')
  worldFile     jsonb                     -- {scaleX, scaleY, rotX, rotY, transX, transY}
  -- PostGIS columns
  boundingPoly  geometry(Polygon, 4326)   -- footprint of map on earth
  centerPoint   geometry(Point, 4326)     -- for overview clustering
  georeferencedAt timestamp default now()
}

// competition entries — past results and future "virtual" entries
competitionEntries {
  id              uuid PK
  userId          uuid FK → users.id
  mapId           uuid FK → maps.id NULLABLE  -- may not have a map yet
  type            enum('past','virtual')
  status          enum('planned','completed')
  eventName       text NOT NULL
  eventDate       date
  locationName    text
  locationPoint   geometry(Point, 4326)        -- for map pin
  courseLength    numeric(6,3)                 -- km
  courseClimb     integer                      -- metres
  numberOfControls integer
  finishingTime   integer                      -- seconds
  resultPosition  integer
  resultCategory  text                         -- e.g. "H21E"
  gpxTraceUrl     text                         -- Azure Blob URL
  gpxTraceGeoJson jsonb                        -- cached GeoJSON of trace
  notes           jsonb                        -- TipTap document JSON
  createdAt       timestamp default now()
  updatedAt       timestamp
}
```

### Key indexes

```sql
-- Geospatial: find maps visible in a given viewport
CREATE INDEX ON "mapGeoreferences" USING GIST ("boundingPoly");
CREATE INDEX ON "mapGeoreferences" USING GIST ("centerPoint");
CREATE INDEX ON "competitionEntries" USING GIST ("locationPoint");

-- Common lookups
CREATE INDEX ON maps ("userId", "processingStatus");
CREATE INDEX ON maps ("shareToken") WHERE "isPublic" = true;
CREATE INDEX ON "competitionEntries" ("userId", "eventDate" DESC);
```

---

## 5. Application Structure

```
oMapArchive/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth group (no sidebar layout)
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (app)/                    # Authenticated app shell
│   │   │   ├── layout.tsx            # Sidebar + auth guard
│   │   │   ├── dashboard/page.tsx    # Map + competition list
│   │   │   ├── maps/
│   │   │   │   ├── page.tsx          # All maps grid
│   │   │   │   ├── new/page.tsx      # Upload form
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Map detail + georeference
│   │   │   │       └── georeference/ # Georef control-point tool
│   │   │   │           └── page.tsx
│   │   │   ├── competitions/
│   │   │   │   ├── page.tsx          # All entries list
│   │   │   │   ├── new/page.tsx      # Create past/virtual entry
│   │   │   │   └── [id]/page.tsx     # Entry detail + map + notes
│   │   │   └── overview/page.tsx     # Full overview map
│   │   ├── share/
│   │   │   └── [token]/page.tsx      # Public share view (no auth)
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts
│   │       └── upload/route.ts       # Streaming upload handler
│   │
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts             # Drizzle schema (all tables)
│   │   │   └── index.ts              # DB connection
│   │   ├── trpc/
│   │   │   ├── router.ts             # Root tRPC router
│   │   │   └── routers/
│   │   │       ├── maps.ts
│   │   │       ├── competitions.ts
│   │   │       └── georeference.ts
│   │   ├── auth/
│   │   │   └── index.ts              # Auth.js config
│   │   ├── storage/
│   │   │   └── blob.ts               # Azure Blob Storage client helpers
│   │   └── processing/
│   │       ├── queue.ts              # BullMQ queue definition
│   │       ├── worker.ts             # BullMQ worker + job handlers
│   │       ├── pdf.ts                # PDF → PNG conversion
│   │       ├── ocad.ts               # OCAD/OOM → GeoJSON
│   │       └── tiles.ts              # GeoTIFF / large image → tiles
│   │
│   ├── components/
│   │   ├── maps/
│   │   │   ├── OverviewMap.tsx       # MapLibre full overview
│   │   │   ├── MapViewer.tsx         # Single map display
│   │   │   ├── GeoreferenceEditor.tsx# Control-point picking tool
│   │   │   └── RouteOverlay.tsx      # GPX trace display
│   │   ├── competitions/
│   │   │   ├── EntryForm.tsx
│   │   │   └── EntryCard.tsx
│   │   ├── editor/
│   │   │   └── RichTextEditor.tsx    # TipTap wrapper
│   │   └── ui/                       # shadcn/ui re-exports
│   │
│   ├── lib/
│   │   ├── georef/
│   │   │   ├── transform.ts          # Affine / TPS transform math
│   │   │   └── proj.ts               # proj4js helpers
│   │   └── utils.ts
│   │
│   └── middleware.ts                 # Auth.js session middleware
│
├── drizzle/
│   └── migrations/                   # Auto-generated migration files
│
├── public/
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## 6. Key Subsystems

### 6.1 Georeferencing Tool

The in-browser tool allows users to establish a spatial transform between pixel coordinates on
the scanned map and geographic coordinates (WGS84 longitude/latitude).

**Workflow:**
1. User opens the georeferencing editor for a map
2. Screen splits: scanned map (left) + OpenStreetMap base map (right)
3. User clicks a recognisable feature on the scan → places a pin on the OSM map at the same location
4. Repeat for ≥ 3 control points (≥ 6 recommended for TPS)
5. App computes an affine (3 points) or Thin Plate Spline transform (≥ 6 points) via `proj4js`
6. Live preview overlays the scan on the OSM map with the computed transform
7. On save: control points + world file stored in `mapGeoreferences`; PostGIS `boundingPoly` computed

**GeoTIFF upload path:** GDAL extracts the existing geotransform server-side; no user interaction
needed for the control points — the map is immediately georeferenced.

### 6.2 Overview Map

- MapLibre GL JS renders the OSM base layer
- A tRPC query fetches all georeferenced maps for the current user (bounded by viewport using
  PostGIS `ST_Intersects`)
- Each map is rendered as a raster image overlay (`addSource` / `addLayer` with `type: 'raster'`)
- Clicking a map overlay opens a sidebar with map metadata and a link to the detail view
- Competition entry `locationPoint` values are rendered as pins on the same map

### 6.3 Competition Entry (Virtual / Past)

A competition entry can exist **without a map** (useful for planning future events before the
map is available).

**Past entry:** upload map → add result time/position → optionally upload GPX trace
**Virtual entry:** enter event name, date, course details, notes → later attach a map

The `status` field drives the UI:
- `planned` → shown in an "Upcoming" section with a preparation view
- `completed` → shown in the archive with result and route overlay

### 6.4 Public Sharing

When a user marks a map as public:
1. A UUID `shareToken` is generated and stored on the `maps` record
2. The shareable URL is `https://<domain>/share/<shareToken>`
3. The `/share/[token]` route is outside the auth middleware — no login needed
4. The route renders a read-only map viewer with the map image overlaid on OSM
5. No user data or other maps are exposed via this route

### 6.5 Map Processing Pipeline

```
Upload → Azure Blob (original) → BullMQ job enqueued
                                         │
                     ┌───────────────────┼───────────────────────┐
                     ▼                   ▼                       ▼
               PDF input          OCAD/OOM input        JPEG/PNG/GeoTIFF
                     │                   │                       │
               pdf2pic                ocad2geojson           (already raster)
               (→ PNG)              (→ GeoJSON/PNG render)      │
                     └───────────────────┴───────────────────────┘
                                         │
                                    sharp (resize / optimise)
                                         │
                            ┌────────────┴────────────┐
                            ▼                         ▼
                     Small maps                 Large maps (>A2)
                    single PNG               gdal tile pyramid
                                            (z/x/y structure)
                            │                         │
                            └────────────┬────────────┘
                                         ▼
                              Azure Blob /processed/
                              DB updated: status = "ready"
```

---

## 7. Azure Infrastructure

| Resource | Azure Service | SKU (initial) |
|---|---|---|
| App hosting | Azure App Service | B2 (2 vCPU, 3.5 GB RAM) |
| Database | Azure Database for PostgreSQL Flexible Server | Burstable B1ms |
| Cache / queue | Azure Cache for Redis | C0 Basic |
| File storage | Azure Blob Storage | LRS, Hot tier |
| CDN (optional) | Azure CDN (Front Door) | Standard — for tile serving |
| Secrets | Azure Key Vault | Standard |
| CI/CD | GitHub Actions → Azure App Service deploy | |

### Environment variables

```env
# Database
DATABASE_URL=postgresql://...

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_ACCOUNT_KEY=
AZURE_STORAGE_CONTAINER_NAME=omaparchive

# Redis / BullMQ
REDIS_URL=rediss://...

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://yourdomain.com

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Deployment pipeline (GitHub Actions)

```
push to main
  → lint + type-check
  → run drizzle migrations against staging DB
  → build Next.js app
  → deploy to Azure App Service
  → smoke test
```

---

## 8. Key Libraries Summary

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "@trpc/server": "^11.0.0",
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "drizzle-orm": "latest",
    "drizzle-kit": "latest",
    "pg": "^8.0.0",
    "@auth/drizzle-adapter": "latest",
    "next-auth": "^5.0.0",
    "bcryptjs": "^2.4.3",
    "maplibre-gl": "^4.0.0",
    "proj4": "^2.11.0",
    "@tmcw/togeojson": "latest",
    "bullmq": "^5.0.0",
    "ioredis": "^5.0.0",
    "@azure/storage-blob": "^12.0.0",
    "sharp": "^0.33.0",
    "pdf2pic": "^3.0.0",
    "ocad2geojson": "latest",
    "@tiptap/react": "^2.0.0",
    "@tiptap/starter-kit": "^2.0.0",
    "tailwindcss": "^4.0.0",
    "zod": "^3.0.0"
  }
}
```

---

## 9. Design Decisions & Trade-offs

| Decision | Choice | Alternative considered | Reason |
|---|---|---|---|
| Framework | Next.js 15 monolith | Separate SPA + API | Single deployment, shared types, simpler for 1–10 users |
| API style | tRPC | REST / GraphQL | End-to-end TypeScript types; no schema generation needed |
| ORM | Drizzle | Prisma | Closer to SQL, better PostGIS raw query support, faster |
| Job queue | BullMQ + Redis | Azure Functions on blob event | Simpler ops; everything in one process; easy to debug |
| Map renderer | MapLibre GL JS | Leaflet | WebGL performance for raster overlays; open source (no Mapbox token) |
| Georef client lib | proj4js | Server-side GDAL | Live preview in browser; no round-trip needed per control point |
| Auth | Auth.js v5 | Clerk | Self-hosted, no third-party auth service dependency |
| Storage | Azure Blob | Azure Files | HTTP-native, CDN-compatible, suited for raster tile serving |
| Rich text | TipTap | Markdown textarea | Better UX for preparation notes; JSON stored in DB |

---

## 10. Future Considerations

- **Mobile PWA**: Add `next-pwa` for offline map viewing at competition venues
- **Club/group model**: Add `groups` table and `groupMemberships` for shared club archives
- **WMTS/XYZ tile server**: Expose processed tiles as a standard tile endpoint for external GIS tools
- **IOF XML import**: Parse IOF Data Standard XML for automated result import from orienteering
  timing systems
- **Collaborative preparation**: Allow club members to annotate virtual entries with shared notes
