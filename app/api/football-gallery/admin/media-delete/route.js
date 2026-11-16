import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
import {deleteFile,cancelSession} from '../../../../../lib/football-gallery-drive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const BATCH=200;
const STATUSES=['review','published','hidden','uploading'];

// Permanently deletes photos/videos from an album: database rows first, then the files in Google Drive.
// Body: {event, mediaIds:[...]} for chosen items, or {event, all:true, status?} for everything in a filter.
// "all" works in batches of 200; the reply says how many are left so the screen can repeat.
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(d?.event))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 const all=d.all===true,status=STATUSES.includes(d.status)?d.status:null;
 const ids=Array.isArray(d.mediaIds)?[...new Set(d.mediaIds)]:[];
 if(!all&&(!ids.length||ids.length>BATCH||!ids.every(isUuid)))return reply({message:'เลือกภาพที่จะลบ (ไม่เกิน 200 ภาพต่อครั้ง)'},400);
 const client=await db().connect();
 let files=[],deleted=0,left=0;
 try{
  await client.query('BEGIN');
  const pick=all
   ?await client.query(`SELECT id FROM fg_media WHERE event_id=$1 ${status?'AND status=$2':''} ORDER BY created_at LIMIT ${BATCH} FOR UPDATE`,status?[d.event,status]:[d.event])
   :await client.query('SELECT id FROM fg_media WHERE event_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE',[d.event,ids]);
  const chosen=pick.rows.map(r=>r.id);
  if(chosen.length){
   files=(await client.query('SELECT storage,r2_key,upload_id FROM fg_media_files WHERE media_id=ANY($1::uuid[])',[chosen])).rows;
   // Keep consent and removal-request history; only their link to the deleted file is cleared.
   await client.query('UPDATE fg_privacy_records SET media_id=NULL WHERE media_id=ANY($1::uuid[])',[chosen]);
   await client.query('UPDATE fg_removal_requests SET media_id=NULL WHERE media_id=ANY($1::uuid[])',[chosen]);
   await client.query('UPDATE fg_events SET cover_media_id=NULL WHERE cover_media_id=ANY($1::uuid[])',[chosen]);
   // fg_media_files and fg_media_players rows go with the media row (ON DELETE CASCADE).
   deleted=(await client.query('DELETE FROM fg_media WHERE event_id=$1 AND id=ANY($2::uuid[])',[d.event,chosen])).rowCount;
   await audit(client,{adminId:admin.id,eventId:d.event,action:'media.delete',resourceId:String(deleted)});
  }
  if(all)left=(await client.query(`SELECT COUNT(*)::int AS n FROM fg_media WHERE event_id=$1 ${status?'AND status=$2':''}`,status?[d.event,status]:[d.event])).rows[0].n;
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');console.error('fg media delete',e?.code||'unknown');return reply({message:'ลบไม่สำเร็จ'},503)}finally{client.release()}
 // The files are removed after the database commit, so a Drive failure never leaves a row that points nowhere.
 let filesFailed=0;
 const queue=[...files];
 await Promise.all([0,1,2,3].map(async()=>{while(queue.length){const f=queue.shift();try{
  if(f.storage!=='drive')continue;
  if(f.upload_id)await cancelSession(f.upload_id);
  if(f.r2_key&&!String(f.r2_key).startsWith('pending:'))await deleteFile(f.r2_key);
 }catch{filesFailed++}}}));
 if(filesFailed)console.error('fg media delete: drive files not removed',filesFailed);
 return reply({deleted,left,filesFailed});
}
