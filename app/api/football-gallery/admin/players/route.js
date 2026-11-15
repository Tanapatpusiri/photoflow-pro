import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const event=request.nextUrl.searchParams.get('event');
 if(!isUuid(event))return send({message:'กรุณาเลือกงาน'},400);
 try{
  const q=await db().query(`SELECT p.id,p.name,p.jersey,p.team,p.visible,
   EXISTS(SELECT 1 FROM fg_privacy_records r WHERE r.event_id=p.event_id AND r.player_id=p.id AND r.scope='private_gallery' AND r.reviewed_at IS NOT NULL AND r.revoked_at IS NULL) AS privacy_recorded
   FROM fg_players p WHERE p.event_id=$1 ORDER BY p.team NULLS LAST,(CASE WHEN p.jersey ~ '^[0-9]{1,6}$' THEN p.jersey::int END) NULLS LAST,p.jersey NULLS LAST,p.name`,[event]);
  return send({players:q.rows});
 }catch(e){console.error('fg admin players',e?.code||'unknown');return send({message:'อ่านข้อมูลไม่สำเร็จ'},503)}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const name=typeof d?.name==='string'?d.name.trim():'';const jersey=typeof d?.jersey==='string'&&d.jersey.trim()?d.jersey.trim():null;const team=typeof d?.team==='string'&&d.team.trim()?d.team.trim():null;
 if(!isUuid(d?.event)||!name||name.length>100||(jersey&&jersey.length>12)||(team&&team.length>100))return send({message:'กรอกข้อมูลนักฟุตบอลให้ครบ'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const q=await client.query(`INSERT INTO fg_players(event_id,name,jersey,team,visible) SELECT id,$2,$3,$4,false FROM fg_events WHERE id=$1 RETURNING id,name,jersey,team,visible`,[d.event,name,jersey,team]);
  if(!q.rowCount)throw Error('EVENT_NOT_FOUND');
  await audit(client,{adminId:admin.id,eventId:d.event,action:'player.create',resourceId:q.rows[0].id});
  await client.query('COMMIT');return send({player:q.rows[0]},201);
 }catch(e){await client.query('ROLLBACK');return send({message:e.message==='EVENT_NOT_FOUND'?'ไม่พบงาน':'เพิ่มนักฟุตบอลไม่สำเร็จ'},e.message==='EVENT_NOT_FOUND'?404:503)}finally{client.release()}
}
