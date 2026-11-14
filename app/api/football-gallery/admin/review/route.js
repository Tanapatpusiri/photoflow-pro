import {NextResponse} from 'next/server';
import {db,configured,privateHeaders} from '../../../../../lib/football-gallery-server';
import {authenticated} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function POST(request){
 if(!configured())return reply({message:'ระบบยังไม่พร้อม'},503);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({message:'ต้นทางไม่ถูกต้อง'},403);
 const admin=await authenticated(request);if(!admin)return reply({message:'ไม่มีสิทธิ์'},401);
 let d;try{d=await request.json()}catch{return reply({message:'คำขอไม่ถูกต้อง'},400)}
 const action=d.action,id=d.mediaId,eventId=d.eventId;
 if(!/^[0-9a-f-]{36}$/i.test(eventId||''))return reply({message:'รหัสงานไม่ถูกต้อง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const ev=await client.query('SELECT id,status FROM fg_events WHERE id=$1 FOR UPDATE',[eventId]);
  if(!ev.rowCount)throw Error('EVENT_NOT_FOUND');
  if(action==='hide'){
   if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('INVALID_MEDIA');
   await client.query("UPDATE fg_media SET status='hidden',publish_allowed=false WHERE id=$1 AND event_id=$2",[id,eventId]);
  }else if(action==='tag'){
   if(!/^[0-9a-f-]{36}$/i.test(id||'')||!Array.isArray(d.players)||d.players.length>100||d.players.some(x=>!/^[0-9a-f-]{36}$/i.test(x)))throw Error('INVALID_TAGS');
   const ok=await client.query('SELECT id FROM fg_media WHERE id=$1 AND event_id=$2',[id,eventId]);if(!ok.rowCount)throw Error('MEDIA_NOT_FOUND');
   await client.query('DELETE FROM fg_media_players WHERE media_id=$1',[id]);
   for(const p of [...new Set(d.players)]){
    const q=await client.query('SELECT id FROM fg_players WHERE id=$1 AND event_id=$2',[p,eventId]);if(!q.rowCount)throw Error('WRONG_EVENT_PLAYER');
    await client.query('INSERT INTO fg_media_players(media_id,player_id) VALUES($1,$2)',[id,p]);
   }
  }else if(action==='approve'){
   const basis=typeof d.basis==='string'?d.basis.trim():'',evidence=typeof d.evidence==='string'?d.evidence.trim():'';
   if(!/^[0-9a-f-]{36}$/i.test(id||'')||basis.length<5||evidence.length<5||evidence.length>1000||d.confirmed!==true)throw Error('RIGHTS_NOT_CONFIRMED');
   const m=await client.query('SELECT id FROM fg_media WHERE id=$1 AND event_id=$2 FOR UPDATE',[id,eventId]);if(!m.rowCount)throw Error('MEDIA_NOT_FOUND');
   const files=await client.query(`SELECT COUNT(*)::int AS originals,COUNT(*) FILTER(WHERE verified_hash=true)::int AS verified FROM fg_media_files WHERE media_id=$1 AND variant IN('JPEG','RAW','VIDEO_ORIGINAL')`,[id]);
   if(!files.rows[0].originals||files.rows[0].originals!==files.rows[0].verified)throw Error('INTEGRITY_NOT_VERIFIED');
   const players=await client.query(`SELECT p.id FROM fg_media_players mp JOIN fg_players p ON p.id=mp.player_id WHERE mp.media_id=$1 AND p.event_id=$2`,[id,eventId]);
   for(const p of players.rows){
    const legal=await client.query(`SELECT 1 FROM fg_privacy_records WHERE event_id=$1 AND player_id=$2 AND scope='private_gallery' AND reviewed_at IS NOT NULL AND revoked_at IS NULL LIMIT 1`,[eventId,p.id]);
    if(!legal.rowCount)throw Error('PLAYER_RIGHTS_NOT_RECORDED');
   }
   await client.query(`INSERT INTO fg_privacy_records(event_id,media_id,basis,evidence_ref,scope,reviewed_at) VALUES($1,$2,$3,$4,'private_gallery',NOW())`,[eventId,id,basis,evidence]);
   await client.query(`UPDATE fg_media SET publish_allowed=true,metadata_reviewed=true,status='published' WHERE id=$1 AND event_id=$2`,[id,eventId]);
  }else if(action==='player-privacy'){
   if(!/^[0-9a-f-]{36}$/i.test(d.playerId||'')||typeof d.basis!=='string'||d.basis.length<5||typeof d.evidence!=='string'||d.evidence.length<5||d.confirmed!==true)throw Error('PRIVACY_RECORD_INVALID');
   const p=await client.query('SELECT id FROM fg_players WHERE id=$1 AND event_id=$2',[d.playerId,eventId]);if(!p.rowCount)throw Error('PLAYER_NOT_FOUND');
   await client.query(`INSERT INTO fg_privacy_records(event_id,player_id,basis,evidence_ref,scope,reviewed_at) VALUES($1,$2,$3,$4,'private_gallery',NOW())`,[eventId,d.playerId,d.basis.slice(0,200),d.evidence.slice(0,1000)]);
   await client.query('UPDATE fg_players SET visible=true WHERE id=$1',[d.playerId]);
  }else if(action==='publish-event'){
   const privacy=typeof d.notice==='string'?d.notice.trim():'';
   if(d.confirmed!==true||privacy.length<40||privacy.length>10000)throw Error('PRIVACY_NOTICE_REQUIRED');
   const notReady=await client.query(`SELECT 1 FROM fg_media WHERE event_id=$1 AND status='published' AND (publish_allowed=false OR metadata_reviewed=false) LIMIT 1`,[eventId]);
   if(notReady.rowCount)throw Error('MEDIA_PENDING_REVIEW');
   await client.query(`UPDATE fg_events SET status='published',privacy_notice=$2,privacy_approved_at=NOW(),updated_at=NOW() WHERE id=$1`,[eventId,privacy]);
  }else throw Error('UNKNOWN_ACTION');
  await client.query('INSERT INTO fg_audit(admin_id,event_id,action,resource_id) VALUES($1,$2,$3,$4)',[admin.id,eventId,'review.'+action,id||null]);
  await client.query('COMMIT');return reply({ok:true});
 }catch(e){await client.query('ROLLBACK');console.error('fg review fail',e?.message||'unknown');return reply({message:({
  INTEGRITY_NOT_VERIFIED:'ไฟล์ต้นฉบับยังไม่ผ่านการตรวจ SHA-256',
  PLAYER_RIGHTS_NOT_RECORDED:'ยังไม่ได้บันทึกฐานกฎหมายและหลักฐานของเด็กทุกคนที่แท็ก',
  MEDIA_PENDING_REVIEW:'ยังมีภาพที่ยังไม่ผ่านการตรวจ',
  PRIVACY_NOTICE_REQUIRED:'ต้องระบุประกาศความเป็นส่วนตัวก่อนเผยแพร่'
 })[e.message]||'ไม่สามารถบันทึกการตรวจภาพ'},409)}finally{client.release()}
}
