import {randomUUID} from 'node:crypto';
import {db,isUuid,presignUpload,verifyObject,streamPrivateObject} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Previews are separate small JPEG files (photo thumbnails or video poster frames).
// Originals are never touched; a preview can be replaced until it is verified.
export async function POST(request){
 const {error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return reply({message:'คำขอไม่ถูกต้อง'},400)}
 if(!['init','complete'].includes(d?.action)||!isUuid(d.mediaId))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  const m=await db().query(`SELECT id,event_id FROM fg_media WHERE id=$1 AND status<>'hidden'`,[d.mediaId]);
  if(!m.rowCount)return reply({message:'ไม่พบภาพ'},404);
  const eventId=m.rows[0].event_id;
  if(d.action==='complete'){
   const q=await db().query(`SELECT id,r2_key,size_bytes FROM fg_media_files WHERE media_id=$1 AND variant='THUMB'`,[d.mediaId]);
   if(!q.rowCount)return reply({message:'ไม่พบภาพตัวอย่าง'},404);
   const head=await verifyObject(q.rows[0].r2_key);
   if(Number(head.ContentLength)!==Number(q.rows[0].size_bytes))return reply({message:'ภาพตัวอย่างขนาดไม่ตรง'},409);
   // A preview must really be a JPEG (SOI marker) because it is served inline to parents.
   const start=await streamPrivateObject(q.rows[0].r2_key,'bytes=0-2');
   const magic=Buffer.from(await start.Body.transformToByteArray());
   if(magic.length<3||magic[0]!==0xff||magic[1]!==0xd8||magic[2]!==0xff)return reply({message:'ภาพตัวอย่างต้องเป็น JPEG'},415);
   await db().query('UPDATE fg_media_files SET verified_bytes=true WHERE id=$1',[q.rows[0].id]);
   return reply({ok:true});
  }
  const bytes=Number(d.bytes),sha=d.sha256;
  if(!Number.isSafeInteger(bytes)||bytes<100||bytes>8e6||typeof sha!=='string'||!/^[a-f0-9]{64}$/i.test(sha))return reply({message:'ตัวอย่างต้องเป็น JPEG ที่มี checksum และขนาดไม่เกิน 8 MB'},400);
  const key='previews/'+eventId+'/'+d.mediaId+'/'+randomUUID()+'.jpg';
  const client=await db().connect();
  let fileId;
  try{
   await client.query('BEGIN');
   // Retrying a failed preview replaces the earlier unverified row instead of hitting UNIQUE(media_id,variant).
   const existing=await client.query(`SELECT id,verified_bytes FROM fg_media_files WHERE media_id=$1 AND variant='THUMB' FOR UPDATE`,[d.mediaId]);
   if(existing.rowCount&&existing.rows[0].verified_bytes&&d.replace!==true){await client.query('ROLLBACK');return reply({message:'มีภาพตัวอย่างแล้ว',exists:true},409)}
   if(existing.rowCount)await client.query('DELETE FROM fg_media_files WHERE id=$1',[existing.rows[0].id]);
   const q=await client.query(`INSERT INTO fg_media_files(media_id,variant,r2_key,original_filename,mime_type,size_bytes,sha256) VALUES($1,'THUMB',$2,'preview.jpg','image/jpeg',$3,$4) RETURNING id`,[d.mediaId,key,bytes,sha.toLowerCase()]);
   await client.query('COMMIT');fileId=q.rows[0].id;
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  return reply({fileId,url:await presignUpload(key,'image/jpeg')},201);
 }catch(e){console.error('fg preview upload',e?.code||e?.name||'unknown');return reply({message:'สร้างภาพตัวอย่างไม่สำเร็จ'},503)}
}
