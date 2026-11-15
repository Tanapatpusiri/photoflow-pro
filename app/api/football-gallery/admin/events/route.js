import {randomBytes} from 'node:crypto';
import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';
import {oneYearAfterEvent} from '../../../../../lib/football-gallery-retention';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const event=request.nextUrl.searchParams.get('event');
 if(event!==null&&!isUuid(event))return send({message:'รหัสงานไม่ถูกต้อง'},400);
 try{
  // Correlated counts instead of joining players x media, which multiplied rows per event.
  const q=await db().query(`SELECT e.id,e.title,e.slug,e.venue,e.event_date,e.status,e.privacy_approved_at,e.retention_until,e.deletion_after,
   (SELECT COUNT(*)::int FROM fg_players p WHERE p.event_id=e.id) AS players,
   (SELECT COUNT(*)::int FROM fg_media m WHERE m.event_id=e.id AND m.status<>'hidden') AS media,
   (SELECT COUNT(*)::int FROM fg_media m WHERE m.event_id=e.id AND m.status='published') AS published,
   (SELECT COUNT(*)::int FROM fg_removal_requests r WHERE r.event_id=e.id AND r.state IN('new','in_review')) AS open_removals
   FROM fg_events e WHERE ($1::uuid IS NULL OR e.id=$1::uuid) ORDER BY e.created_at DESC LIMIT 100`,[event]);
  return send({events:q.rows});
 }catch(e){console.error('fg admin events',e?.code||'unknown');return send({message:'ไม่สามารถอ่านข้อมูล'},503)}
}
// Fill a missing date without overwriting one. Published/suspended legacy events
// can be repaired only when their existing retention is consistent with that date.
export async function PATCH(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(d?.event)||typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!oneYearAfterEvent(d.date))return send({message:'วันจัดงานไม่ถูกต้อง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const q=await client.query("UPDATE fg_events SET event_date=$2,updated_at=NOW() WHERE id=$1 AND event_date IS NULL AND (status='draft' OR (status IN ('published','suspended') AND retention_until IS NOT NULL AND retention_until<=($2::date + INTERVAL '1 year')::date)) RETURNING id",[d.event,d.date]);
  if(!q.rowCount){await client.query('ROLLBACK');return send({message:'บันทึกได้เฉพาะงานที่ยังไม่มีวันจัดงาน และวันสิ้นสุดต้องไม่เกิน 1 ปีหลังวันจัดงาน'},409)}
  await audit(client,{adminId:admin.id,eventId:d.event,action:'event.set_date',detail:{date:d.date}});
  await client.query('COMMIT');return send({ok:true});
 }catch(e){await client.query('ROLLBACK');console.error('fg event date',e?.code||'unknown');return send({message:'บันทึกวันจัดงานไม่สำเร็จ'},503)}finally{client.release()}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const title=typeof d?.title==='string'?d.title.trim():'';const venue=typeof d?.venue==='string'&&d.venue.trim()?d.venue.trim():null;
 const date=typeof d?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&!Number.isNaN(Date.parse(d.date))?d.date:null;
 if(!title||title.length>180||(venue&&venue.length>180))return send({message:'กรุณากรอกชื่องาน'},400);
 const slug='event-'+randomBytes(10).toString('hex');
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const q=await client.query(`INSERT INTO fg_events(slug,title,venue,event_date,status) VALUES($1,$2,$3,$4,'draft') RETURNING id,slug,title,venue,event_date,status`,[slug,title,venue,date]);
  await audit(client,{adminId:admin.id,eventId:q.rows[0].id,action:'event.create'});
  await client.query('COMMIT');
  return send({event:q.rows[0]},201);
 }catch(e){await client.query('ROLLBACK');console.error('fg event creation',e?.code||'unknown');return send({message:'สร้างงานไม่สำเร็จ'},503)}finally{client.release()}
}
