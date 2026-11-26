-- A matchday uses the existing event lifecycle and holds its own media, consent,
-- retention, player snapshots and cover. Existing event rows stay single albums.
ALTER TABLE fg_events
 ADD COLUMN album_mode text NOT NULL DEFAULT 'single',
 ADD COLUMN parent_event_id uuid,
 ADD COLUMN matchday_parent_mode text GENERATED ALWAYS AS
  (CASE WHEN parent_event_id IS NOT NULL THEN 'multi-day'::text END) STORED,
 ADD CONSTRAINT fg_events_album_mode_check CHECK (album_mode IN ('single','multi-day')),
 ADD CONSTRAINT fg_events_matchday_shape CHECK (
  parent_event_id IS NULL OR (album_mode='single' AND parent_event_id<>id AND event_date IS NOT NULL)
 ),
 ADD CONSTRAINT fg_events_id_album_mode_key UNIQUE (id,album_mode);

ALTER TABLE fg_events
 ADD CONSTRAINT fg_events_matchday_parent_fk
 FOREIGN KEY (parent_event_id,matchday_parent_mode) REFERENCES fg_events(id,album_mode);

CREATE INDEX fg_events_matchday_parent_date_idx
 ON fg_events(parent_event_id,event_date,id) WHERE parent_event_id IS NOT NULL;

-- Serialize conversion with media inserts and transfers, including uploads in flight.
CREATE FUNCTION fg_require_media_album() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM fg_events WHERE id=NEW.event_id AND album_mode='single' FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Media requires a single album or matchday' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER fg_media_require_media_album
 BEFORE INSERT OR UPDATE OF event_id ON fg_media
 FOR EACH ROW EXECUTE FUNCTION fg_require_media_album();

CREATE FUNCTION fg_require_empty_tournament() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.album_mode='multi-day' AND OLD.album_mode='single'
    AND EXISTS (SELECT 1 FROM fg_media WHERE event_id=OLD.id) THEN
  RAISE EXCEPTION 'Assign all media safely before changing the album mode' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER fg_events_require_empty_tournament
 BEFORE UPDATE OF album_mode ON fg_events
 FOR EACH ROW EXECUTE FUNCTION fg_require_empty_tournament();
