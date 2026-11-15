import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let data;try{data=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(data?.eventId)||!isUuid(data?.mediaId))return send({message:'ข้อมูลไม่ถูกต้อง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const result=await client.query(`UPDATE fg_events e SET cover_media_id=$2,updated_at=NOW()
   WHERE e.id=$1 AND EXISTS(SELECT 1 FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id
   WHERE m.id=$2 AND m.event_id=e.id AND m.kind='photo' AND m.status='published'
   AND m.publish_allowed=true AND m.metadata_reviewed=true AND f.variant='THUMB' AND f.verified_bytes=true)
   RETURNING e.id`,[data.eventId,data.mediaId]);
  if(!result.rowCount){await client.query('ROLLBACK');return send({message:'เลือกรูปที่อนุมัติและมีภาพตัวอย่างแล้วในอัลบั้มนี้'},400)}
  await audit(client,{adminId:admin.id,eventId:data.eventId,resourceId:data.mediaId,action:'event.cover'});
  await client.query('COMMIT');return send({ok:true});
 }catch(e){await client.query('ROLLBACK');console.error('fg cover',e?.code||'unknown');return send({message:'ตั้งภาพปกไม่สำเร็จ'},503)}finally{client.release()}
}
