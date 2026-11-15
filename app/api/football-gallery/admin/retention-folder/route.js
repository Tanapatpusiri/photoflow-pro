import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
import {listFolderPage} from '../../../../../lib/football-gallery-drive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const FOLDER='application/vnd.google-apps.folder';
export async function GET(request){
 const {admin,error}=await adminGuard(request);if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่ตรวจโฟลเดอร์ได้'},403);
 const sp=request.nextUrl.searchParams,event=sp.get('event'),scope=sp.get('scope')||'event',token=sp.get('token');
 if(!isUuid(event)||!['event','preview'].includes(scope)||(token!==null&&(!token||token.length>1500)))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  const ev=await db().query(`SELECT drive_folder_id FROM fg_events WHERE id=$1 AND event_date IS NOT NULL AND retention_until IS NOT NULL AND retention_until>event_date AND retention_until<=(event_date+INTERVAL '1 year')::date AND retention_until<CURRENT_DATE AND (event_date+INTERVAL '1 year')::date<CURRENT_DATE`,[event]);
  if(!ev.rowCount)return reply({message:'ตรวจได้เฉพาะงานที่ครบกำหนดและผ่านวันครบ 1 ปีหลังงาน'},409);
  const saved=await db().query('SELECT value FROM fg_settings WHERE key=$1',['drive.preview_folder.'+event]);
  const previewFolder=saved.rows[0]?.value||null,folder=scope==='event'?ev.rows[0].drive_folder_id:previewFolder;
  if(!folder)return reply({message:'ไม่มีโฟลเดอร์ที่บันทึกไว้สำหรับส่วนนี้ จึงยังตรวจไม่ได้'},409);
  const data=await listFolderPage(folder,token);
  const entries=Array.isArray(data?.files)?data.files:[];
  const ids=entries.filter(x=>x.mimeType!==FOLDER&&typeof x.id==='string').map(x=>x.id);
  const appIds=entries.map(x=>x.appProperties?.fgFileId).filter(isUuid);
  const records=ids.length?await db().query(`SELECT f.id,f.r2_key FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE m.event_id=$1 AND f.storage='drive' AND (f.r2_key=ANY($2::text[]) OR f.id=ANY($3::uuid[]))`,[event,ids,appIds]):{rows:[]};
  const known=new Map(records.rows.map(x=>[x.r2_key,x.id]));
  const byId=new Map(records.rows.map(x=>[x.id,x.r2_key]));
  const items=entries.map(x=>{const appId=x.appProperties?.fgFileId;let status;if(x.mimeType===FOLDER)status=x.id===previewFolder?'preview_folder':'other_folder';else if(known.has(x.id))status=known.get(x.id)===appId?'recorded':'identity_mismatch';else if(byId.has(appId))status=String(byId.get(appId)).startsWith('pending:')?'pending_record':'identity_mismatch';else status='untracked';return {name:x.name||'(ไม่มีชื่อ)',trashed:x.trashed===true,status}});
  return reply({items,nextToken:typeof data?.nextPageToken==='string'?data.nextPageToken:null,incomplete:data?.incompleteSearch===true,scope});
 }catch(e){console.error('fg retention folder',e?.code||'unknown');return reply({message:'ตรวจโฟลเดอร์ไม่สำเร็จ กรุณาลองใหม่'},503)}
}
