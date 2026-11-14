import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {db,configured,sha256,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:privateHeaders});
export async function POST(request){
 if(!configured())return reply({message:'ยังไม่ได้ตั้งค่า'},503);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({message:'ต้นทางไม่ถูกต้อง'},403);
 const admin=await authenticated(request);if(!admin)return reply({message:'ไม่มีสิทธิ์'},401);
 let body;try{body=await request.json()}catch{return reply({message:'คำขอไม่ถูกต้อง'},400)}
 if(!/^[a-f0-9-]{36}$/i.test(body.event||'')||!['code','invite'].includes(body.type))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  const e=await db().query("SELECT id,slug FROM fg_events WHERE id=$1 AND status='published' AND privacy_approved_at IS NOT NULL",[body.event]);
  if(!e.rowCount)return reply({message:'ต้องตรวจ PDPA และเผยแพร่งานก่อนสร้างลิงก์'},409);
  const expires=Number.isFinite(Number(body.days))?Math.max(1,Math.min(90,Number(body.days))):14;
  const client=await db().connect();
  try{
   await client.query('BEGIN');
   const token=body.type==='invite'?randomBytes(32).toString('base64url'):randomBytes(9).toString('hex').toUpperCase();
   const hash=sha256(process.env.FG_SESSION_SECRET+':'+(body.type==='invite'?'invite':'code')+':'+token);
   const table=body.type==='invite'?'fg_invites':'fg_event_codes';
   await client.query(`INSERT INTO ${table}(event_id,${body.type==='invite'?'token_hash':'code_hash'},expires_at) VALUES($1,$2,NOW()+($3::integer * INTERVAL '1 day'))`,[body.event,hash,expires]);
   await client.query('INSERT INTO fg_audit(admin_id,event_id,action) VALUES($1,$2,$3)',[admin.id,body.event,'grant.create-'+body.type]);
   await client.query('COMMIT');
   const origin=new URL(request.url).origin;
   return reply(body.type==='invite'?{url:origin+'/football-gallery/invite/'+encodeURIComponent(token),expiresDays:expires}:{code:token,expiresDays:expires},201);
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }catch(e){console.error('fg grant issuance',e?.code||'unknown');return reply({message:'สร้างลิงก์เข้าชมไม่สำเร็จ'},503)}
}
