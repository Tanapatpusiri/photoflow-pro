import {NextResponse} from 'next/server';
import {db,configured,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const send=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function GET(request){
 if(!configured())return send({message:'ระบบยังไม่พร้อม'},503);
 const admin=await authenticated(request);if(!admin)return send({message:'ไม่มีสิทธิ์'},401);
 const event=request.nextUrl.searchParams.get('event');
 if(!/^[0-9a-f-]{36}$/i.test(event||''))return send({message:'กรุณาเลือกงาน'},400);
 try{const q=await db().query('SELECT id,name,jersey,team,visible FROM fg_players WHERE event_id=$1 ORDER BY team,jersey,name',[event]);return send({players:q.rows})}catch{return send({message:'อ่านข้อมูลไม่สำเร็จ'},503)}
}
export async function POST(request){
 if(!configured())return send({message:'ยังไม่พร้อม'},503);
 if(request.headers.get('origin')!==new URL(request.url).origin)return send({message:'ต้นทางไม่ถูกต้อง'},403);
 const admin=await authenticated(request);if(!admin)return send({message:'ไม่มีสิทธิ์'},401);
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const name=typeof d.name==='string'?d.name.trim():'';const jersey=typeof d.jersey==='string'?d.jersey.trim():null;const team=typeof d.team==='string'?d.team.trim():null;
 if(!/^[0-9a-f-]{36}$/i.test(d.event||'')||!name||name.length>100||(jersey&&jersey.length>12)||(team&&team.length>100))return send({message:'กรอกข้อมูลนักฟุตบอลให้ครบ'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const q=await client.query(`INSERT INTO fg_players(event_id,name,jersey,team,visible) SELECT id,$2,$3,$4,false FROM fg_events WHERE id=$1 RETURNING *`,[d.event,name,jersey,team]);
  if(!q.rowCount)throw Error('EVENT_NOT_FOUND');
  await client.query('INSERT INTO fg_audit(admin_id,event_id,action,resource_id) VALUES($1,$2,$3,$4)',[admin.id,d.event,'player.create',q.rows[0].id]);
  await client.query('COMMIT');return send({player:q.rows[0]},201);
 }catch(e){await client.query('ROLLBACK');return send({message:'เพิ่มนักฟุตบอลไม่สำเร็จ'},503)}finally{client.release()}
}
