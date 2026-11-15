import {createHmac,scryptSync,timingSafeEqual,randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db,configured,sameOrigin,privateHeaders} from './football-gallery-server';

const signing=data=>createHmac('sha256',process.env.FG_SESSION_SECRET).update('admin:'+data).digest('base64url');
export const ADMIN_COOKIE='fg_admin';
export function hashAdminPassword(password,salt=randomBytes(16).toString('hex')){
 if(typeof password!=='string'||password.length<14)throw Error('Admin password must be at least 14 chars');
 return 'scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
}
// Used when the e-mail is unknown so response time does not reveal which accounts exist.
const DUMMY_HASH='scrypt$'+'0'.repeat(32)+'$'+'0'.repeat(128);
export function verifyAdminPassword(password,encoded){
 if(typeof password!=='string')return false;
 const real=typeof encoded==='string';
 const [type,salt,hash]=(real?encoded:DUMMY_HASH).split('$');
 if(type!=='scrypt'||!salt||!hash||!(/^[0-9a-f]{128}$/i.test(hash)))return false;
 try{const match=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'));return real&&match}catch{return false}
}
export function issueAdminSession(admin){
 if(!configured())throw Error('Not configured');
 const payload=Buffer.from(JSON.stringify({id:admin.id,until:Date.now()+4*60*60*1000})).toString('base64url');
 return payload+'.'+signing(payload);
}
export async function getAdmin(cookie){
 if(!configured()||!cookie||typeof cookie!=='string'||cookie.length>1500)return null;
 const [payload,sig,...extra]=cookie.split('.');
 if(!payload||!sig||extra.length)return null;
 const expected=signing(payload);
 if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 try{
  const d=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!d.id||!Number.isFinite(d.until)||d.until<Date.now())return null;
  const q=await db().query('SELECT id,email,role FROM fg_admins WHERE id=$1 AND enabled=true',[d.id]);
  return q.rows[0]||null;
 }catch{return null}
}
export async function authenticated(request){
 return getAdmin(request.cookies.get(ADMIN_COOKIE)?.value);
}
export const adminReply=(body,status=200)=>NextResponse.json(body,{status,headers:privateHeaders});
// Common guard for admin endpoints: configuration, same-origin for mutations, valid session.
export async function adminGuard(request,{mutation=false}={}){
 if(!configured())return {error:adminReply({message:'ระบบหลังบ้านยังไม่ได้ตั้งค่า'},503)};
 if(mutation&&!sameOrigin(request))return {error:adminReply({message:'ต้นทางคำขอไม่ถูกต้อง'},403)};
 const admin=await authenticated(request);
 if(!admin)return {error:adminReply({message:'ไม่มีสิทธิ์'},401)};
 return {admin};
}
export async function audit(client,{adminId=null,eventId=null,action,resourceId=null,detail=null}){
 await (client||db()).query('INSERT INTO fg_audit(admin_id,event_id,action,resource_id,detail) VALUES($1,$2,$3,$4,$5)',[adminId,eventId,action,resourceId,detail?JSON.stringify(detail):null]);
}
