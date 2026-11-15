import {db} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
import {RETENTION_MONTHS_KEY,RETENTION_SETTINGS_LOCK,readRetentionMonths} from '../../../../../lib/football-gallery-retention-settings';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 const {admin,error}=await adminGuard(request);if(error)return error;
 try{return reply({months:await readRetentionMonths(db()),canEdit:admin.role==='owner'})}
 catch(e){console.error('fg retention settings',e?.code||'invalid');if(e?.message==='INVALID_RETENTION_SETTING')return reply({message:'ระยะเวลาที่บันทึกไม่ถูกต้อง เจ้าของต้องตั้งค่าใหม่ก่อนเผยแพร่',invalid:true,canEdit:admin.role==='owner'},503);return reply({message:'อ่านระยะเวลาไม่สำเร็จ กรุณาติดต่อเจ้าของระบบ'},503)}
}
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่ตั้งระยะเวลาได้'},403);
 let d;try{d=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!Number.isInteger(d?.months)||d.months<1||d.months>12)return reply({message:'กรุณาเลือกระยะเวลา 1 ถึง 12 เดือน'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');await client.query(RETENTION_SETTINGS_LOCK);
  let previous;try{previous=await readRetentionMonths(client)}catch{previous=null}
  await client.query('INSERT INTO fg_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',[RETENTION_MONTHS_KEY,String(d.months)]);
  await audit(client,{adminId:admin.id,action:'retention.period_changed',detail:{previousMonths:previous,months:d.months}});
  await client.query('COMMIT');return reply({ok:true,months:d.months});
 }catch(e){await client.query('ROLLBACK');console.error('fg retention settings save',e?.code||'unknown');return reply({message:'บันทึกระยะเวลาไม่สำเร็จ'},503)}finally{client.release()}
}
