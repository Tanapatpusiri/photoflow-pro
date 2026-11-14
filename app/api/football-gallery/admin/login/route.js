import {NextResponse} from 'next/server';
import {db,configured,sha256,privateHeaders} from '../../../../../lib/football-gallery-server';
import {verifyAdminPassword,issueAdminSession} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const response=(body,status)=>NextResponse.json(body,{status,headers:privateHeaders});
export async function POST(request){
 if(!configured())return response({message:'หลังบ้านยังไม่ได้ตั้งค่า'},503);
 if(Number(request.headers.get('content-length')||0)>4096)return response({message:'ข้อมูลไม่ถูกต้อง'},413);
 let body;try{body=await request.json()}catch{return response({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 const password=body.password;
 if(email.length>200||!email.includes('@')||typeof password!=='string'||password.length>256)return response({message:'ข้อมูลบัญชีไม่ถูกต้อง'},400);
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
 try{
  const key=sha256(process.env.FG_SESSION_SECRET+':admin-login:'+ip);
  const attempts=await db().query(`INSERT INTO fg_rate_limits(key,attempts,reset_at) VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN fg_rate_limits.reset_at<NOW() THEN 1 ELSE fg_rate_limits.attempts+1 END,reset_at=CASE WHEN fg_rate_limits.reset_at<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE fg_rate_limits.reset_at END RETURNING attempts`,[key]);
  if(attempts.rows[0].attempts>5)return response({message:'ลองเข้าสู่ระบบใหม่ในภายหลัง'},429);
  const q=await db().query('SELECT id,email,role,password_hash FROM fg_admins WHERE email=$1 AND enabled=true',[email]);
  if(!q.rowCount||!verifyAdminPassword(password,q.rows[0].password_hash))return response({message:'อีเมลหรือรหัสผ่านไม่ถูกต้อง'},401);
  const admin=q.rows[0];
  const r=response({ok:true,role:admin.role},200);
  r.cookies.set('fg_admin',issueAdminSession(admin),{httpOnly:true,secure:true,sameSite:'strict',maxAge:14400,path:'/'});
  return r;
 }catch(err){console.error('fg admin login',err?.code||'unknown');return response({message:'ไม่สามารถเข้าใช้งานหลังบ้าน'},503)}
}
