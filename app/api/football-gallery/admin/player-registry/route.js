import {NextResponse} from 'next/server';
import {db,isUuid,privateHeaders} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as send,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const fields='id,name,nickname,age_group,jersey,team,active,(profile_jpeg IS NOT NULL) AS has_profile,updated_at';
const clean=(v)=>typeof v==='string'?v.trim():'';
function validate(d){
 const name=clean(d.name),nickname=clean(d.nickname),age=clean(d.age_group).toUpperCase(),jersey=clean(d.jersey),team=clean(d.team);
 if(!name||name.length>100||nickname.length>100||team.length>100||!/^U[0-9]{1,2}$/.test(age)||! /^[0-9]{1,3}$/.test(jersey))return null;
 let photo=null;
 if(d.photo!==undefined&&d.photo!==null){
  if(typeof d.photo!=='string'||d.photo.length>409600||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(d.photo))return null;
  photo=Buffer.from(d.photo.split(',')[1],'base64');
  if(photo.length<4||photo.length>307200||photo[0]!==255||photo[1]!==216||photo[2]!==255||photo[photo.length-2]!==255||photo[photo.length-1]!==217)return null;
 }
 return {name,nickname:nickname||null,age,jersey,team:team||null,photo,replace:d.photo!==undefined,active:d.active!==false};
}
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const p=request.nextUrl.searchParams;
 try{
  if(p.has('photo')){
   const id=p.get('photo');if(!isUuid(id))return send({message:'ไม่พบรูป'},404);
   const q=await db().query('SELECT profile_jpeg FROM fg_player_registry WHERE id=$1',[id]);
   if(!q.rows[0]?.profile_jpeg)return send({message:'ไม่พบรูป'},404);
   return new NextResponse(q.rows[0].profile_jpeg,{headers:{...privateHeaders,'content-type':'image/jpeg','x-content-type-options':'nosniff'}});
  }
  const q=await db().query('SELECT '+fields+' FROM fg_player_registry ORDER BY active DESC,age_group,name,id');
  return send({players:q.rows});
 }catch(e){console.error('fg registry read',e?.code||'unknown');return send({message:'โหลดทะเบียนไม่สำเร็จ'},503)}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 if(Number(request.headers.get('content-length'))>450000)return send({message:'ไฟล์ใหญ่เกินกำหนด'},413);
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!d||typeof d!=='object')return send({message:'ข้อมูลไม่ถูกต้อง'},400);
 const link=d.action==='link';
 if(link&&(!isUuid(d.event)||!isUuid(d.registry_id)||(d.existing_player&&!isUuid(d.existing_player))))return send({message:'ข้อมูลไม่ถูกต้อง'},400);
 const v=link?null:validate(d);
 if(!link&&!v)return send({message:'กรอกชื่อ รุ่น U และเบอร์เสื้อให้ถูกต้อง รูปต้องเป็น JPEG ไม่เกิน 300 KB'},400);
 const c=await db().connect();
 try{
  await c.query('BEGIN');
  let row;
  if(link){
   const r=await c.query('SELECT id,name,jersey,team,age_group FROM fg_player_registry WHERE id=$1 AND active=true FOR SHARE',[d.registry_id]);
   const player=r.rows[0];if(!player)throw Error('NOT_FOUND');
   const e=await c.query("SELECT id FROM fg_events WHERE id=$1 AND status IN ('draft','published') FOR UPDATE",[d.event]);
   if(!e.rowCount)throw Error('NOT_FOUND');
   const prev=await c.query('SELECT id FROM fg_players WHERE event_id=$1 AND registry_id=$2',[d.event,player.id]);
   if(prev.rowCount)throw Error('ALREADY_LINKED');
   const q=d.existing_player?await c.query('UPDATE fg_players SET registry_id=$3,age_group=COALESCE(age_group,$4) WHERE id=$1 AND event_id=$2 AND registry_id IS NULL RETURNING id,name,jersey,team,age_group,visible',[d.existing_player,d.event,player.id,player.age_group]):await c.query('INSERT INTO fg_players(event_id,registry_id,name,jersey,team,age_group,visible) VALUES($1,$2,$3,$4,$5,$6,false) RETURNING id,name,jersey,team,age_group,visible',[d.event,player.id,player.name,player.jersey,player.team,player.age_group]);
   if(!q.rowCount)throw Error('NOT_FOUND');
   row=q.rows[0];
   await audit(c,{adminId:admin.id,eventId:d.event,action:'player.registry-link',resourceId:row.id});
  }else{
   const q=await c.query('INSERT INTO fg_player_registry(name,nickname,age_group,jersey,team,profile_jpeg,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING '+fields,[v.name,v.nickname,v.age,v.jersey,v.team,v.photo,v.active]);
   row=q.rows[0];await audit(c,{adminId:admin.id,action:'player.registry-create',resourceId:row.id});
  }
  await c.query('COMMIT');return send({player:row},201);
 }catch(e){await c.query('ROLLBACK');return send({message:e.message==='ALREADY_LINKED'||e.code==='23505'?'นักเตะนี้อยู่ในอัลบั้มแล้ว':e.message==='NOT_FOUND'?'ไม่พบนักเตะหรืองานที่เปิดให้แก้ไข':'บันทึกไม่สำเร็จ'},e.message==='ALREADY_LINKED'||e.code==='23505'?409:e.message==='NOT_FOUND'?404:503)}finally{c.release()}
}
export async function PATCH(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 if(Number(request.headers.get('content-length'))>450000)return send({message:'ไฟล์ใหญ่เกินกำหนด'},413);
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const v=d&&validate(d);if(!v||!isUuid(d.id))return send({message:'ข้อมูลไม่ถูกต้อง'},400);
 const c=await db().connect();
 try{
  await c.query('BEGIN');
  const q=await c.query('UPDATE fg_player_registry SET name=$2,nickname=$3,age_group=$4,jersey=$5,team=$6,active=$7,profile_jpeg=CASE WHEN $8 THEN $9::bytea ELSE profile_jpeg END,updated_at=now() WHERE id=$1 RETURNING '+fields,[d.id,v.name,v.nickname,v.age,v.jersey,v.team,v.active,v.replace,v.photo]);
  if(!q.rowCount)throw Error('NOT_FOUND');
  await audit(c,{adminId:admin.id,action:'player.registry-update',resourceId:d.id});
  await c.query('COMMIT');return send({player:q.rows[0]});
 }catch(e){await c.query('ROLLBACK');return send({message:e.message==='NOT_FOUND'?'ไม่พบนักเตะ':'แก้ไขไม่สำเร็จ'},e.message==='NOT_FOUND'?404:503)}finally{c.release()}
}
