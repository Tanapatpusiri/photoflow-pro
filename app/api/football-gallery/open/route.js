import {NextResponse} from 'next/server';
import {db,configured,clientIp,rateLimit,sameOrigin,setGrantCookie,privateHeaders} from '../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../lib/football-gallery-retention';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const result=(body,status)=>NextResponse.json(body,{status,headers:privateHeaders});
// Opening an unlocked album: hands out the album's system grant as the usual grant cookie.
export async function POST(request){
 if(!configured())return result({message:'อัลบั้มยังไม่เปิดใช้งาน'},503);
 if(!sameOrigin(request))return result({message:'คำขอไม่ถูกต้อง'},403);
 let body;try{body=await request.json()}catch{return result({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const slug=typeof body?.slug==='string'?body.slug:'';
 if(!slug||slug.length>140)return result({message:'ไม่พบอัลบั้ม'},404);
 try{
  if(!await rateLimit('album-open',clientIp(request),60,15))return result({message:'ลองใหม่อีกครั้งในภายหลัง'},429);
  const q=await db().query(`SELECT e.id,e.public_grant_id FROM fg_events e JOIN fg_event_codes c ON c.id=e.public_grant_id AND c.revoked_at IS NULL AND c.expires_at>NOW() WHERE e.slug=$1 AND e.locked=false AND e.status='published' AND e.privacy_approved_at IS NOT NULL AND ${ACTIVE_RETENTION_SQL}`,[slug]);
  if(!q.rowCount)return result({message:'อัลบั้มนี้ต้องใช้รหัสจากผู้จัดงาน',needsCode:true},403);
  return setGrantCookie(result({ok:true},200),q.rows[0].id,q.rows[0].public_grant_id);
 }catch(e){console.error('fg album open',e?.code||'unknown');return result({message:'ระบบยังไม่พร้อม กรุณาลองใหม่'},503)}
}
