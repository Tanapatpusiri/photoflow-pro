import {NextResponse} from 'next/server';
import {db,configured,grantFor,isUuid,presignOriginal,presignInline,privateHeaders} from '../../../../../../../lib/football-gallery-server';
import {thumbUrl,originalUrl} from '../../../../../../../lib/football-gallery-tickets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const deny=(message,status)=>NextResponse.json({message},{status,headers:privateHeaders});
export async function GET(request,{params}){
 if(!configured())return deny('คลังไฟล์ยังไม่พร้อม',503);
 const {slug,fileId}=await params;
 if(!isUuid(fileId))return deny('ไม่พบไฟล์',404);
 try{
  const q=await db().query(`SELECT f.r2_key,f.original_filename,f.variant,f.verified_hash,f.verified_bytes,f.storage,m.event_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id JOIN fg_events e ON e.id=m.event_id WHERE f.id=$1 AND e.slug=$2 AND e.status='published' AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true LIMIT 1`,[fileId,slug]);
  if(!q.rowCount)return deny('ไม่พบไฟล์ที่เผยแพร่',404);
  const file=q.rows[0];
  const grant=await grantFor(request,file.event_id);
  if(!grant)return deny('ไม่มีสิทธิ์ดาวน์โหลด',403);
  const preview=['THUMB','PREVIEW','VIDEO_PREVIEW'].includes(file.variant);
  if(preview?!file.verified_bytes:!file.verified_hash)return deny('ไฟล์ยังไม่พร้อม',404);
  if(!preview)await db().query('INSERT INTO fg_audit(event_id,action,resource_id,detail) VALUES($1,$2,$3,$4)',[file.event_id,'download.original',fileId,JSON.stringify({grant:grant.codeId})]);
  // Google Drive files are streamed by the download Worker (no file bytes pass through this app).
  const signed=file.storage==='drive'?(preview?thumbUrl(file.r2_key):originalUrl(fileId,grant.codeId,file.event_id))
   :preview?await presignInline(file.r2_key):await presignOriginal(file.r2_key,file.original_filename);
  return NextResponse.redirect(signed,{status:302,headers:privateHeaders});
 }catch(err){console.error('fg presign',err?.code||'unknown');return deny('ไม่สามารถดาวน์โหลดไฟล์',503)}
}
