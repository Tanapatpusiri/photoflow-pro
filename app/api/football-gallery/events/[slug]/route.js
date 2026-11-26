import {NextResponse} from 'next/server';
import {db,configured,grantFor,suspendedForGrant,SUSPENDED_MESSAGE,privateHeaders} from '../../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../../lib/football-gallery-retention';
import {PLAYER_CONSENT_JOIN,VISIBLE_PLAYER_SQL} from '../../../../../lib/football-gallery-player-visibility';
import {thumbUrl} from '../../../../../lib/football-gallery-tickets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
const PUBLISHED="m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true";
export async function GET(request,{params}){
 if(!configured())return reply({message:'ยังไม่ได้ตั้งค่าระบบคลังไฟล์'},503);
 try{
  const {slug}=await params;
  if(typeof slug!=='string'||slug.length>140)return reply({message:'ไม่พบอัลบั้ม'},404);
  const q=await db().query(`SELECT id,album_mode,(SELECT p.slug FROM fg_events p WHERE p.id=e.parent_event_id) AS parent_slug,slug,title,venue,event_date,privacy_notice,retention_until,status,locked,cover_drive_id,cover_media_id,EXTRACT(EPOCH FROM updated_at)::bigint AS cover_version FROM fg_events e WHERE slug=$1 AND status IN('published','suspended')`,[slug]);
  if(!q.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
  const e=q.rows[0];
  if(e.status==='suspended')return await suspendedForGrant(request,e.id)?reply({message:SUSPENDED_MESSAGE,suspended:true},403):reply({message:'ไม่พบอัลบั้ม'},404);
  const grant=await grantFor(request,e.id);
  if(!grant&&e.parent_slug)return reply({message:'ไม่พบอัลบั้ม'},404);
  if(!grant)return reply({message:'ไม่มีสิทธิ์เข้าชมอัลบั้ม',needsAccess:true},403);
  if(e.album_mode==='multi-day'){
   const {rows}=await db().query(`SELECT e.id,e.slug,e.title,e.event_date::text AS date,
    (e.cover_drive_id IS NOT NULL OR e.cover_media_id IS NOT NULL) AS has_cover,
    COUNT(m.id) FILTER (WHERE m.kind='photo')::int AS photos,
    COUNT(m.id) FILTER (WHERE m.kind='video')::int AS videos
    FROM fg_events e LEFT JOIN fg_media m ON m.event_id=e.id AND ${PUBLISHED}
    WHERE e.parent_event_id=$1 AND e.status='published' AND e.privacy_approved_at IS NOT NULL
     AND ${ACTIVE_RETENTION_SQL} GROUP BY e.id ORDER BY e.event_date,e.title,e.id`,[e.id]);
   return reply({event:{slug:e.slug,title:e.title},players:[],matchdays:rows.map(d=>({
    slug:d.slug,title:d.title,date:d.date,photos:d.photos,videos:d.videos,
    cover:d.has_cover?'/api/football-gallery/cover/'+d.id:null
   }))});
  }
  const [count,players,cover]=await Promise.all([
   db().query(`SELECT m.kind,COUNT(*)::int AS total,COALESCE(SUM((SELECT SUM(f.size_bytes) FROM fg_media_files f WHERE f.media_id=m.id AND f.variant IN('JPEG','RAW','VIDEO_ORIGINAL'))),0)::bigint AS bytes FROM fg_media m WHERE m.event_id=$1 AND ${PUBLISHED} GROUP BY m.kind`,[e.id]),
   db().query(`SELECT p.id,p.name,p.jersey,(r.profile_jpeg IS NOT NULL) AS has_profile,
     CASE WHEN consent.approved THEN r.nickname END AS nickname,COUNT(m.id) FILTER(WHERE m.kind='photo')::int AS photos,COUNT(m.id) FILTER(WHERE m.kind='video')::int AS videos,
     (SELECT CASE WHEN f.storage='drive' THEN 'd:'||f.id::text ELSE f.id::text END FROM fg_media_players mp2 JOIN fg_media m2 ON m2.id=mp2.media_id JOIN fg_media_files f ON f.media_id=m2.id AND f.variant='THUMB' AND f.verified_bytes=true WHERE mp2.player_id=p.id AND m2.event_id=p.event_id AND m2.kind='photo' AND m2.status='published' AND m2.publish_allowed=true AND m2.metadata_reviewed=true ORDER BY m2.captured_at NULLS LAST,m2.id LIMIT 1) AS cover
     FROM fg_players p
     LEFT JOIN fg_player_registry r ON r.id=p.registry_id AND r.active=true
     ${PLAYER_CONSENT_JOIN}
     LEFT JOIN fg_media_players mp ON mp.player_id=p.id
     LEFT JOIN fg_media m ON m.id=mp.media_id AND m.event_id=p.event_id AND ${PUBLISHED}
     WHERE p.event_id=$1 AND ${VISIBLE_PLAYER_SQL}
     GROUP BY p.id,r.id,consent.approved ORDER BY p.team NULLS LAST,(CASE WHEN p.jersey ~ '^[0-9]{1,6}$' THEN p.jersey::int END) NULLS LAST,p.jersey NULLS LAST,p.name`,[e.id]),
   db().query(`SELECT f.id,f.storage,f.r2_key FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true WHERE m.event_id=$1 AND m.kind='photo' AND ${PUBLISHED} ORDER BY m.captured_at NULLS LAST,m.id LIMIT 1`,[e.id])
  ]);
  const by=k=>count.rows.find(x=>x.kind===k);
  // Cover images: a Worker URL for Drive previews, otherwise the app's /files/<id> redirect route.
  const coverOf=v=>!v?null:v.startsWith('d:')?{coverUrl:thumbUrl(v.slice(2),grant.codeId,e.id)}:{cover:v};
  // Use the exact same cover resolver as the homepage card. It prefers the
  // admin-selected upload/photo and only falls back to a published photo for
  // an unlocked album. This also keeps cover changes in sync across pages.
  const hasCover=!!(e.cover_drive_id||e.cover_media_id||(!e.locked&&cover.rows[0]));
  const version=e.cover_version;
  const eventCover=hasCover?{coverUrl:'/api/football-gallery/cover/'+e.id+'?v='+version}:{};
  const playerRows=players.rows.map(({cover,has_profile,...p})=>({
   ...p,...coverOf(cover),
   ...(has_profile?{profileUrl:'/api/football-gallery/events/'+encodeURIComponent(slug)+'/player-photo?player='+p.id}:{})
  }));
  return reply({event:{slug:e.slug,title:e.title,venue:e.venue,date:e.event_date,photos:by('photo')?.total||0,videos:by('video')?.total||0,bytes:Number(by('photo')?.bytes||0)+Number(by('video')?.bytes||0),...eventCover,parentSlug:e.parent_slug,privacyNotice:e.privacy_notice,retentionUntil:e.retention_until,locked:e.locked},players:playerRows});
 }catch(err){console.error('fg event lookup',err?.code||'unknown');return reply({message:'ไม่สามารถโหลดข้อมูลอัลบั้ม'},503)}
}
