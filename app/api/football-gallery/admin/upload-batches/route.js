import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// Durable upload-count journal: if a browser tab closes halfway through a
// 300+ file selection, the server retains the intended selection count.
// No filenames, image bytes or secrets are written to this audit record.
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let body;try{body=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const {action,eventId,batch}=body||{};
 if(!['begin','end'].includes(action)||!isUuid(eventId)||!isUuid(batch))return reply({message:'ข้อมูลชุดอัปโหลดไม่ถูกต้อง'},400);
 const selected=Number(body.selected);
 if(!Number.isSafeInteger(selected)||selected<1||selected>10000)return reply({message:'จำนวนไฟล์ที่เลือกไม่ถูกต้อง'},400);
 const bytes=Number(body.bytes);
 if(!Number.isSafeInteger(bytes)||bytes<selected)return reply({message:'ขนาดไฟล์ที่เลือกไม่ถูกต้อง'},400);
 try{
  const ev=await db().query("SELECT id FROM fg_events WHERE id=$1 AND status IN('draft','published')",[eventId]);
  if(!ev.rowCount)return reply({message:'ไม่พบงานที่อัปโหลดได้'},404);
  if(action==='begin'){
   await audit(null,{adminId:admin.id,eventId,action:'upload.batch-started',detail:{batch,selected,bytes}});
   return reply({ok:true,selected},201);
  }
  const stats={};
  for(const k of ['ok','duplicate','failed','skipped']){
   const value=Number(body[k]);
   if(!Number.isSafeInteger(value)||value<0||value>selected)return reply({message:'จำนวนผลลัพธ์ไม่ถูกต้อง'},400);
   stats[k]=value;
  }
  if(stats.ok+stats.duplicate+stats.failed+stats.skipped!==selected)return reply({message:'สรุปผลอัปโหลดไม่ครบทุกไฟล์'},409);
  const q=await db().query(`SELECT COUNT(*)::int AS started,
   COUNT(*) FILTER (WHERE f.verified_hash=true)::int AS verified
   FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id
   WHERE m.event_id=$1 AND m.upload_batch=$2
     AND f.variant IN('JPEG','RAW','VIDEO_ORIGINAL')`,[eventId,batch]);
  const actual=q.rows[0];
  await audit(null,{adminId:admin.id,eventId,action:'upload.batch-ended',detail:{batch,selected,bytes,...stats,stopped:body.stopped===true,serverStarted:actual.started,serverVerified:actual.verified}});
  return reply({ok:true,selected,...stats,serverStarted:actual.started,serverVerified:actual.verified});
 }catch(err){console.error('fg upload batch audit',err?.code||'unknown');return reply({message:'บันทึกการตรวจสอบจำนวนอัปโหลดไม่สำเร็จ'},503)}
}
