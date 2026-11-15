import {randomBytes} from 'node:crypto';
import {db,isUuid,sha256} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// Public access is opt-in per event. Events without a setting stay private.
export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 if(admin.role!=='owner')return reply({message:'เฉพาะเจ้าของเท่านั้นที่เปลี่ยนสิทธิ์ได้'},403);
 let data;try{data=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 if(!isUuid(data?.eventId)||typeof data.public!=='boolean'||(data.public&&(data.confirmed!==true||typeof data.notice!=='string'||data.notice.trim().length<40||data.notice.length>10000)))return reply({message:'กรุณายืนยันสิทธิ์สาธารณะและระบุข้อความแจ้งผู้ปกครองอย่างน้อย 40 ตัวอักษร'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const event=await client.query('SELECT status,privacy_approved_at,privacy_notice FROM fg_events WHERE id=$1 FOR UPDATE',[data.eventId]);
  if(!event.rowCount){await client.query('ROLLBACK');return reply({message:'ไม่พบอัลบั้ม'},404)}
  if(data.public&&(event.rows[0].status!=='published'||!event.rows[0].privacy_approved_at)){await client.query('ROLLBACK');return reply({message:'ต้องเผยแพร่และตรวจสิทธิ์ก่อนเปิดสาธารณะ'},409)}
  const key='album.public.'+data.eventId;
  const old=await client.query('SELECT value FROM fg_settings WHERE key=$1',[key]);
  if(old.rows[0]?.value)await client.query('UPDATE fg_event_codes SET revoked_at=NOW() WHERE id::text=$1 AND event_id=$2 AND revoked_at IS NULL',[old.rows[0].value,data.eventId]);
  if(data.public){
   if(!old.rowCount)await client.query('INSERT INTO fg_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',['album.private_notice.'+data.eventId,event.rows[0].privacy_notice||'']);
   await client.query('UPDATE fg_events SET privacy_notice=$2,updated_at=NOW() WHERE id=$1',[data.eventId,data.notice.trim()]);
   const secret=randomBytes(32).toString('hex');
   const code=await client.query("INSERT INTO fg_event_codes(event_id,code_hash,expires_at,label,created_by) VALUES($1,$2,NOW()+INTERVAL '100 years','สิทธิ์อัลบั้มสาธารณะ',$3) RETURNING id",[data.eventId,sha256(process.env.FG_SESSION_SECRET+':public:'+secret),admin.id]);
   await client.query('INSERT INTO fg_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',[key,code.rows[0].id]);
  }else{
   const previous=await client.query('SELECT value FROM fg_settings WHERE key=$1',['album.private_notice.'+data.eventId]);
   if(previous.rowCount)await client.query('UPDATE fg_events SET privacy_notice=$2,updated_at=NOW() WHERE id=$1',[data.eventId,previous.rows[0].value]);
   await client.query('DELETE FROM fg_settings WHERE key=ANY($1::text[])',[[key,'album.private_notice.'+data.eventId]]);
  }
  await audit(client,{adminId:admin.id,eventId:data.eventId,action:'event.visibility',detail:{public:data.public}});
  await client.query('COMMIT');return reply({ok:true});
 }catch(e){await client.query('ROLLBACK');console.error('fg visibility',e?.code||'unknown');return reply({message:'เปลี่ยนการเข้าถึงไม่สำเร็จ'},503)}finally{client.release()}
}
