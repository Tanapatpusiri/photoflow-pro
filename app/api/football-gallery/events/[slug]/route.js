import {NextResponse} from 'next/server';
import {db,configured,validateGrant,privateHeaders} from '../../../../../lib/football-gallery-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function GET(request,{params}){
 if(!configured())return reply({message:'ยังไม่ได้ตั้งค่าระบบคลังไฟล์'},503);
 try{
  const {slug}=await params;
  if(typeof slug!=='string'||slug.length>140)return reply({message:'ไม่พบอัลบั้ม'},404);
  const q=await db().query(`SELECT id,slug,title,venue,event_date FROM fg_events WHERE slug=$1 AND status='published'`,[slug]);
  if(!q.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
  const e=q.rows[0];
  if(!await validateGrant(request.cookies.get('fg_grant')?.value,e.id))return reply({message:'ไม่มีสิทธิ์เข้าชมอัลบั้ม'},403);
  const [count,players]=await Promise.all([
   db().query(`SELECT kind,COUNT(*)::int AS total FROM fg_media WHERE event_id=$1 AND status='published' AND publish_allowed=true AND metadata_reviewed=true GROUP BY kind`,[e.id]),
   db().query(`SELECT p.id,p.name,p.jersey,p.team,COUNT(DISTINCT m.id) FILTER(WHERE m.kind='photo')::int AS photos,COUNT(DISTINCT m.id) FILTER(WHERE m.kind='video')::int AS videos FROM fg_players p LEFT JOIN fg_media_players mp ON mp.player_id=p.id LEFT JOIN fg_media m ON m.id=mp.media_id AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true WHERE p.event_id=$1 AND p.visible=true GROUP BY p.id ORDER BY p.team,p.jersey,p.name`,[e.id])
  ]);
  return reply({event:{slug:e.slug,title:e.title,venue:e.venue,date:e.event_date,photos:count.rows.find(x=>x.kind==='photo')?.total||0,videos:count.rows.find(x=>x.kind==='video')?.total||0},players:players.rows});
 }catch(err){console.error('fg event lookup',err?.code||'unknown');return reply({message:'ไม่สามารถโหลดข้อมูลอัลบั้ม'},503)}
}
