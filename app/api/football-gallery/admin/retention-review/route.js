import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
import {DELETION_ELIGIBLE_SQL} from '../../../../../lib/football-gallery-deletion-eligibility';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// This endpoint only records a point-in-time review preparation. It cannot
// authorize or execute deletion, and its counts are not proof of storage contents.
export async function GET(request){
 const {admin,error}=await adminGuard(request);if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่ตรวจรายการนี้ได้'},403);
 const event=request.nextUrl.searchParams.get('event');if(!isUuid(event))return reply({message:'กรุณาเลือกงาน'},400);
 try{
  const q=await db().query('SELECT id,state,event_date::text,retention_until::text,snapshot,prepared_at,cancelled_at FROM fg_retention_deletion_reviews WHERE event_id=$1 ORDER BY prepared_at DESC LIMIT 20',[event]);
  return reply({reviews:q.rows});
 }catch(e){console.error('fg retention review list',e?.code||'unknown');return reply({message:'โหลดรายการเตรียมตรวจไม่สำเร็จ'},503)}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่เตรียมรายการนี้ได้'},403);
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(d?.event))return reply({message:'กรุณาเลือกงาน'},400);
 if(d.action!==undefined&&!['prepare','refresh'].includes(d.action))return reply({message:'คำสั่งไม่ถูกต้อง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const event=await client.query(`SELECT e.id,e.event_date::text,e.retention_until::text,COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)::text AS deletion_after FROM fg_events e WHERE e.id=$1 AND ${DELETION_ELIGIBLE_SQL} FOR UPDATE`,[d.event]);
  if(!event.rowCount){await client.query('ROLLBACK');return reply({message:'เตรียมรายการได้เฉพาะงานที่หมดสิทธิ์เข้าถึงและผ่านวันที่กำหนดให้ตรวจเพื่อลบแล้ว'},409)}
  const existing=await client.query("SELECT id FROM fg_retention_deletion_reviews WHERE event_id=$1 AND state='prepared'",[d.event]);
  if(existing.rowCount&&d.action!=='refresh'){await client.query('ROLLBACK');return reply({message:'มีรายการเตรียมตรวจสำหรับงานนี้แล้ว'},409)}
  if(d.action==='refresh'&&!existing.rowCount){await client.query('ROLLBACK');return reply({message:'ไม่พบรายการเดิม กรุณาเตรียมรายการใหม่'},409)}
  if(existing.rowCount)await client.query("UPDATE fg_retention_deletion_reviews SET state='cancelled',cancelled_at=NOW(),cancelled_by=$2 WHERE id=$1 AND state='prepared'",[existing.rows[0].id,admin.id]);
  const counts=await client.query(`SELECT COUNT(f.id)::int AS files,COUNT(f.id) FILTER (WHERE f.variant IN('JPEG','RAW','VIDEO_ORIGINAL'))::int AS originals,COUNT(f.id) FILTER (WHERE f.variant NOT IN('JPEG','RAW','VIDEO_ORIGINAL'))::int AS previews,COUNT(f.id) FILTER (WHERE f.upload_id IS NOT NULL OR f.r2_key LIKE 'pending:%')::int AS pending,COUNT(f.id) FILTER (WHERE f.storage='drive')::int AS drive_files,COUNT(f.id) FILTER (WHERE f.storage<>'drive')::int AS other_files FROM fg_media m LEFT JOIN fg_media_files f ON f.media_id=m.id WHERE m.event_id=$1`,[d.event]);
  const snapshot={...counts.rows[0],deletionAfter:event.rows[0].deletion_after,note:'database counts only; storage, untracked files and backups not checked'};
  const inserted=await client.query(`INSERT INTO fg_retention_deletion_reviews(event_id,prepared_by,event_date,retention_until,snapshot) VALUES($1,$2,$3,$4,$5) RETURNING id`,[d.event,admin.id,event.rows[0].event_date,event.rows[0].retention_until,JSON.stringify(snapshot)]);
  await audit(client,{adminId:admin.id,eventId:d.event,action:d.action==='refresh'?'retention.review_refreshed':'retention.review_prepared',resourceId:inserted.rows[0].id,detail:{files:snapshot.files}});
  await client.query('COMMIT');return reply({ok:true,id:inserted.rows[0].id,snapshot},201);
 }catch(e){await client.query('ROLLBACK');console.error('fg retention review prepare',e?.code||'unknown');return reply({message:'เตรียมรายการตรวจไม่สำเร็จ'},503)}finally{client.release()}
}
