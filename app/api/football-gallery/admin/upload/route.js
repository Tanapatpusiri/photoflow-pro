import {randomUUID} from 'node:crypto';
import {db,isUuid,originalType,presignUpload,verifyObject,startMultipart,presignPart,listUploadedParts,finishMultipart,abortMultipart} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';

const MiB=1024*1024;
const MULTIPART_THRESHOLD=64*MiB;   // larger originals are uploaded in resumable parts
const MAX_SINGLE_PUT=5*1024*MiB;    // S3/R2 single PUT ceiling
const MAX_BYTES=100*1024*MiB;       // per original file
const partSizeFor=bytes=>Math.max(16*MiB,Math.ceil(bytes/9000/MiB)*MiB); // stays below the 10,000-part limit
const partCount=(bytes,size)=>Math.ceil(bytes/size);

async function loadFile(fileId){
 const q=await db().query(`SELECT f.id,f.r2_key,f.size_bytes,f.media_id,f.upload_id,f.part_size,f.verified_bytes,f.sha256,f.original_filename,m.event_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=$1 AND f.variant IN('JPEG','RAW','VIDEO_ORIGINAL')`,[fileId]);
 return q.rows[0]||null;
}

export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const action=d?.action;
 try{
  if(action==='init')return await init(admin,d);
  if(!['sign-parts','list-parts','complete','abort'].includes(action))return send({message:'คำสั่งไม่ถูกต้อง'},400);
  if(!isUuid(d.fileId))return send({message:'ข้อมูลไฟล์ไม่ถูกต้อง'},400);
  const f=await loadFile(d.fileId);
  if(!f)return send({message:'ไม่พบไฟล์'},404);
  if(action==='sign-parts'){
   if(!f.upload_id)return send({message:'ไฟล์นี้ไม่ได้อัปโหลดแบบแบ่งส่วน'},409);
   const total=partCount(Number(f.size_bytes),f.part_size);
   const numbers=Array.isArray(d.parts)?[...new Set(d.parts)]:[];
   if(!numbers.length||numbers.length>50||numbers.some(n=>!Number.isInteger(n)||n<1||n>total))return send({message:'หมายเลขส่วนไฟล์ไม่ถูกต้อง'},400);
   const urls={};for(const n of numbers)urls[n]=await presignPart(f.r2_key,f.upload_id,n);
   return send({urls,partSize:f.part_size,partCount:total});
  }
  if(action==='list-parts'){
   if(f.verified_bytes)return send({completed:true,fileId:f.id,mediaId:f.media_id});
   if(!f.upload_id)return send({completed:false,mode:'single',fileId:f.id,mediaId:f.media_id,url:await presignUpload(f.r2_key,(await mimeOf(f.id)))});
   const parts=await listUploadedParts(f.r2_key,f.upload_id);
   return send({completed:false,mode:'multipart',fileId:f.id,mediaId:f.media_id,partSize:f.part_size,partCount:partCount(Number(f.size_bytes),f.part_size),uploaded:parts.map(p=>({number:p.number,size:p.size}))});
  }
  if(action==='abort'){
   if(f.verified_bytes)return send({message:'ไฟล์นี้อัปโหลดเสร็จแล้ว'},409);
   if(f.upload_id)await abortMultipart(f.r2_key,f.upload_id).catch(()=>{});
   const client=await db().connect();
   try{
    await client.query('BEGIN');
    await client.query('DELETE FROM fg_media_files WHERE id=$1',[f.id]);
    await client.query(`DELETE FROM fg_media m WHERE m.id=$1 AND NOT EXISTS(SELECT 1 FROM fg_media_files x WHERE x.media_id=m.id)`,[f.media_id]);
    await audit(client,{adminId:admin.id,eventId:f.event_id,action:'upload.aborted',resourceId:f.id});
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
   return send({ok:true});
  }
  // complete
  if(f.upload_id){
   // The part list comes from storage, not from the browser, so a missing or short part cannot be completed.
   let parts;
   try{parts=await listUploadedParts(f.r2_key,f.upload_id)}
   catch(e){
    // Completed earlier but the database update was lost: accept it only if the object exists with the exact size.
    if(e?.name!=='NoSuchUpload')throw e;
    const head=await verifyObject(f.r2_key).catch(()=>null);
    if(!head||Number(head.ContentLength)!==Number(f.size_bytes))return send({message:'การอัปโหลดแบบแบ่งส่วนหมดอายุ กรุณาอัปโหลดใหม่'},409);
    parts=null;
   }
   if(parts){
   const total=partCount(Number(f.size_bytes),f.part_size);
   const sizes=parts.reduce((n,p)=>n+p.size,0);
   const contiguous=parts.length===total&&parts.every((p,i)=>p.number===i+1&&(i===total-1||p.size===f.part_size));
   if(!contiguous||sizes!==Number(f.size_bytes))return send({message:'ยังอัปโหลดไม่ครบทุกส่วน',uploadedParts:parts.length,partCount:total},409);
   await finishMultipart(f.r2_key,f.upload_id,parts);
   }
   await db().query('UPDATE fg_media_files SET upload_id=NULL WHERE id=$1',[f.id]);
  }
  const head=await verifyObject(f.r2_key);
  if(Number(head.ContentLength)!==Number(f.size_bytes))return send({message:'ขนาดไฟล์ที่จัดเก็บไม่ตรงกับต้นฉบับ'},409);
  await db().query(`UPDATE fg_media_files SET verified_bytes=true WHERE id=$1`,[f.id]);
  await db().query(`UPDATE fg_media SET status='review' WHERE id=$1 AND status='uploading'`,[f.media_id]);
  await audit(null,{adminId:admin.id,eventId:f.event_id,action:'upload.confirmed',resourceId:f.id,detail:{bytes:Number(f.size_bytes)}});
  return send({ok:true,verifiedBytes:true,verifiedHash:false,publishable:false});
 }catch(err){console.error('fg upload '+action,err?.name||err?.code||'unknown');return send({message:'ดำเนินการอัปโหลดไม่สำเร็จ กรุณาลองใหม่'},503)}
}

async function mimeOf(fileId){const q=await db().query('SELECT mime_type FROM fg_media_files WHERE id=$1',[fileId]);return q.rows[0].mime_type}

async function init(admin,d){
 const filename=typeof d.filename==='string'?d.filename.trim():'',type=originalType(filename);
 const bytes=Number(d.bytes),sha=typeof d.sha256==='string'?d.sha256.toLowerCase():'';
 const batch=typeof d.batch==='string'?d.batch.trim():'';
 const camera=typeof d.camera==='string'?d.camera.trim():'';
 const captured=typeof d.capturedAt==='string'&&d.capturedAt.length<40&&!Number.isNaN(Date.parse(d.capturedAt))?new Date(d.capturedAt).toISOString():null;
 const hasGps=typeof d.hasGps==='boolean'?d.hasGps:null;
 if(!isUuid(d.event))return send({message:'กรุณาเลือกงาน'},400);
 if(!type||!filename||filename.length>220||/[\u0000-\u001f\\/]/.test(filename))return send({message:'รองรับเฉพาะ JPEG, RAW, MOV, MP4 และ M4V'},400);
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX_BYTES)return send({message:'ขนาดไฟล์ไม่ถูกต้อง'},400);
 if(!/^[a-f0-9]{64}$/.test(sha)||!batch||batch.length>80||camera.length>100)return send({message:'ข้อมูลต้นฉบับไม่ครบ'},400);
 const multipart=bytes>MULTIPART_THRESHOLD;
 if(!multipart&&bytes>MAX_SINGLE_PUT)return send({message:'ไฟล์ใหญ่เกินขนาดอัปโหลด'},400);
 const pairkey=camera.toLowerCase()+':'+type.base.toLowerCase();
 const key='originals/'+d.event+'/'+randomUUID()+'.'+type.ext;
 const partSize=multipart?partSizeFor(bytes):null;
 const client=await db().connect();
 let row;
 try{
  await client.query('BEGIN');
  // Locking the event row serialises inits per event so a JPEG and its RAW uploaded in parallel pair correctly.
  const ev=await client.query("SELECT id FROM fg_events WHERE id=$1 AND status IN('draft','published') FOR UPDATE",[d.event]);
  if(!ev.rowCount){await client.query('ROLLBACK');return send({message:'งานนี้ไม่เปิดรับอัปโหลด'},409)}
  const dup=await client.query(`SELECT f.id,f.media_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE m.event_id=$1 AND f.sha256=$2 AND f.size_bytes=$3 AND f.variant=$4 LIMIT 1`,[d.event,sha,bytes,type.variant]);
  if(dup.rowCount){await client.query('ROLLBACK');return send({message:'ไฟล์นี้มีอยู่ในงานแล้ว',duplicate:true,fileId:dup.rows[0].id,mediaId:dup.rows[0].media_id},409)}
  let mediaId;
  if(type.variant!=='VIDEO_ORIGINAL'){
   const media=await client.query(`SELECT m.id FROM fg_media m WHERE m.event_id=$1 AND m.upload_batch=$2 AND m.pair_key=$3 AND m.kind='photo' AND m.status<>'hidden' AND NOT EXISTS(SELECT 1 FROM fg_media_files f WHERE f.media_id=m.id AND f.variant=$4) ORDER BY m.created_at DESC LIMIT 1`,[d.event,batch,pairkey,type.variant]);
   if(media.rowCount){
    mediaId=media.rows[0].id;
    await client.query(`UPDATE fg_media SET captured_at=COALESCE(captured_at,$2),has_gps=CASE WHEN $3::boolean IS NULL THEN has_gps ELSE COALESCE(has_gps,false) OR $3::boolean END WHERE id=$1`,[mediaId,captured,hasGps]);
   }
  }
  if(!mediaId){
   const inserted=await client.query(`INSERT INTO fg_media(event_id,kind,status,pair_key,upload_batch,captured_at,has_gps,title) VALUES($1,$2,'uploading',$3,$4,$5,$6,$7) RETURNING id`,[d.event,type.variant==='VIDEO_ORIGINAL'?'video':'photo',pairkey,batch,captured,hasGps,type.base.slice(0,120)]);
   mediaId=inserted.rows[0].id;
  }
  const uploadId=multipart?await startMultipart(key,type.mime):null;
  const f=await client.query(`INSERT INTO fg_media_files(media_id,variant,r2_key,original_filename,mime_type,size_bytes,sha256,upload_id,part_size) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[mediaId,type.variant,key,filename,type.mime,bytes,sha,uploadId,partSize]);
  await audit(client,{adminId:admin.id,eventId:d.event,action:'upload.initialized',resourceId:f.rows[0].id,detail:{variant:type.variant,bytes,multipart}});
  await client.query('COMMIT');
  row={fileId:f.rows[0].id,mediaId};
 }catch(e){await client.query('ROLLBACK');console.error('fg upload init',e?.code||e?.name||'unknown');return send({message:'เริ่มอัปโหลดไม่สำเร็จ'},503)}finally{client.release()}
 if(multipart)return send({mode:'multipart',...row,partSize,partCount:partCount(bytes,partSize),contentType:type.mime},201);
 return send({mode:'single',...row,url:await presignUpload(key,type.mime),method:'PUT',contentType:type.mime,expiresIn:600},201);
}
