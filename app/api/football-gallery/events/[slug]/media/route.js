import {NextResponse} from 'next/server';
import {db,configured,grantFor,isUuid,privateHeaders} from '../../../../../../lib/football-gallery-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PAGE=36;
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function GET(request,{params}){
 if(!configured())return reply({message:'ระบบยังไม่พร้อม'},503);
 try{
  const {slug}=await params;
  const event=await db().query("SELECT id FROM fg_events WHERE slug=$1 AND status='published'",[slug]);
  if(!event.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
  const id=event.rows[0].id;
  if(!await grantFor(request,id))return reply({message:'ไม่มีสิทธิ์',needsAccess:true},403);
  const u=new URL(request.url),kind=u.searchParams.get('kind'),player=u.searchParams.get('player'),page=Math.max(1,Math.min(100000,Number(u.searchParams.get('page'))||1));
  if(kind&&!['photo','video'].includes(kind))return reply({message:'ประเภทไฟล์ไม่ถูกต้อง'},400);
  if(player&&!isUuid(player))return reply({message:'ข้อมูลนักฟุตบอลไม่ถูกต้อง'},400);
  const inputs=[id];let where="m.event_id=$1 AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true";
  if(kind){inputs.push(kind);where+=` AND m.kind=$${inputs.length}`}
  if(player){inputs.push(player);where+=` AND EXISTS(SELECT 1 FROM fg_media_players mp JOIN fg_players p ON p.id=mp.player_id WHERE mp.media_id=m.id AND p.event_id=$1 AND p.visible=true AND p.id=$${inputs.length})`}
  inputs.push((page-1)*PAGE);
  // Only files that are safe to hand out: verified originals and verified previews.
  const rows=await db().query(`SELECT m.id,m.kind,m.title,m.captured_at,
   COALESCE((SELECT json_agg(json_build_object('id',f.id,'variant',f.variant,'filename',f.original_filename,'bytes',f.size_bytes,'sha256',f.sha256) ORDER BY f.variant) FROM fg_media_files f WHERE f.media_id=m.id AND ((f.variant IN('JPEG','RAW','VIDEO_ORIGINAL') AND f.verified_hash=true) OR (f.variant IN('THUMB','PREVIEW','VIDEO_PREVIEW') AND f.verified_bytes=true))),'[]'::json) AS files
   FROM fg_media m WHERE ${where} ORDER BY m.captured_at NULLS LAST,m.title NULLS LAST,m.id LIMIT ${PAGE} OFFSET $${inputs.length}`,inputs);
  return reply({items:rows.rows,hasMore:rows.rows.length===PAGE,page});
 }catch(err){console.error('fg media list',err?.code||'unknown');return reply({message:'ไม่สามารถโหลดรายการรูป'},503)}
}
