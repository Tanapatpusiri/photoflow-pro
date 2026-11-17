import {db,configured} from './football-gallery-server';
import {ACTIVE_RETENTION_SQL} from './football-gallery-retention';

// Only already-published, privacy-reviewed album directory metadata.
// A new server request checks the active retention and publication state.
export async function listPublishedAlbums(){
 if(!configured())return [];
 const q=await db().query(`SELECT e.id,e.slug,e.title,e.venue,e.event_date,e.locked,
 (e.cover_drive_id IS NOT NULL OR e.cover_media_id IS NOT NULL OR
  (NOT e.locked AND EXISTS(SELECT 1 FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id
  AND f.variant='THUMB' AND f.verified_bytes=true WHERE m.event_id=e.id AND m.kind='photo'
  AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true))) AS has_cover,
 EXTRACT(EPOCH FROM e.updated_at)::bigint AS v
 FROM fg_events e WHERE e.status='published' AND e.privacy_approved_at IS NOT NULL
 AND ${ACTIVE_RETENTION_SQL}
 ORDER BY e.event_date DESC NULLS LAST,e.title LIMIT 60`);
 return q.rows.map(a=>({slug:a.slug,title:a.title,venue:a.venue,date:a.event_date,locked:a.locked,cover:a.has_cover?`/api/football-gallery/cover/${a.id}?v=${a.v}`:null}));
}
