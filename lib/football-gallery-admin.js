import {createHmac,scryptSync,timingSafeEqual,randomBytes} from 'node:crypto';
import {db,configured} from './football-gallery-server';

const signing=data=>createHmac('sha256',process.env.FG_SESSION_SECRET).update('admin:'+data).digest('base64url');
export function hashAdminPassword(password,salt=randomBytes(16).toString('hex')){
 if(typeof password!=='string'||password.length<14)throw Error('Admin password must be at least 14 chars');
 return 'scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
}
export function verifyAdminPassword(password,encoded){
 if(typeof password!=='string'||typeof encoded!=='string')return false;
 const [type,salt,hash]=encoded.split('$');
 if(type!=='scrypt'||!salt||!hash||!(/^[0-9a-f]{128}$/i.test(hash)))return false;
 try{return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'))}catch{return false}
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
 const admin=await getAdmin(request.cookies.get('fg_admin')?.value);
 return admin;
}
