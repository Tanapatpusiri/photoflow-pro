import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Read-only audit trail for one event (latest first).
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const event=request.nextUrl.searchParams.get('event');
 const before=Number(request.nextUrl.searchParams.get('before'))||null;
 if(!isUuid(event))return reply({message:'กรุณาเลือกงาน'},400);
 try{
  const q=await db().query(`SELECT a.id,a.action,a.resource_id,a.detail,a.created_at,ad.email AS admin FROM fg_audit a LEFT JOIN fg_admins ad ON ad.id=a.admin_id WHERE a.event_id=$1 AND ($2::bigint IS NULL OR a.id<$2) ORDER BY a.id DESC LIMIT 100`,[event,before]);
  return reply({entries:q.rows.map(r=>({...r,id:Number(r.id)}))});
 }catch(e){console.error('fg audit list',e?.code||'unknown');return reply({message:'โหลดประวัติไม่สำเร็จ'},503)}
}
