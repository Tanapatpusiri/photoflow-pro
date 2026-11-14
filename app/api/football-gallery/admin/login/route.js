import {NextResponse} from 'next/server';
import {db,configured,clientIp,rateLimit,rateLimitCount,sameOrigin,privateHeaders} from '../../../../../lib/football-gallery-server';
import {verifyAdminPassword,issueAdminSession,ADMIN_COOKIE,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const response=(body,status)=>NextResponse.json(body,{status,headers:privateHeaders});
export async function POST(request){
 if(!configured())return response({message:'หลังบ้านยังไม่ได้ตั้งค่า'},503);
 if(Number(request.headers.get('content-length')||0)>4096)return response({message:'ข้อมูลไม่ถูกต้อง'},413);
 let body;try{body=await request.json()}catch{return response({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
 const password=body?.password;
 if(email.length>200||!email.includes('@')||typeof password!=='string'||password.length>256)return response({message:'ข้อมูลบัญชีไม่ถูกต้อง'},400);
 try{
  // Every attempt counts per client IP; only failed attempts count per account (20 per hour),
  // so one account cannot be brute forced from many IPs and successful sign-ins never lock it.
  const [byIp,accountFailures]=await Promise.all([rateLimit('admin-login-ip',clientIp(request),5,15),rateLimitCount('admin-login-account',email)]);
  if(!byIp||accountFailures>=20)return response({message:'ลองเข้าสู่ระบบใหม่ในภายหลัง'},429);
  const q=await db().query('SELECT id,email,role,password_hash FROM fg_admins WHERE email=$1 AND enabled=true',[email]);
  const valid=verifyAdminPassword(password,q.rows[0]?.password_hash);
  if(!q.rowCount||!valid){await rateLimit('admin-login-account',email,20,60);return response({message:'อีเมลหรือรหัสผ่านไม่ถูกต้อง'},401)}
  const admin=q.rows[0];
  await audit(null,{adminId:admin.id,action:'admin.login'});
  const r=response({ok:true,role:admin.role},200);
  r.cookies.set(ADMIN_COOKIE,issueAdminSession(admin),{httpOnly:true,secure:true,sameSite:'strict',maxAge:14400,path:'/'});
  return r;
 }catch(err){console.error('fg admin login',err?.code||'unknown');return response({message:'ไม่สามารถเข้าใช้งานหลังบ้าน'},503)}
}
export async function DELETE(request){
 if(!sameOrigin(request))return response({message:'ต้นทางคำขอไม่ถูกต้อง'},403);
 const r=response({ok:true},200);
 r.cookies.set(ADMIN_COOKIE,'',{httpOnly:true,secure:true,sameSite:'strict',maxAge:0,path:'/'});
 return r;
}
