CREATE TYPE "public"."original_format" AS ENUM('jpeg', 'png', 'pdf', 'geotiff', 'ocad', 'oom');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transform_type" AS ENUM('affine', 'tps');--> statement-breakpoint
CREATE TABLE "map_georeferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"control_points" jsonb NOT NULL,
	"transform_type" "transform_type" NOT NULL,
	"world_file" jsonb,
	"bounding_poly" geometry(Polygon, 4326),
	"center_point" geometry(Point, 4326),
	"georeferenced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_georeferences_map_id_unique" UNIQUE("map_id")
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"original_format" "original_format" NOT NULL,
	"original_file_url" text NOT NULL,
	"processed_url" text,
	"tile_base_url" text,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"share_token" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maps_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "map_georeferences" ADD CONSTRAINT "map_georeferences_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_georeferences_bounding_poly_idx" ON "map_georeferences" USING gist ("bounding_poly");--> statement-breakpoint
CREATE INDEX "map_georeferences_center_point_idx" ON "map_georeferences" USING gist ("center_point");--> statement-breakpoint
CREATE INDEX "maps_user_id_processing_status_idx" ON "maps" USING btree ("user_id","processing_status");--> statement-breakpoint
CREATE INDEX "maps_share_token_idx" ON "maps" USING btree ("share_token") WHERE "maps"."is_public" = true;