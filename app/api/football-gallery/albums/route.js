import {NextResponse} from 'next/server';
import {db,configured,privateHeaders} from '../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../lib/football-gallery-retention';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
// Front page cards: every published album that is still within its access period.
// Only the title, venue, date, lock state and whether a cover exists are shown; no photo list.
export async function GET(){
 if(!configured())return reply({albums:[]});
 try{
  const q=await db().query(`SELECT e.id,e.slug,e.title,e.venue,e.event_date,e.locked,
   (e.cover_drive_id IS NOT NULL OR e.cover_media_id IS NOT NULL OR (NOT e.locked AND EXISTS(SELECT 1 FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true WHERE m.event_id=e.id AND m.kind='photo' AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true))) AS has_cover,
   EXTRACT(EPOCH FROM e.updated_at)::bigint AS v
   FROM fg_events e WHERE e.status='published' AND e.privacy_approved_at IS NOT NULL AND ${ACTIVE_RETENTION_SQL} ORDER BY e.event_date DESC NULLS LAST,e.title LIMIT 60`);
  return reply({albums:q.rows.map(a=>({slug:a.slug,title:a.title,venue:a.venue,date:a.event_date,locked:a.locked,cover:a.has_cover?`/api/football-gallery/cover/${a.id}?v=${a.v}`:null}))});
 }catch(e){console.error('fg albums',e?.code||'unknown');return reply({message:'โหลดอัลบั้มไม่สำเร็จ',albums:[]},503)}
}
