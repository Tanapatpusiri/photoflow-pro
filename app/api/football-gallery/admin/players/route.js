import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const event=request.nextUrl.searchParams.get('event');
 if(!isUuid(event))return send({message:'กรุณาเลือกงาน'},400);
 try{
  const q=await db().query(`SELECT p.id,p.name,p.jersey,p.team,p.visible,p.registry_id,p.age_group,
   (SELECT COUNT(*)::int FROM fg_media_players mp WHERE mp.player_id=p.id) AS photos,
   (SELECT COUNT(*)::int FROM fg_media_players mp JOIN fg_media m ON m.id=mp.media_id WHERE mp.player_id=p.id AND m.status='published') AS published_photos,
   EXISTS(SELECT 1 FROM fg_privacy_records r WHERE r.event_id=p.event_id AND r.player_id=p.id AND r.revoked_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM fg_privacy_records r WHERE r.event_id=p.event_id AND r.player_id=p.id AND r.scope='private_gallery' AND r.reviewed_at IS NOT NULL AND r.revoked_at IS NULL) AS consent_withdrawn,
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

const clean=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max+1):null;
// Edit a child's name, shirt number or team.
export async function PATCH(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const name=clean(d?.name,100),jersey=clean(d?.jersey,12),team=clean(d?.team,100);
 if(!isUuid(d?.player)||!name||name.length>100||(jersey&&jersey.length>12)||(team&&team.length>100))return send({message:'กรอกชื่อเด็กให้ถูกต้อง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const q=await client.query('UPDATE fg_players SET name=$2,jersey=$3,team=$4 WHERE id=$1 RETURNING id,event_id,name,jersey,team,visible',[d.player,name,jersey,team]);
  if(!q.rowCount)throw Error('NOT_FOUND');
  await audit(client,{adminId:admin.id,eventId:q.rows[0].event_id,action:'player.update',resourceId:d.player});
  await client.query('COMMIT');const {event_id,...player}=q.rows[0];return send({player});
 }catch(e){await client.query('ROLLBACK');return send({message:e.message==='NOT_FOUND'?'ไม่พบเด็กคนนี้':'แก้ไขไม่สำเร็จ'},e.message==='NOT_FOUND'?404:503)}finally{client.release()}
}
// Remove a child added by mistake. Children with published photos or any consent history are kept,
// so the record of what was shared stays intact; withdraw consent for them instead.
export async function DELETE(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 const player=request.nextUrl.searchParams.get('player');
 if(!isUuid(player))return send({message:'ข้อมูลไม่ถูกต้อง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const p=await client.query('SELECT id,event_id FROM fg_players WHERE id=$1 FOR UPDATE',[player]);
  if(!p.rowCount)throw Error('NOT_FOUND');
  const used=await client.query(`SELECT EXISTS(SELECT 1 FROM fg_media_players mp JOIN fg_media m ON m.id=mp.media_id WHERE mp.player_id=$1 AND m.status='published') AS published,EXISTS(SELECT 1 FROM fg_privacy_records WHERE player_id=$1) AS history`,[player]);
  if(used.rows[0].published||used.rows[0].history)throw Error('IN_USE');
  // Tags on photos that are not published yet are removed with the child (ON DELETE CASCADE).
  await client.query('DELETE FROM fg_players WHERE id=$1',[player]);
  await audit(client,{adminId:admin.id,eventId:p.rows[0].event_id,action:'player.delete',resourceId:player});
  await client.query('COMMIT');return send({ok:true});
 }catch(e){await client.query('ROLLBACK');const m={NOT_FOUND:['ไม่พบเด็กคนนี้',404],IN_USE:['ลบไม่ได้ เพราะเด็กคนนี้มีภาพที่เผยแพร่แล้วหรือมีประวัติความยินยอม ใช้ "ถอนความยินยอม" แทน',409]}[e.message]||['ลบไม่สำเร็จ',503];return send({message:m[0]},m[1])}finally{client.release()}
}
