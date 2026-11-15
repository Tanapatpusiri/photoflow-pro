import {NextResponse} from 'next/server';
import {db,configured,grantFor,isUuid,sameOrigin,rateLimit,clientIp,sha256,privateHeaders} from '../../../../../../lib/football-gallery-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
// Parent/guardian request to take a photo (or every photo of a child) out of the album.
export async function POST(request,{params}){
 if(!configured())return reply({message:'ระบบยังไม่พร้อม'},503);
 if(!sameOrigin(request))return reply({message:'ต้นทางคำขอไม่ถูกต้อง'},403);
 if(Number(request.headers.get('content-length')||0)>8192)return reply({message:'ข้อมูลยาวเกินไป'},413);
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const description=typeof d?.description==='string'?d.description.trim():'';
 const contact=typeof d?.contact==='string'&&d.contact.trim()?d.contact.trim().slice(0,200):null;
 if(description.length<5||description.length>2000)return reply({message:'กรุณาระบุรายละเอียดคำขออย่างน้อย 5 ตัวอักษร'},400);
 if(d.mediaId!=null&&!isUuid(d.mediaId))return reply({message:'ไฟล์ไม่ถูกต้อง'},400);
 try{
  const {slug}=await params;
  const e=await db().query("SELECT id FROM fg_events WHERE slug=$1 AND status='published'",[slug]);
  if(!e.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
  const grant=await grantFor(request,e.rows[0].id);
  if(!grant)return reply({message:'ไม่มีสิทธิ์'},403);
  // One family cannot use up a shared code: limit per code and network first, then cap the whole code.
  if(!await rateLimit('removal',grant.codeId+':'+clientIp(request),30,60)||!await rateLimit('removal-grant',grant.codeId,200,60))return reply({message:'ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง'},429);
  if(d.mediaId){
   const m=await db().query('SELECT 1 FROM fg_media WHERE id=$1 AND event_id=$2',[d.mediaId,e.rows[0].id]);
   if(!m.rowCount)return reply({message:'ไม่พบไฟล์'},404);
  }
  const fingerprint=sha256(process.env.FG_SESSION_SECRET+':grant:'+grant.codeId);
  const q=await db().query('INSERT INTO fg_removal_requests(event_id,media_id,contact,description,grant_fingerprint) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at',[e.rows[0].id,d.mediaId||null,contact,description,fingerprint]);
  await db().query('INSERT INTO fg_audit(event_id,action,resource_id) VALUES($1,$2,$3)',[e.rows[0].id,'removal.requested',q.rows[0].id]);
  return reply({ok:true,reference:q.rows[0].id.slice(0,8).toUpperCase()},201);
 }catch(err){console.error('fg removal request',err?.code||'unknown');return reply({message:'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่'},503)}
}
