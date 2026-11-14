import {NextResponse} from 'next/server';
import {db,configured,presignInline,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:privateHeaders});
export async function GET(request){
 if(!configured())return reply({message:'ยังไม่ได้เชื่อม Storage'},503);
 const admin=await authenticated(request);if(!admin)return reply({message:'ไม่มีสิทธิ์'},401);
 const event=request.nextUrl.searchParams.get('event');const page=Math.max(1,Math.min(10000,Number(request.nextUrl.searchParams.get('page'))||1));
 if(!/^[a-f0-9-]{36}$/i.test(event||''))return reply({message:'กรุณาเลือกงาน'},400);
 try{
  const q=await db().query(`SELECT m.id,m.title,m.kind,m.status,m.publish_allowed,m.metadata_reviewed,
  COALESCE(json_agg(DISTINCT jsonb_build_object('id',f.id,'variant',f.variant,'filename',f.original_filename,'bytes',f.size_bytes,'sha256',f.sha256,'verifiedHash',f.verified_hash,'key',CASE WHEN f.variant='THUMB' THEN f.r2_key ELSE NULL END)) FILTER (WHERE f.id IS NOT NULL),'[]'::json) AS files,
  COALESCE(array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL),'{}'::uuid[]) AS players
  FROM fg_media m LEFT JOIN fg_media_files f ON f.media_id=m.id LEFT JOIN fg_media_players mp ON mp.media_id=m.id LEFT JOIN fg_players p ON p.id=mp.player_id
  WHERE m.event_id=$1 GROUP BY m.id ORDER BY m.created_at DESC LIMIT 80 OFFSET $2`,[event,(page-1)*80]);
  const items=await Promise.all(q.rows.map(async row=>{const thumb=row.files.find(f=>f.variant==='THUMB');const {key,...safe}=thumb||{};return {...row,files:row.files.map(({key,...f})=>f),thumb:thumb?.key?await presignInline(thumb.key):null}}));
  return reply({items,hasMore:items.length===80,page});
 }catch(e){console.error('fg admin list',e?.code||'unknown');return reply({message:'โหลดไฟล์ไม่สำเร็จ'},503)}
}
