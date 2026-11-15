import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
import {deleteFile,fileMeta} from '../../../../../lib/football-gallery-drive';
import {inspectRecordedFiles} from '../../../../../lib/football-gallery-retention-inventory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

// Only verified Drive objects recorded in this event can be removed. A durable intent
// lets a later retry finish after a network error or interruption without republishing.
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่ลบถาวรได้'},403);
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(d?.eventId)||!isUuid(d?.mediaId)||d.confirmed!==true)return reply({message:'กรุณาเลือกภาพและยืนยันการลบ'},400);
 const client=await db().connect(),key='media.delete.'+d.eventId+'.'+d.mediaId;
 let locked=false,inTransaction=false;
 try{
  const lock=await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok',[key]);
  if(!lock.rows[0].ok)return reply({message:'ภาพนี้กำลังถูกลบ'},409);
  locked=true;
  await client.query('BEGIN');inTransaction=true;
  const ev=await client.query('SELECT id,drive_folder_id FROM fg_events WHERE id=$1 FOR UPDATE',[d.eventId]);
  const media=await client.query('SELECT id FROM fg_media WHERE id=$1 AND event_id=$2 FOR UPDATE',[d.mediaId,d.eventId]);
  if(!ev.rowCount||!media.rowCount){await client.query('ROLLBACK');inTransaction=false;return reply({message:'ไม่พบภาพ'},404)}
  const existing=await client.query('SELECT value FROM fg_settings WHERE key=$1',[key]);
  let intent;
  if(existing.rowCount){
   intent=JSON.parse(existing.rows[0].value);
   if(!Array.isArray(intent.files)||intent.eventId!==d.eventId||intent.mediaId!==d.mediaId)throw Error('bad deletion intent');
  }else{
   const files=await client.query('SELECT id,variant,original_filename,storage,r2_key,upload_id,size_bytes,sha256 FROM fg_media_files WHERE media_id=$1 ORDER BY id FOR UPDATE',[d.mediaId]);
   const folder=await client.query('SELECT value FROM fg_settings WHERE key=$1',['drive.preview_folder.'+d.eventId]);
   const checks=await inspectRecordedFiles(files.rows,[ev.rows[0].drive_folder_id,folder.rows[0]?.value],fileMeta);
   if(checks.some(x=>x.status!=='matched')){await client.query('ROLLBACK');inTransaction=false;return reply({message:'ตรวจไฟล์ต้นฉบับไม่ครบหรือไฟล์ใน Drive ไม่ตรง ระบบยังไม่ได้ลบ กรุณาตรวจการอัปโหลดและที่เก็บก่อน'},409)}
   intent={eventId:d.eventId,mediaId:d.mediaId,files:files.rows.map(f=>({id:f.id,key:f.r2_key}))};
   await client.query("UPDATE fg_media SET status='hidden',publish_allowed=false WHERE id=$1",[d.mediaId]);
   await client.query('INSERT INTO fg_settings(key,value) VALUES($1,$2)',[key,JSON.stringify(intent)]);
   await audit(client,{adminId:admin.id,eventId:d.eventId,action:'media.deletion_started',resourceId:d.mediaId,detail:{files:intent.files.length}});
  }
  await client.query('COMMIT');inTransaction=false;
  for(const file of intent.files)await deleteFile(file.key);
  await client.query('BEGIN');inTransaction=true;
  await client.query('SELECT id FROM fg_events WHERE id=$1 FOR UPDATE',[d.eventId]);
  await client.query('SELECT id FROM fg_media WHERE id=$1 AND event_id=$2 FOR UPDATE',[d.mediaId,d.eventId]);
  const current=await client.query('SELECT id,r2_key FROM fg_media_files WHERE media_id=$1 ORDER BY id',[d.mediaId]);
  if(current.rowCount!==intent.files.length||current.rows.some((f,i)=>f.id!==intent.files[i].id||f.r2_key!==intent.files[i].key))throw Error('media changed during deletion');
  await client.query('UPDATE fg_events SET cover_media_id=NULL WHERE id=$1 AND cover_media_id=$2',[d.eventId,d.mediaId]);
  await client.query('DELETE FROM fg_privacy_records WHERE event_id=$1 AND media_id=$2',[d.eventId,d.mediaId]);
  await client.query('DELETE FROM fg_removal_requests WHERE event_id=$1 AND media_id=$2',[d.eventId,d.mediaId]);
  await client.query('DELETE FROM fg_media WHERE id=$1 AND event_id=$2',[d.mediaId,d.eventId]);
  await client.query('DELETE FROM fg_settings WHERE key=$1',[key]);
  await audit(client,{adminId:admin.id,eventId:d.eventId,action:'media.deleted',resourceId:d.mediaId,detail:{files:intent.files.length}});
  await client.query('COMMIT');inTransaction=false;
  return reply({ok:true});
 }catch(e){if(inTransaction)await client.query('ROLLBACK');console.error('fg delete media',e?.code||'unknown');return reply({message:'ลบไม่สำเร็จ ภาพจะถูกซ่อนไว้หากเริ่มลบแล้ว กรุณาลองอีกครั้ง'},503)}
 finally{if(locked)await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]).catch(()=>{});client.release()}
}
