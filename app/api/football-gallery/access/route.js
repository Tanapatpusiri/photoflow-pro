import {NextResponse} from 'next/server';
import {db,configured,sha256,clientIp,rateLimit,setGrantCookie,privateHeaders} from '../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../lib/football-gallery-retention';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const result=(body,status)=>NextResponse.json(body,{status,headers:privateHeaders});
// Parents may type the code with spaces or dashes; stored codes are uppercase letters/digits only.
const normalizeCode=value=>typeof value==='string'?value.toUpperCase().replace(/[\s-]/g,''):'';
export async function POST(request){
 if(!configured())return result({message:'อัลบั้มยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแล'},503);
 if(Number(request.headers.get('content-length')||0)>4096)return result({message:'ข้อมูลใหญ่เกินไป'},413);
 let body;try{body=await request.json()}catch{return result({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const code=normalizeCode(body?.code);
 if(code.length<6||code.length>100||!/^[A-Z0-9]+$/.test(code))return result({message:'กรุณาตรวจสอบรหัสอัลบั้ม'},400);
 try{
  if(!await rateLimit('event-code',clientIp(request),8,15))return result({message:'ลองใหม่อีกครั้งในภายหลัง'},429);
  const hash=sha256(process.env.FG_SESSION_SECRET+':code:'+code);
  const found=await db().query(`SELECT c.id AS code_id,e.id AS event_id,e.slug FROM fg_event_codes c JOIN fg_events e ON e.id=c.event_id WHERE c.code_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>NOW() AND e.status='published' AND e.privacy_approved_at IS NOT NULL AND ${ACTIVE_RETENTION_SQL} LIMIT 1`,[hash]);
  if(!found.rowCount)return result({message:'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาติดต่อผู้จัดงาน'},403);
  const {event_id,code_id,slug}=found.rows[0];
  return setGrantCookie(result({redirect:'/football-gallery/'+encodeURIComponent(slug)},200),event_id,code_id);
 }catch(e){console.error('fg access storage unavailable',e?.code||'unknown');return result({message:'ระบบยังไม่พร้อมให้เข้าชม กรุณาติดต่อผู้ดูแล'},503)}
}
