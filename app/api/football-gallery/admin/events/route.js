import {randomBytes} from 'node:crypto';
import {db} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 try{
  // Correlated counts instead of joining players x media, which multiplied rows per event.
  const q=await db().query(`SELECT e.id,e.title,e.slug,e.venue,e.event_date,e.status,e.privacy_approved_at,e.retention_until,
   (SELECT COUNT(*)::int FROM fg_players p WHERE p.event_id=e.id) AS players,
   (SELECT COUNT(*)::int FROM fg_media m WHERE m.event_id=e.id AND m.status<>'hidden') AS media,
   (SELECT COUNT(*)::int FROM fg_media m WHERE m.event_id=e.id AND m.status='published') AS published,
   (SELECT COUNT(*)::int FROM fg_removal_requests r WHERE r.event_id=e.id AND r.state IN('new','in_review')) AS open_removals
   FROM fg_events e ORDER BY e.created_at DESC LIMIT 100`);
  return send({events:q.rows});
 }catch(e){console.error('fg admin events',e?.code||'unknown');return send({message:'ไม่สามารถอ่านข้อมูล'},503)}
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
