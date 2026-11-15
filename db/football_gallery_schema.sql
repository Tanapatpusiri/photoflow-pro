-- Football Gallery private multi-event schema. Apply only to a dedicated database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS fg_admins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text UNIQUE NOT NULL,
 password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','admin')),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fg_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE,
 title text NOT NULL,
 venue text,
 event_date date,
 cover_media_id uuid,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 privacy_notice text,
 privacy_approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fg_players (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id) ON DELETE CASCADE,
 name text NOT NULL,
 jersey text,
 team text,
 visible boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fg_players_event_idx ON fg_players(event_id);
CREATE TABLE IF NOT EXISTS fg_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('photo','video')),
 status text NOT NULL DEFAULT 'review' CHECK(status IN ('uploading','review','published','hidden')),
 publish_allowed boolean NOT NULL DEFAULT false,
 metadata_reviewed boolean NOT NULL DEFAULT false,
 title text,
 captured_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fg_media_listing_idx ON fg_media(event_id,status,captured_at,id);
CREATE TABLE IF NOT EXISTS fg_media_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 media_id uuid NOT NULL REFERENCES fg_media(id) ON DELETE CASCADE,
 variant text NOT NULL CHECK(variant IN ('JPEG','RAW','VIDEO_ORIGINAL','THUMB','PREVIEW','VIDEO_PREVIEW')),
 r2_key text NOT NULL UNIQUE,
 original_filename text NOT NULL,
 mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>=0),
 sha256 text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(media_id,variant)
);
CREATE INDEX IF NOT EXISTS fg_media_files_media_idx ON fg_media_files(media_id);
CREATE TABLE IF NOT EXISTS fg_media_players (
 media_id uuid NOT NULL REFERENCES fg_media(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES fg_players(id) ON DELETE CASCADE,
 PRIMARY KEY(media_id,player_id)
);
CREATE INDEX IF NOT EXISTS fg_media_players_player_idx ON fg_media_players(player_id);
CREATE TABLE IF NOT EXISTS fg_event_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id) ON DELETE CASCADE,
 code_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fg_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fg_privacy_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id) ON DELETE CASCADE,
 player_id uuid REFERENCES fg_players(id),
 media_id uuid REFERENCES fg_media(id),
 basis text NOT NULL,
 evidence_ref text,
 scope text NOT NULL DEFAULT 'private_gallery',
 reviewed_at timestamptz,
 revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS fg_removal_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id),
 media_id uuid REFERENCES fg_media(id),
 contact text,
 description text NOT NULL,
 state text NOT NULL DEFAULT 'new',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fg_download_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id),
 grant_fingerprint text NOT NULL,
 scope text NOT NULL,
 formats text[] NOT NULL,
 state text NOT NULL DEFAULT 'queued',
 manifest jsonb,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fg_audit (
 id bigserial PRIMARY KEY,
 admin_id uuid REFERENCES fg_admins(id),
 event_id uuid REFERENCES fg_events(id),
 action text NOT NULL,
 resource_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fg_rate_limits (
 key text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 0,
 reset_at timestamptz NOT NULL
);
-- This schema is for a dedicated database accessed by server-side credentials only;
-- never grant anonymous public API access to these tables.
