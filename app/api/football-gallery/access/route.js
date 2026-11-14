import {NextResponse} from 'next/server';
import {db,configured,issueGrant,sha256,privateHeaders} from '../../../../lib/football-gallery-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const result=(body,status)=>NextResponse.json(body,{status,headers:privateHeaders});
export async function POST(request){
 if(!configured())return result({message:'อัลบั้มยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแล'},503);
 if(Number(request.headers.get('content-length')||0)>4096)return result({message:'ข้อมูลใหญ่เกินไป'},413);
 let body;try{body=await request.json()}catch{return result({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const code=typeof body?.code==='string'?body.code.trim().toUpperCase():'';
 if(code.length<6||code.length>100)return result({message:'กรุณาตรวจสอบรหัสอัลบั้ม'},400);
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
 const key=sha256(process.env.FG_SESSION_SECRET+':rate:'+ip);
 try{
  const limit=await db().query(`INSERT INTO fg_rate_limits(key,attempts,reset_at) VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN fg_rate_limits.reset_at<NOW() THEN 1 ELSE fg_rate_limits.attempts+1 END, reset_at=CASE WHEN fg_rate_limits.reset_at<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE fg_rate_limits.reset_at END RETURNING attempts`,[key]);
  if(limit.rows[0].attempts>8)return result({message:'ลองใหม่อีกครั้งในภายหลัง'},429);
  const hash=sha256(process.env.FG_SESSION_SECRET+':code:'+code);
  const found=await db().query(`SELECT c.id AS code_id,e.id AS event_id,e.slug FROM fg_event_codes c JOIN fg_events e ON e.id=c.event_id WHERE c.code_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>NOW() AND e.status='published' LIMIT 1`,[hash]);
  if(!found.rowCount)return result({message:'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาติดต่อผู้จัดงาน'},403);
  const {event_id,code_id,slug}=found.rows[0];
  const response=result({redirect:'/football-gallery/'+encodeURIComponent(slug)},200);
  response.cookies.set('fg_grant',issueGrant(event_id,code_id),{httpOnly:true,secure:true,sameSite:'lax',maxAge:43200,path:'/football-gallery'});
  return response;
 }catch(e){console.error('fg access storage unavailable',e?.code||'unknown');return result({message:'ระบบยังไม่พร้อมให้เข้าชม กรุณาติดต่อผู้ดูแล'},503)}
}
