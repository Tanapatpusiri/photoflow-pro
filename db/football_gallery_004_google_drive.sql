-- Football Gallery migration 004: Google Drive as primary original storage.
-- Additive and idempotent. For Drive files, fg_media_files.r2_key holds the Drive file id
-- (or 'pending:<uuid>' until the upload completes) and upload_id holds the resumable session URI.

ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 's3';
ALTER TABLE fg_media_files DROP CONSTRAINT IF EXISTS fg_media_files_storage_check;
ALTER TABLE fg_media_files ADD CONSTRAINT fg_media_files_storage_check CHECK(storage IN ('s3','drive'));
ALTER TABLE fg_media_files ADD COLUMN IF NOT EXISTS declared_crc32 text CHECK(declared_crc32 IS NULL OR declared_crc32 ~ '^[0-9a-f]{8}$');
ALTER TABLE fg_events ADD COLUMN IF NOT EXISTS drive_folder_id text;

-- Small key/value store for storage settings. Secret values (OAuth refresh token) are
-- encrypted with AES-256-GCM by the application before they are written.
CREATE TABLE IF NOT EXISTS fg_settings (
 key text PRIMARY KEY,
 value text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
