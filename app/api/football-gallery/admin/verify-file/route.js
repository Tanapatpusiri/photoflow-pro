import {createHash,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db,configured,streamPrivateObject,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const maxDuration=60;
const send=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function POST(request){
 if(!configured())return send({message:'Storage ยังไม่พร้อม'},503);
 if(request.headers.get('origin')!==new URL(request.url).origin)return send({message:'ต้นทางไม่ถูกต้อง'},403);
 const admin=await authenticated(request);if(!admin)return send({message:'ไม่มีสิทธิ์'},401);
 let body;try{body=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!/^[0-9a-f-]{36}$/i.test(body.fileId||''))return send({message:'ไฟล์ไม่ถูกต้อง'},400);
 try{
  const q=await db().query(`SELECT f.id,f.r2_key,f.sha256,f.size_bytes,m.event_id FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE f.id=$1 AND f.variant IN('JPEG','RAW','VIDEO_ORIGINAL')`,[body.fileId]);
  if(!q.rowCount)return send({message:'ไม่พบไฟล์ต้นฉบับ'},404);
  const f=q.rows[0];
  const object=await streamPrivateObject(f.r2_key),hash=createHash('sha256');let size=0;
  for await(const chunk of object.Body){hash.update(chunk);size+=chunk.length;if(size>Number(f.size_bytes))break}
  const calculated=hash.digest('hex'),sizeMatch=size===Number(f.size_bytes);
  const hashMatch=!!f.sha256&&f.sha256.length===64&&timingSafeEqual(Buffer.from(calculated,'hex'),Buffer.from(f.sha256,'hex'));
  const ok=sizeMatch&&hashMatch;
  await db().query(`UPDATE fg_media_files SET verified_bytes=$2,verified_hash=$3 WHERE id=$1`,[f.id,sizeMatch,ok]);
  await db().query('INSERT INTO fg_audit(admin_id,event_id,action,resource_id) VALUES($1,$2,$3,$4)',[admin.id,f.event_id,ok?'original.integrity-verified':'original.integrity-failed',f.id]);
  return send({verified:ok,bytes:size,sha256:calculated},ok?200:409);
 }catch(err){console.error('fg integrity streaming',err?.code||'unknown');return send({message:'ตรวจสอบไฟล์ไม่สำเร็จ อาจเกินเวลาประมวลผล กรุณาใช้ Worker สำหรับไฟล์ขนาดใหญ่'},503)}
}
