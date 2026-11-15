import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
import {fileMeta} from '../../../../../lib/football-gallery-drive';
import {inspectRecordedFiles} from '../../../../../lib/football-gallery-retention-inventory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PAGE=12;
export async function GET(request){
 const {admin,error}=await adminGuard(request);if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่ตรวจที่เก็บได้'},403);
 const sp=request.nextUrl.searchParams,event=sp.get('event'),raw=sp.get('page')||'1';
 if(!isUuid(event)||!/^[1-9]\d{0,4}$/.test(raw))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 const page=Number(raw);
 try{
  const ev=await db().query(`SELECT drive_folder_id FROM fg_events WHERE id=$1 AND event_date IS NOT NULL AND retention_until IS NOT NULL AND retention_until>event_date AND retention_until<=(event_date+INTERVAL '1 year')::date AND retention_until<CURRENT_DATE AND (event_date+INTERVAL '1 year')::date<CURRENT_DATE`,[event]);
  if(!ev.rowCount)return reply({message:'ตรวจได้เฉพาะงานที่ครบกำหนดและผ่านวันครบ 1 ปีหลังงาน'},409);
  const folder=await db().query('SELECT value FROM fg_settings WHERE key=$1',['drive.preview_folder.'+event]);
  const q=await db().query(`SELECT f.id,f.variant,f.original_filename,f.storage,f.r2_key,f.upload_id,f.size_bytes,f.sha256 FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE m.event_id=$1 ORDER BY f.id LIMIT $2 OFFSET $3`,[event,PAGE+1,(page-1)*PAGE]);
  const items=await inspectRecordedFiles(q.rows.slice(0,PAGE),[ev.rows[0].drive_folder_id,folder.rows[0]?.value],fileMeta);
  return reply({items,page,hasMore:q.rows.length>PAGE});
 }catch(e){console.error('fg retention inventory',e?.code||'unknown');return reply({message:'ตรวจรายการไฟล์ไม่สำเร็จ กรุณาลองใหม่'},503)}
}
