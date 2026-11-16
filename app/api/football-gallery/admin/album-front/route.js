import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db,isUuid,sha256,storageDriver,presignInline,privateHeaders,PUBLIC_GRANT_LABEL} from '../../../../../lib/football-gallery-server';
import {adminThumbUrl} from '../../../../../lib/football-gallery-tickets';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
import {ensurePreviewFolder,createUploadSession,sessionStatus,readRange,deleteFile} from '../../../../../lib/football-gallery-drive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const isJpeg=b=>b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
const ACTIONS=['lock','unlock','cover-media','cover-init','cover-complete','cover-clear'];

// The cover as the admin will see it on the card, also for albums that are not published yet.
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const id=request.nextUrl.searchParams.get('event');
 if(!isUuid(id))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  const q=await db().query(`SELECT e.cover_drive_id,(SELECT json_build_object('storage',f.storage,'key',f.r2_key) FROM fg_media_files f WHERE f.media_id=e.cover_media_id AND f.variant='THUMB' AND f.verified_bytes=true) AS chosen FROM fg_events e WHERE e.id=$1`,[id]);
  const r=q.rows[0],pick=!r?null:r.cover_drive_id?{storage:'drive',key:r.cover_drive_id}:r.chosen;
  if(!pick)return reply({message:'ยังไม่ได้ตั้งหน้าปก'},404);
  return NextResponse.redirect(pick.storage==='drive'?adminThumbUrl(pick.key):await presignInline(pick.key),{status:302,headers:privateHeaders});
 }catch(err){console.error('fg album cover preview',err?.code||'unknown');return reply({message:'โหลดหน้าปกไม่สำเร็จ'},503)}
}
// How an album appears on the front page: locked or open to everyone, and its card cover.
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!ACTIONS.includes(d?.action)||!isUuid(d.event))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 const ev=await db().query('SELECT id,locked,public_grant_id,event_date,cover_drive_id,cover_pending FROM fg_events WHERE id=$1',[d.event]);
 if(!ev.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
 const e=ev.rows[0];
 const log=(client,action,resourceId)=>audit(client,{adminId:admin.id,eventId:e.id,action,resourceId});
 try{
  if(d.action==='unlock'||d.action==='lock')return await setLock(e,d.action==='unlock',log);
  if(d.action==='cover-media'){
   if(!isUuid(d.mediaId))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
   const m=await db().query(`SELECT 1 FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true WHERE m.id=$1 AND m.event_id=$2 AND m.kind='photo' AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true`,[d.mediaId,e.id]);
   if(!m.rowCount)return reply({message:'เลือกได้เฉพาะรูปที่ผ่านการอนุมัติเผยแพร่และมีภาพตัวอย่างแล้ว'},409);
   return await tx(async client=>{await client.query('UPDATE fg_events SET cover_media_id=$2,cover_drive_id=NULL,cover_pending=NULL,updated_at=NOW() WHERE id=$1',[e.id,d.mediaId]);await log(client,'album.cover.media',d.mediaId)},async()=>{await removeDriveFile(e.cover_drive_id);return reply({ok:true})});
  }
  if(d.action==='cover-clear')return await tx(async client=>{await client.query('UPDATE fg_events SET cover_media_id=NULL,cover_drive_id=NULL,cover_pending=NULL,updated_at=NOW() WHERE id=$1',[e.id]);await log(client,'album.cover.clear',null)},async()=>{await removeDriveFile(e.cover_drive_id);return reply({ok:true})});
  // Uploaded covers go straight to Google Drive like previews, then are checked to be a JPEG.
  if(storageDriver()!=='drive')return reply({message:'อัปโหลดหน้าปกได้เมื่อเก็บไฟล์ใน Google Drive เท่านั้น เลือกจากภาพในอัลบั้มแทน'},400);
  if(d.action==='cover-init'){
   const bytes=Number(d.bytes);
   if(!Number.isSafeInteger(bytes)||bytes<100||bytes>8e6||typeof d.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(d.sha256))return reply({message:'หน้าปกต้องเป็น JPEG ขนาดไม่เกิน 8 MB'},400);
   const fileId=randomUUID();
   const uri=await createUploadSession({name:'cover-'+e.id+'.jpg',mime:'image/jpeg',size:bytes,parent:await ensurePreviewFolder(e.id),appProperties:{fgFileId:fileId,fgRole:'cover'},origin:request.headers.get('origin')});
   await db().query('UPDATE fg_events SET cover_pending=$2 WHERE id=$1',[e.id,JSON.stringify({fileId,uri,bytes})]);
   return reply({mode:'drive',uploadUrl:uri},201);
  }
  // cover-complete
  const p=e.cover_pending;
  if(!p?.uri)return reply({message:'ยังไม่ได้เริ่มอัปโหลดหน้าปก'},409);
  const s=await sessionStatus(p.uri,Number(p.bytes));
  if(!s.done)return reply({message:'อัปโหลดหน้าปกยังไม่เสร็จ'},409);
  if(s.file?.appProperties?.fgFileId!==p.fileId||Number(s.file.size)!==Number(p.bytes))return reply({message:'ไฟล์หน้าปกไม่ตรงกับที่เริ่มอัปโหลด'},409);
  if(!isJpeg(await readRange(s.file.id,0,2))){await deleteFile(s.file.id).catch(()=>{});return reply({message:'หน้าปกต้องเป็นไฟล์ JPEG'},415)}
  return await tx(async client=>{await client.query('UPDATE fg_events SET cover_drive_id=$2,cover_media_id=NULL,cover_pending=NULL,updated_at=NOW() WHERE id=$1',[e.id,s.file.id]);await log(client,'album.cover.upload',null)},async()=>{if(e.cover_drive_id!==s.file.id)await removeDriveFile(e.cover_drive_id);return reply({ok:true})});
 }catch(err){console.error('fg album front',err?.code||err?.message||'unknown');return reply({message:'บันทึกไม่สำเร็จ'},503)}
}
async function removeDriveFile(id){if(id)await deleteFile(id).catch(()=>{})}
async function tx(work,after){
 const client=await db().connect();
 try{await client.query('BEGIN');await work(client);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 return after();
}
// Unlocking creates a system code row nobody can type (random, never shown); the album page hands
// it out as a normal grant cookie, so every download keeps its usual per-request check.
// Locking revokes that row, which ends access for everyone who opened the album without a code.
async function setLock(e,open,log){
 return tx(async client=>{
  if(open){
   if(!e.locked&&e.public_grant_id)return;
   const code=await client.query(`INSERT INTO fg_event_codes(event_id,code_hash,expires_at,label) VALUES($1,$2,COALESCE(($3::date + INTERVAL '1 year'),NOW()+INTERVAL '1 year'),$4) RETURNING id`,[e.id,sha256('public-album:'+randomUUID()+':'+randomUUID()),e.event_date,PUBLIC_GRANT_LABEL]);
   await client.query('UPDATE fg_events SET locked=false,public_grant_id=$2,updated_at=NOW() WHERE id=$1',[e.id,code.rows[0].id]);
   await log(client,'album.unlock',code.rows[0].id);
  }else{
   if(e.public_grant_id)await client.query('UPDATE fg_event_codes SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL',[e.public_grant_id]);
   await client.query('UPDATE fg_events SET locked=true,public_grant_id=NULL,updated_at=NOW() WHERE id=$1',[e.id]);
   await log(client,'album.lock',e.public_grant_id);
  }
 },()=>reply({ok:true,locked:!open}));
}
