import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// PostGIS geometry custom types
// ---------------------------------------------------------------------------

const geometryPoint = customType<{ data: string }>({
  dataType: () => 'geometry(Point, 4326)',
})

const geometryPolygon = customType<{ data: string }>({
  dataType: () => 'geometry(Polygon, 4326)',
})

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const originalFormatEnum = pgEnum('original_format', [
  'jpeg',
  'png',
  'pdf',
  'geotiff',
  'ocad',
  'oom',
])

export const processingStatusEnum = pgEnum('processing_status', [
  'pending',
  'processing',
  'ready',
  'failed',
])

export const transformTypeEnum = pgEnum('transform_type', ['affine', 'tps'])

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// ---------------------------------------------------------------------------
// maps
// ---------------------------------------------------------------------------

export const maps = pgTable(
  'maps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    originalFormat: originalFormatEnum('original_format').notNull(),
    originalFileUrl: text('original_file_url').notNull(),
    processedUrl: text('processed_url'),
    tileBaseUrl: text('tile_base_url'),
    processingStatus: processingStatusEnum('processing_status').notNull().default('pending'),
    processingError: text('processing_error'),
    isPublic: boolean('is_public').notNull().default(false),
    // Generated when isPublic is set to true; cleared when set back to false
    shareToken: uuid('share_token').unique(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Common query: fetch all maps for a user filtered by processing status
    index('maps_user_id_processing_status_idx').on(t.userId, t.processingStatus),
    // Efficient share token lookup — only indexes rows where the map is public
    index('maps_share_token_idx')
      .on(t.shareToken)
      .where(sql`${t.isPublic} = true`),
  ],
)

// ---------------------------------------------------------------------------
// mapGeoreferences
// ---------------------------------------------------------------------------

export const mapGeoreferences = pgTable(
  'map_georeferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // One active georeference per map; deleting a map cascades to its georef
    mapId: uuid('map_id')
      .notNull()
      .unique()
      .references(() => maps.id, { onDelete: 'cascade' }),
    // Array of {mapX, mapY, lng, lat} objects set by the georeferencing tool
    controlPoints: jsonb('control_points').notNull(),
    transformType: transformTypeEnum('transform_type').notNull(),
    // Computed world file: {scaleX, scaleY, rotX, rotY, transX, transY}
    worldFile: jsonb('world_file'),
    // PostGIS: footprint polygon used for viewport intersection queries
    boundingPoly: geometryPolygon('bounding_poly'),
    // PostGIS: centroid used for map clustering at low zoom levels
    centerPoint: geometryPoint('center_point'),
    georeferencedAt: timestamp('georeferenced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Spatial indexes required for ST_Intersects / ST_DWithin viewport queries
    index('map_georeferences_bounding_poly_idx').using('gist', t.boundingPoly),
    index('map_georeferences_center_point_idx').using('gist', t.centerPoint),
  ],
)

// ---------------------------------------------------------------------------
// TypeScript types inferred from schema
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Map = typeof maps.$inferSelect
export type NewMap = typeof maps.$inferInsert

export type MapGeoreference = typeof mapGeoreferences.$inferSelect
export type NewMapGeoreference = typeof mapGeoreferences.$inferInsert
