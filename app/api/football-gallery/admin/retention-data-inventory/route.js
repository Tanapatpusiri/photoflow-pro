import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
import {DELETION_ELIGIBLE_SQL} from '../../../../../lib/football-gallery-deletion-eligibility';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Counts only: no personal names, file names, audit contents, or external data.
// This is a preliminary inventory, not a deletion authorization or proof of erasure.
export async function GET(request){
 const {admin,error}=await adminGuard(request);if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่ตรวจข้อมูลได้'},403);
 const event=request.nextUrl.searchParams.get('event');if(!isUuid(event))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  const q=await db().query(`SELECT
   (SELECT COUNT(*)::int FROM fg_players p WHERE p.event_id=e.id) AS players,
   (SELECT COUNT(*)::int FROM fg_media m WHERE m.event_id=e.id) AS media,
   (SELECT COUNT(*)::int FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE m.event_id=e.id) AS files,
   (SELECT COUNT(*)::int FROM fg_media_players mp JOIN fg_media m ON m.id=mp.media_id WHERE m.event_id=e.id) AS tags,
   (SELECT COUNT(*)::int FROM fg_event_codes c WHERE c.event_id=e.id) AS codes,
   (SELECT COUNT(*)::int FROM fg_invites i WHERE i.event_id=e.id) AS invites,
   (SELECT COUNT(*)::int FROM fg_privacy_records p WHERE p.event_id=e.id) AS privacy_records,
   (SELECT COUNT(*)::int FROM fg_removal_requests r WHERE r.event_id=e.id) AS removal_requests,
   (SELECT COUNT(*)::int FROM fg_download_jobs j WHERE j.event_id=e.id) AS download_jobs,
   (SELECT COUNT(*)::int FROM fg_audit a WHERE a.event_id=e.id) AS audit_entries,
   (SELECT COUNT(*)::int FROM fg_retention_deletion_reviews r WHERE r.event_id=e.id) AS review_entries,
   (SELECT COUNT(*)::int FROM fg_settings s WHERE s.key='drive.preview_folder.'||e.id::text) AS folder_settings
   FROM fg_events e WHERE e.id=$1 AND ${DELETION_ELIGIBLE_SQL}`,[event]);
  if(!q.rowCount)return reply({message:'ตรวจได้เฉพาะงานที่หมดสิทธิ์เข้าถึงและผ่านวันที่กำหนดให้ตรวจเพื่อลบแล้ว'},409);
  return reply({counts:q.rows[0]});
 }catch(e){console.error('fg retention data inventory',e?.code||'unknown');return reply({message:'ตรวจข้อมูลไม่สำเร็จ กรุณาลองใหม่'},503)}
}
