import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {db,configured,presignUpload,verifyObject,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function POST(request){
 if(!configured())return reply({message:'Storage ยังไม่พร้อม'},503);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({message:'ต้นทางไม่ถูกต้อง'},403);
 const admin=await authenticated(request);if(!admin)return reply({message:'ไม่มีสิทธิ์'},401);
 let d;try{d=await request.json()}catch{return reply({message:'คำขอไม่ถูกต้อง'},400)}
 if(!['init','complete'].includes(d.action)||!/^[a-f0-9-]{36}$/i.test(d.mediaId||''))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  const m=await db().query(`SELECT id,event_id FROM fg_media WHERE id=$1 AND status!='hidden'`,[d.mediaId]);
  if(!m.rowCount)return reply({message:'ไม่พบภาพ'},404);
  const eventId=m.rows[0].event_id;
  if(d.action==='complete'){
   const q=await db().query(`SELECT id,r2_key,size_bytes FROM fg_media_files WHERE media_id=$1 AND variant='THUMB'`,[d.mediaId]);
   if(!q.rowCount)return reply({message:'ไม่พบภาพตัวอย่าง'},404);
   const head=await verifyObject(q.rows[0].r2_key);
   if(Number(head.ContentLength)!==Number(q.rows[0].size_bytes))return reply({message:'ภาพตัวอย่างขนาดไม่ตรง'},409);
   await db().query('UPDATE fg_media_files SET verified_bytes=true WHERE id=$1',[q.rows[0].id]);
   return reply({ok:true});
  }
  const bytes=Number(d.bytes),sha=d.sha256;
  if(!Number.isSafeInteger(bytes)||bytes<100||bytes>8e6||typeof sha!=='string'||!/^[a-f0-9]{64}$/i.test(sha))return reply({message:'ตัวอย่างต้องเป็น JPEG ที่มี checksum และขนาดไม่เกิน 8 MB'},400);
  const key='previews/'+eventId+'/'+d.mediaId+'/'+randomUUID()+'.jpg';
  const q=await db().query(`INSERT INTO fg_media_files(media_id,variant,r2_key,original_filename,mime_type,size_bytes,sha256) VALUES($1,'THUMB',$2,'preview.jpg','image/jpeg',$3,$4) RETURNING id`,[d.mediaId,key,bytes,sha]);
  const url=await presignUpload(key,'image/jpeg');
  return reply({fileId:q.rows[0].id,url},201);
 }catch(e){console.error('fg preview upload',e?.code||'unknown');return reply({message:'สร้างภาพตัวอย่างไม่สำเร็จ'},503)}
}
