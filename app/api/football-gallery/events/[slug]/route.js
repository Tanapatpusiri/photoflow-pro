import {NextResponse} from 'next/server';
import {db,configured,grantFor,privateHeaders} from '../../../../../lib/football-gallery-server';
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
  const q=await db().query(`SELECT id,slug,title,venue,event_date,privacy_notice,retention_until FROM fg_events WHERE slug=$1 AND status='published'`,[slug]);
  if(!q.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
  const e=q.rows[0];
  const grant=await grantFor(request,e.id);
  if(!grant)return reply({message:'ไม่มีสิทธิ์เข้าชมอัลบั้ม',needsAccess:true},403);
  const [count,players,cover]=await Promise.all([
   db().query(`SELECT m.kind,COUNT(*)::int AS total,COALESCE(SUM((SELECT SUM(f.size_bytes) FROM fg_media_files f WHERE f.media_id=m.id AND f.variant IN('JPEG','RAW','VIDEO_ORIGINAL'))),0)::bigint AS bytes FROM fg_media m WHERE m.event_id=$1 AND ${PUBLISHED} GROUP BY m.kind`,[e.id]),
   db().query(`SELECT p.id,p.name,p.jersey,p.team,COUNT(m.id) FILTER(WHERE m.kind='photo')::int AS photos,COUNT(m.id) FILTER(WHERE m.kind='video')::int AS videos,
     (SELECT CASE WHEN f.storage='drive' THEN 'd:'||f.id::text ELSE f.id::text END FROM fg_media_players mp2 JOIN fg_media m2 ON m2.id=mp2.media_id JOIN fg_media_files f ON f.media_id=m2.id AND f.variant='THUMB' AND f.verified_bytes=true WHERE mp2.player_id=p.id AND m2.status='published' AND m2.publish_allowed=true AND m2.metadata_reviewed=true ORDER BY m2.captured_at NULLS LAST,m2.id LIMIT 1) AS cover
     FROM fg_players p LEFT JOIN fg_media_players mp ON mp.player_id=p.id LEFT JOIN fg_media m ON m.id=mp.media_id AND ${PUBLISHED} WHERE p.event_id=$1 AND p.visible=true GROUP BY p.id ORDER BY p.team NULLS LAST,(CASE WHEN p.jersey ~ '^[0-9]{1,6}$' THEN p.jersey::int END) NULLS LAST,p.jersey NULLS LAST,p.name`,[e.id]),
   db().query(`SELECT f.id,f.storage,f.r2_key FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true WHERE m.event_id=$1 AND m.kind='photo' AND ${PUBLISHED} ORDER BY m.captured_at NULLS LAST,m.id LIMIT 1`,[e.id])
  ]);
  const by=k=>count.rows.find(x=>x.kind===k);
  // Cover images: a Worker URL for Drive previews, otherwise the app's /files/<id> redirect route.
  const coverOf=v=>!v?null:v.startsWith('d:')?{coverUrl:thumbUrl(v.slice(2),grant.codeId,e.id)}:{cover:v};
  const c=cover.rows[0];
  const eventCover=!c?{}:c.storage==='drive'?{coverUrl:thumbUrl(c.id,grant.codeId,e.id)}:{cover:c.id};
  const playerRows=players.rows.map(({cover,...p})=>({...p,...coverOf(cover)}));
  return reply({event:{slug:e.slug,title:e.title,venue:e.venue,date:e.event_date,photos:by('photo')?.total||0,videos:by('video')?.total||0,bytes:Number(by('photo')?.bytes||0)+Number(by('video')?.bytes||0),...eventCover,privacyNotice:e.privacy_notice,retentionUntil:e.retention_until},players:playerRows});
 }catch(err){console.error('fg event lookup',err?.code||'unknown');return reply({message:'ไม่สามารถโหลดข้อมูลอัลบั้ม'},503)}
}
