-- Football Gallery migration 006: albums on the front page.
-- locked=true (the default, also for every existing album) keeps today's rule: a code or invite is needed.
-- locked=false lets anyone open the published album; access uses a system code row (public_grant_id)
-- so downloads keep the same per-request checks, and locking again revokes that row at once.
-- cover_media_id picks a photo from the album as the card cover; cover_drive_id is an uploaded cover image.
ALTER TABLE fg_events ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT true;
ALTER TABLE fg_events ADD COLUMN IF NOT EXISTS public_grant_id uuid REFERENCES fg_event_codes(id) ON DELETE SET NULL;
ALTER TABLE fg_events ADD COLUMN IF NOT EXISTS cover_media_id uuid REFERENCES fg_media(id) ON DELETE SET NULL;
ALTER TABLE fg_events ADD COLUMN IF NOT EXISTS cover_drive_id text;
ALTER TABLE fg_events ADD COLUMN IF NOT EXISTS cover_pending jsonb;
