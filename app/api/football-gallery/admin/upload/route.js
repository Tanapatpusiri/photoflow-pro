import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {db,configured,presignUpload,verifyObject,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const send=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
const authorizedOrigin=r=>r.headers.get('origin')===new URL(r.url).origin;
const variantFor=filename=>{const ext=filename.split('.').pop()?.toLowerCase();if(['jpg','jpeg'].includes(ext))return 'JPEG';if(['arw','cr2','cr3','nef','raf','dng','orf','rw2','pef','srw','3fr','iiq'].includes(ext))return 'RAW';if(['mov','mp4','m4v'].includes(ext))return 'VIDEO_ORIGINAL';return null};
export async function POST(request){
 if(!configured())return send({message:'Storage ยังไม่พร้อม'},503);
 if(!authorizedOrigin(request))return send({message:'ต้นทางไม่ถูกต้อง'},403);
 const admin=await authenticated(request);if(!admin)return send({message:'ไม่มีสิทธิ์'},401);
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!['init','complete'].includes(d.action))return send({message:'คำสั่งไม่ถูกต้อง'},400);
 if(d.action==='complete'){
  if(!/^[0-9a-f-]{36}$/i.test(d.fileId||''))return send({message:'ข้อมูลไฟล์ไม่ถูกต้อง'},400);
  try{
   const q=await db().query(`SELECT f.id,f.r2_key,f.size_bytes,f.media_id,m.event_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=$1`,[d.fileId]);
   if(!q.rowCount)return send({message:'ไม่พบไฟล์'},404);
   const f=q.rows[0],head=await verifyObject(f.r2_key);
   if(Number(head.ContentLength)!==Number(f.size_bytes))return send({message:'ขนาดไฟล์ที่จัดเก็บไม่ตรงกับต้นฉบับ'},409);
   await db().query(`UPDATE fg_media_files SET verified_bytes=true WHERE id=$1`,[f.id]);
   await db().query(`UPDATE fg_media SET status='review' WHERE id=$1 AND status='uploading'`,[f.media_id]);
   await db().query('INSERT INTO fg_audit(admin_id,event_id,action,resource_id) VALUES($1,$2,$3,$4)',[admin.id,f.event_id,'upload.confirmed',f.id]);
   return send({ok:true,verifiedBytes:true,verifiedHash:false,publishable:false});
  }catch(err){console.error('fg upload finalize',err?.code||'unknown');return send({message:'ยืนยันไฟล์ไม่สำเร็จ'},503)}
 }
 const filename=typeof d.filename==='string'?d.filename.trim():'',variant=variantFor(filename);
 const bytes=Number(d.bytes),sha=typeof d.sha256==='string'?d.sha256.toLowerCase():'';
 const batch=typeof d.batch==='string'?d.batch.trim():'';
 const camera=typeof d.camera==='string'?d.camera.trim():'';
 const mime=typeof d.mime==='string'&&d.mime.length<120?d.mime:'application/octet-stream';
 if(!/^[0-9a-f-]{36}$/i.test(d.event||'')||!variant||!filename||filename.length>220||!Number.isSafeInteger(bytes)||bytes<1||bytes>5e9||!/^[a-f0-9]{64}$/.test(sha)||!batch||batch.length>80||camera.length>100)return send({message:'ข้อมูลต้นฉบับไม่ครบหรือไฟล์ใหญ่เกินขนาด PUT เดี่ยว'},400);
 const ext=filename.split('.').pop().toLowerCase(),base=filename.slice(0,-ext.length-1).toLowerCase();
 const pairkey=camera.toLowerCase()+':'+base;
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const ev=await client.query("SELECT id FROM fg_events WHERE id=$1 AND status='draft' FOR UPDATE",[d.event]);
  if(!ev.rowCount)throw Error('Event must be draft');
  const media=await client.query(`SELECT m.id FROM fg_media m WHERE m.event_id=$1 AND m.upload_batch=$2 AND m.pair_key=$3 AND m.kind='photo' AND NOT EXISTS(SELECT 1 FROM fg_media_files f WHERE f.media_id=m.id AND f.variant=$4) ORDER BY m.created_at DESC LIMIT 1`,[d.event,batch,pairkey,variant]);
  let mediaId;
  if(variant!=='VIDEO_ORIGINAL'&&media.rowCount)mediaId=media.rows[0].id;
  else{const inserted=await client.query(`INSERT INTO fg_media(event_id,kind,status,pair_key,upload_batch) VALUES($1,$2,'uploading',$3,$4) RETURNING id`,[d.event,variant==='VIDEO_ORIGINAL'?'video':'photo',pairkey,batch]);mediaId=inserted.rows[0].id}
  const key='originals/'+d.event+'/'+randomUUID()+'.'+ext;
  const f=await client.query(`INSERT INTO fg_media_files(media_id,variant,r2_key,original_filename,mime_type,size_bytes,sha256) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[mediaId,variant,key,filename,mime,bytes,sha]);
  await client.query('INSERT INTO fg_audit(admin_id,event_id,action,resource_id) VALUES($1,$2,$3,$4)',[admin.id,d.event,'upload.initialized',f.rows[0].id]);
  await client.query('COMMIT');
  const url=await presignUpload(key,mime);
  return send({fileId:f.rows[0].id,mediaId,url,method:'PUT',contentType:mime,expiresIn:600},201);
 }catch(e){await client.query('ROLLBACK');console.error('fg upload init',e?.code||'unknown');return send({message:'เริ่มอัปโหลดไม่สำเร็จ ตรวจสอบชื่อไฟล์ซ้ำและสถานะงาน'},503)}finally{client.release()}
}
