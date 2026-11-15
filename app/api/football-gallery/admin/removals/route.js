import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const event=request.nextUrl.searchParams.get('event');
 if(!isUuid(event))return reply({message:'กรุณาเลือกงาน'},400);
 try{
  const q=await db().query(`SELECT r.id,r.media_id,r.contact,r.description,r.state,r.created_at,r.resolved_at,r.resolution,m.title AS media_title,m.status AS media_status FROM fg_removal_requests r LEFT JOIN fg_media m ON m.id=r.media_id WHERE r.event_id=$1 ORDER BY (r.state IN('new','in_review')) DESC,r.created_at DESC LIMIT 200`,[event]);
  return reply({requests:q.rows});
 }catch(e){console.error('fg removals list',e?.code||'unknown');return reply({message:'โหลดคำขอไม่สำเร็จ'},503)}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(d?.id)||!['in_review','done','rejected'].includes(d.state))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 const resolution=typeof d.resolution==='string'?d.resolution.trim().slice(0,1000):null;
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const r=await client.query('SELECT id,event_id,media_id FROM fg_removal_requests WHERE id=$1 FOR UPDATE',[d.id]);
  if(!r.rowCount){await client.query('ROLLBACK');return reply({message:'ไม่พบคำขอ'},404)}
  const req=r.rows[0];
  let mediaHidden=false;
  if(d.state==='done'&&req.media_id){
   if(d.hideMedia===false){await client.query('ROLLBACK');return reply({message:'ต้องซ่อนภาพที่ระบุก่อนปิดคำขอ'},400)}
   const hidden=await client.query("UPDATE fg_media SET status='hidden',publish_allowed=false WHERE id=$1 AND event_id=$2 RETURNING id",[req.media_id,req.event_id]);
   if(!hidden.rowCount){await client.query('ROLLBACK');return reply({message:'ไม่พบภาพที่ระบุ จึงยังปิดคำขอไม่ได้'},409)}
   mediaHidden=true;
  }else if(d.state==='done'&&(!resolution||resolution.length<10||d.manualConfirmed!==true)){
   await client.query('ROLLBACK');return reply({message:'กรุณาระบุสิ่งที่ดำเนินการจริงอย่างน้อย 10 ตัวอักษรและยืนยันก่อนปิดคำขอ'},400);
  }
  await client.query(`UPDATE fg_removal_requests SET state=$2,resolution=$3,resolved_at=CASE WHEN $2 IN('done','rejected') THEN NOW() ELSE NULL END,resolved_by=$4 WHERE id=$1`,[d.id,d.state,resolution,admin.id]);
  await audit(client,{adminId:admin.id,eventId:req.event_id,action:'removal.'+d.state,resourceId:d.id,detail:{mediaHidden,manualConfirmed:d.state==='done'&&!req.media_id}});
  await client.query('COMMIT');
  return reply({ok:true});
 }catch(e){await client.query('ROLLBACK');console.error('fg removal update',e?.code||'unknown');return reply({message:'บันทึกไม่สำเร็จ'},503)}finally{client.release()}
}
