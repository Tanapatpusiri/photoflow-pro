import {randomUUID} from 'node:crypto';
import {db,isUuid,storageDriver,presignUpload,verifyObject,streamPrivateObject} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
import {ensurePreviewFolder,createUploadSession,sessionStatus,readRange,deleteFile} from '../../../../../lib/football-gallery-drive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const isJpeg=b=>b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
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
   const q=await db().query(`SELECT id,r2_key,size_bytes,storage,upload_id FROM fg_media_files WHERE media_id=$1 AND variant='THUMB'`,[d.mediaId]);
   if(!q.rowCount)return reply({message:'ไม่พบภาพตัวอย่าง'},404);
   const t=q.rows[0];
   let key=t.r2_key,magic;
   if(t.storage==='drive'){
    const s=t.upload_id?await sessionStatus(t.upload_id,Number(t.size_bytes)):{expired:true};
    if(!s.done)return reply({message:'อัปโหลดภาพตัวอย่างยังไม่เสร็จ'},409);
    if(s.file?.appProperties?.fgFileId!==t.id||Number(s.file.size)!==Number(t.size_bytes))return reply({message:'ภาพตัวอย่างขนาดไม่ตรง'},409);
    key=s.file.id;magic=await readRange(key,0,2);
    if(!isJpeg(magic)){await deleteFile(key).catch(()=>{});return reply({message:'ภาพตัวอย่างต้องเป็น JPEG'},415)}
   }else{
    const head=await verifyObject(t.r2_key);
    if(Number(head.ContentLength)!==Number(t.size_bytes))return reply({message:'ภาพตัวอย่างขนาดไม่ตรง'},409);
    // A preview must really be a JPEG (SOI marker) because it is served inline to parents.
    const start=await streamPrivateObject(t.r2_key,'bytes=0-2');
    magic=Buffer.from(await start.Body.transformToByteArray());
    if(!isJpeg(magic))return reply({message:'ภาพตัวอย่างต้องเป็น JPEG'},415);
   }
   await db().query('UPDATE fg_media_files SET verified_bytes=true,r2_key=$2,upload_id=NULL WHERE id=$1',[t.id,key]);
   return reply({ok:true});
  }
  const bytes=Number(d.bytes),sha=d.sha256;
  if(!Number.isSafeInteger(bytes)||bytes<100||bytes>8e6||typeof sha!=='string'||!/^[a-f0-9]{64}$/i.test(sha))return reply({message:'ตัวอย่างต้องเป็น JPEG ที่มี checksum และขนาดไม่เกิน 8 MB'},400);
  const drive=storageDriver()==='drive',fileId=randomUUID();
  const key=drive?'pending:'+fileId:'previews/'+eventId+'/'+d.mediaId+'/'+randomUUID()+'.jpg';
  const client=await db().connect();
  let replaced=null;
  try{
   await client.query('BEGIN');
   // Retrying a failed preview replaces the earlier unverified row instead of hitting UNIQUE(media_id,variant).
   const existing=await client.query(`SELECT id,verified_bytes,storage,r2_key FROM fg_media_files WHERE media_id=$1 AND variant='THUMB' FOR UPDATE`,[d.mediaId]);
   if(existing.rowCount&&existing.rows[0].verified_bytes&&d.replace!==true){await client.query('ROLLBACK');return reply({message:'มีภาพตัวอย่างแล้ว',exists:true},409)}
   if(existing.rowCount){replaced=existing.rows[0];await client.query('DELETE FROM fg_media_files WHERE id=$1',[replaced.id])}
   await client.query(`INSERT INTO fg_media_files(id,media_id,variant,r2_key,original_filename,mime_type,size_bytes,sha256,storage) VALUES($1,$2,'THUMB',$3,'preview.jpg','image/jpeg',$4,$5,$6)`,[fileId,d.mediaId,key,bytes,sha.toLowerCase(),drive?'drive':'s3']);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  if(replaced?.storage==='drive'&&!String(replaced.r2_key).startsWith('pending:'))await deleteFile(replaced.r2_key).catch(()=>{});
  if(drive){
   const uri=await createUploadSession({name:'preview-'+d.mediaId+'.jpg',mime:'image/jpeg',size:bytes,parent:await ensurePreviewFolder(eventId),appProperties:{fgFileId:fileId,fgRole:'preview'},origin:request.headers.get('origin')});
   await db().query('UPDATE fg_media_files SET upload_id=$2 WHERE id=$1',[fileId,uri]);
   return reply({fileId,mode:'drive',uploadUrl:uri},201);
  }
  return reply({fileId,mode:'single',url:await presignUpload(key,'image/jpeg')},201);
 }catch(e){console.error('fg preview upload',e?.code||e?.name||'unknown');return reply({message:'สร้างภาพตัวอย่างไม่สำเร็จ'},503)}
}
