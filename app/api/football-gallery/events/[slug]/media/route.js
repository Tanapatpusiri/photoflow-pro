import {NextResponse} from 'next/server';
import {db,configured,grantFor,isUuid,privateHeaders,publicLimitOk,PUBLIC_LIMIT_MESSAGE} from '../../../../../../lib/football-gallery-server';
import {thumbUrl} from '../../../../../../lib/football-gallery-tickets';
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
  const grant=await grantFor(request,id);
  if(!grant)return reply({message:'ไม่มีสิทธิ์',needsAccess:true},403);
  const u=new URL(request.url),kind=u.searchParams.get('kind'),player=u.searchParams.get('player'),page=Math.max(1,Math.min(100000,Number(u.searchParams.get('page'))||1));
  // ids=1: the whole listing's saveable photo ids in one request ("เลือกทั้งหมด"), without previews.
  const idsOnly=u.searchParams.get('ids')==='1';
  if(!await publicLimitOk(request,grant,idsOnly?'ids':'list'))return reply({message:PUBLIC_LIMIT_MESSAGE},429);
  if(kind&&!['photo','video'].includes(kind))return reply({message:'ประเภทไฟล์ไม่ถูกต้อง'},400);
  if(player&&!isUuid(player))return reply({message:'ข้อมูลนักฟุตบอลไม่ถูกต้อง'},400);
  const inputs=[id];let where="m.event_id=$1 AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true";
  if(kind){inputs.push(kind);where+=` AND m.kind=$${inputs.length}`}
  if(player){inputs.push(player);where+=` AND EXISTS(SELECT 1 FROM fg_media_players mp JOIN fg_players p ON p.id=mp.player_id WHERE mp.media_id=m.id AND p.event_id=$1 AND p.visible=true AND p.id=$${inputs.length}
   AND (NOT EXISTS(SELECT 1 FROM fg_privacy_records pr WHERE pr.event_id=p.event_id AND pr.player_id=p.id AND pr.revoked_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM fg_privacy_records pr WHERE pr.event_id=p.event_id AND pr.player_id=p.id AND pr.scope='private_gallery' AND pr.reviewed_at IS NOT NULL AND pr.revoked_at IS NULL)))`}
  const order='ORDER BY m.captured_at NULLS LAST,m.title NULLS LAST,m.id';
  if(idsOnly){
   const all=await db().query(`SELECT m.id FROM fg_media m WHERE ${where} AND EXISTS(SELECT 1 FROM fg_media_files f WHERE f.media_id=m.id AND f.variant='JPEG' AND f.verified_hash=true) ${order} LIMIT 100000`,inputs);
   return reply({ids:all.rows.map(r=>r.id)});
  }
  inputs.push((page-1)*PAGE);
  // Only files that are safe to hand out: verified originals and verified previews.
  const rows=await db().query(`SELECT m.id,m.kind,m.title,m.captured_at,
   COALESCE((SELECT json_agg(json_build_object('id',f.id,'variant',f.variant,'filename',f.original_filename,'bytes',f.size_bytes,'sha256',f.sha256) ORDER BY f.variant) FROM fg_media_files f WHERE f.media_id=m.id AND ((f.variant IN('JPEG','RAW','VIDEO_ORIGINAL') AND f.verified_hash=true) OR (f.variant IN('THUMB','PREVIEW','VIDEO_PREVIEW') AND f.verified_bytes=true))),'[]'::json) AS files,
   (SELECT CASE WHEN f.storage='drive' THEN json_build_object('id',f.id,'key',f.r2_key) END FROM fg_media_files f WHERE f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true) AS thumb_drive
   FROM fg_media m WHERE ${where} ${order} LIMIT ${PAGE} OFFSET $${inputs.length}`,inputs);
  // The preview ticket carries the Drive id, so the Worker can serve it from its 60-second grant cache.
  const items=rows.rows.map(({thumb_drive,...item})=>thumb_drive?{...item,thumbUrl:thumbUrl(thumb_drive.id,grant.codeId,id,thumb_drive.key)}:item);
  return reply({items,hasMore:items.length===PAGE,page});
 }catch(err){console.error('fg media list',err?.code||'unknown');return reply({message:'ไม่สามารถโหลดรายการรูป'},503)}
}
