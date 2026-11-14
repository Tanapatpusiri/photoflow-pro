import {NextResponse} from 'next/server';
import {db,configured,validateGrant,presignOriginal,presignInline,privateHeaders} from '../../../../../../../lib/football-gallery-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const deny=(message,status)=>NextResponse.json({message},{status,headers:privateHeaders});
export async function GET(request,{params}){
 if(!configured())return deny('คลังไฟล์ยังไม่พร้อม',503);
 const {slug,fileId}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(fileId))return deny('ไม่พบไฟล์',404);
 try{
  const q=await db().query(`SELECT f.r2_key,f.original_filename,f.variant,m.event_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id JOIN fg_events e ON e.id=m.event_id WHERE f.id=$1 AND e.slug=$2 AND e.status='published' AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true LIMIT 1`,[fileId,slug]);
  if(!q.rowCount)return deny('ไม่พบไฟล์ที่เผยแพร่',404);
  const file=q.rows[0];
  if(!await validateGrant(request.cookies.get('fg_grant')?.value,file.event_id))return deny('ไม่มีสิทธิ์ดาวน์โหลด',403);
  const signed=['THUMB','PREVIEW','VIDEO_PREVIEW'].includes(file.variant)?await presignInline(file.r2_key):await presignOriginal(file.r2_key,file.original_filename);
  return NextResponse.redirect(signed,{status:302,headers:privateHeaders});
 }catch(err){console.error('fg presign',err?.code||'unknown');return deny('ไม่สามารถดาวน์โหลดไฟล์',503)}
}
