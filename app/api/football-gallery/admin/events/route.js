import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {db,configured,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const send=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
const originOk=request=>{const u=request.headers.get('origin');return !!u&&new URL(u).host===new URL(request.url).host};
export async function GET(request){
 if(!configured())return send({message:'ระบบหลังบ้านยังไม่ได้ตั้งค่า'},503);
 const admin=await authenticated(request);if(!admin)return send({message:'ไม่มีสิทธิ์'},401);
 try{const q=await db().query(`SELECT e.id,e.title,e.slug,e.venue,e.event_date,e.status,e.privacy_approved_at,COUNT(DISTINCT p.id)::int AS players,COUNT(DISTINCT m.id)::int AS media FROM fg_events e LEFT JOIN fg_players p ON p.event_id=e.id LEFT JOIN fg_media m ON m.event_id=e.id GROUP BY e.id ORDER BY e.created_at DESC LIMIT 100`);return send({events:q.rows})}catch{return send({message:'ไม่สามารถอ่านข้อมูล'},503)}
}
export async function POST(request){
 if(!configured())return send({message:'ยังไม่พร้อมใช้งาน'},503);
 if(!originOk(request))return send({message:'ต้นทางคำขอไม่ถูกต้อง'},403);
 const admin=await authenticated(request);if(!admin)return send({message:'ไม่มีสิทธิ์'},401);
 let d;try{d=await request.json()}catch{return send({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const title=typeof d.title==='string'?d.title.trim():'';const venue=typeof d.venue==='string'?d.venue.trim():null;
 const date=typeof d.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)?d.date:null;
 if(!title||title.length>180||(venue&&venue.length>180))return send({message:'กรุณากรอกชื่องาน'},400);
 const slug='event-'+randomBytes(10).toString('hex');
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const q=await client.query(`INSERT INTO fg_events(slug,title,venue,event_date,status) VALUES($1,$2,$3,$4,'draft') RETURNING id,slug,title`,[slug,title,venue,date]);
  await client.query('INSERT INTO fg_audit(admin_id,event_id,action) VALUES($1,$2,$3)',[admin.id,q.rows[0].id,'event.create']);
  await client.query('COMMIT');
  return send({event:q.rows[0]},201);
 }catch(e){await client.query('ROLLBACK');console.error('fg event creation',e.code||'unknown');return send({message:'สร้างงานไม่สำเร็จ'},503)}finally{client.release()}
}
