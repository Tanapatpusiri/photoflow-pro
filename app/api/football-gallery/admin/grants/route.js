import {randomBytes} from 'node:crypto';
import {db,isUuid,sha256,PUBLIC_GRANT_LABEL} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Event codes avoid look-alike characters (0/O, 1/I/L) so parents can type them from a LINE message.
const CODE_ALPHABET='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function eventCode(length=12){
 const out=[];
 while(out.length<length){for(const b of randomBytes(length*2)){if(b<CODE_ALPHABET.length*8&&out.length<length)out.push(CODE_ALPHABET[b%CODE_ALPHABET.length])}}
 return out.join('');
}
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const event=request.nextUrl.searchParams.get('event');
 if(!isUuid(event))return reply({message:'กรุณาเลือกงาน'},400);
 try{
  // Only metadata is listed: tokens and codes are stored as hashes and can never be shown again.
  const q=await db().query(`SELECT id,'invite' AS type,label,created_at,expires_at,revoked_at FROM fg_invites WHERE event_id=$1
   UNION ALL SELECT id,'code',label,created_at,expires_at,revoked_at FROM fg_event_codes WHERE event_id=$1 AND label IS DISTINCT FROM $2 ORDER BY created_at DESC LIMIT 200`,[event,PUBLIC_GRANT_LABEL]);
  return reply({grants:q.rows.map(g=>({...g,active:!g.revoked_at&&new Date(g.expires_at)>new Date()}))});
 }catch(e){console.error('fg grant list',e?.code||'unknown');return reply({message:'โหลดลิงก์เข้าชมไม่สำเร็จ'},503)}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let body;try{body=await request.json()}catch{return reply({message:'คำขอไม่ถูกต้อง'},400)}
 if(!isUuid(body?.event))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  if(body.action==='revoke'){
   if(!isUuid(body.grantId)||!['code','invite'].includes(body.type))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
   const table=body.type==='invite'?'fg_invites':'fg_event_codes';
   const r=await db().query(`UPDATE ${table} SET revoked_at=NOW() WHERE id=$1 AND event_id=$2 AND revoked_at IS NULL`,[body.grantId,body.event]);
   if(!r.rowCount)return reply({message:'ไม่พบลิงก์ หรือถูกยกเลิกแล้ว'},404);
   await audit(null,{adminId:admin.id,eventId:body.event,action:'grant.revoke-'+body.type,resourceId:body.grantId});
   return reply({ok:true});
  }
  if(!['code','invite'].includes(body.type))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
  const label=typeof body.label==='string'&&body.label.trim()&&body.label.trim()!==PUBLIC_GRANT_LABEL?body.label.trim().slice(0,80):null;
  const e=await db().query("SELECT id FROM fg_events WHERE id=$1 AND status='published' AND privacy_approved_at IS NOT NULL",[body.event]);
  if(!e.rowCount)return reply({message:'ต้องตรวจ PDPA และเผยแพร่งานก่อนสร้างลิงก์'},409);
  const days=Number.isFinite(Number(body.days))?Math.max(1,Math.min(90,Math.round(Number(body.days)))):14;
  const token=body.type==='invite'?randomBytes(32).toString('base64url'):eventCode();
  const hash=sha256(process.env.FG_SESSION_SECRET+':'+(body.type==='invite'?'invite':'code')+':'+token);
  const client=await db().connect();
  let id;
  try{
   await client.query('BEGIN');
   const table=body.type==='invite'?'fg_invites':'fg_event_codes',column=body.type==='invite'?'token_hash':'code_hash';
   const q=await client.query(`INSERT INTO ${table}(event_id,${column},expires_at,label,created_by) VALUES($1,$2,NOW()+($3::integer * INTERVAL '1 day'),$4,$5) RETURNING id`,[body.event,hash,days,label,admin.id]);
   id=q.rows[0].id;
   await audit(client,{adminId:admin.id,eventId:body.event,action:'grant.create-'+body.type,resourceId:id,detail:{days}});
   await client.query('COMMIT');
  }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
  if(body.type==='code')return reply({id,code:token.replace(/(.{4})(?=.)/g,'$1-'),expiresDays:days},201);
  const url=new URL('/football-gallery/invite/'+encodeURIComponent(token),request.url);
  // LINE opens links with openExternalBrowser=1 in Safari/Chrome, which handles large downloads better.
  const external=new URL(url);external.searchParams.set('openExternalBrowser','1');
  return reply({id,url:url.toString(),externalUrl:external.toString(),expiresDays:days},201);
 }catch(e){console.error('fg grant issuance',e?.code||'unknown');return reply({message:'สร้างลิงก์เข้าชมไม่สำเร็จ'},503)}
}
