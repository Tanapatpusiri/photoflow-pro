-- Football Gallery migration 003: resumable uploads, chunked integrity verification,
-- grant revocation, event suspension, retention, removal requests and archive jobs.
-- Additive and idempotent. Apply after football_gallery_schema.sql and
-- football_gallery_ingestion_extension.sql (scripts/migrate-football-gallery.mjs applies all three in order).

ALTER TABLE fg_events ADD COLUMN IF NOT EXISTS retention_until date;
ALTER TABLE fg_events DROP CONSTRAINT IF EXISTS fg_events_status_check;
ALTER TABLE fg_events ADD CONSTRAINT fg_events_status_check CHECK(status IN ('draft','published','suspended','archived'));

ALTER TABLE fg_media ADD COLUMN IF NOT EXISTS has_gps boolean;

ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS upload_id text;
ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS part_size integer CHECK(part_size IS NULL OR part_size>=5242880);
ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS verify_offset bigint NOT NULL DEFAULT 0 CHECK(verify_offset>=0);
ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS verify_sha_state bytea;
ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS verify_crc_state bytea;
ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS crc32 text CHECK(crc32 IS NULL OR crc32 ~ '^[0-9a-f]{8}$');
ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS verified_at timestamptz;
CREATE INDEX IF NOT EXISTS fg_media_files_checksum_idx ON fg_media_files(sha256,size_bytes) WHERE variant IN('JPEG','RAW','VIDEO_ORIGINAL');
CREATE INDEX IF NOT EXISTS fg_media_files_pending_idx ON fg_media_files(verified_hash) WHERE verified_hash=false AND variant IN('JPEG','RAW','VIDEO_ORIGINAL');

ALTER TABLE fg_event_codes ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE fg_event_codes ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES fg_admins(id);
ALTER TABLE fg_invites ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE fg_invites ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES fg_admins(id);
CREATE INDEX IF NOT EXISTS fg_event_codes_event_idx ON fg_event_codes(event_id);
CREATE INDEX IF NOT EXISTS fg_invites_event_idx ON fg_invites(event_id);

ALTER TABLE fg_download_jobs ADD COLUMN IF NOT EXISTS part_count integer;
ALTER TABLE fg_download_jobs ADD COLUMN IF NOT EXISTS total_bytes bigint;
CREATE INDEX IF NOT EXISTS fg_download_jobs_event_idx ON fg_download_jobs(event_id,created_at);

ALTER TABLE fg_removal_requests ADD COLUMN IF NOT EXISTS grant_fingerprint text;
ALTER TABLE fg_removal_requests ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE fg_removal_requests ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES fg_admins(id);
ALTER TABLE fg_removal_requests ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE fg_removal_requests DROP CONSTRAINT IF EXISTS fg_removal_requests_state_check;
ALTER TABLE fg_removal_requests ADD CONSTRAINT fg_removal_requests_state_check CHECK(state IN ('new','in_review','done','rejected'));
CREATE INDEX IF NOT EXISTS fg_removal_requests_event_idx ON fg_removal_requests(event_id,state,created_at);

ALTER TABLE fg_audit ADD COLUMN IF NOT EXISTS detail jsonb;
CREATE INDEX IF NOT EXISTS fg_audit_event_idx ON fg_audit(event_id,created_at);
CREATE INDEX IF NOT EXISTS fg_privacy_records_player_idx ON fg_privacy_records(event_id,player_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS fg_rate_limits_reset_idx ON fg_rate_limits(reset_at);
