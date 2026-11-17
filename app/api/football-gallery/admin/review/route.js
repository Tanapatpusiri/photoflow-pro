import {randomUUID} from 'node:crypto';
import {db,isUuid,sha256,PUBLIC_GRANT_LABEL} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
import {addRetentionMonths,validRetentionDate,TODAY_SQL} from '../../../../../lib/football-gallery-retention';
import {RETENTION_SETTINGS_LOCK,readRetentionMonths} from '../../../../../lib/football-gallery-retention-settings';
export const runtime='nodejs';
export const dynamic='force-dynamic';

class ReviewError extends Error{constructor(code,status=409){super(code);this.status=status}}
const messages={
 INVALID_INPUT:'ข้อมูลไม่ถูกต้อง',
 EVENT_NOT_FOUND:'ไม่พบงาน',MEDIA_NOT_FOUND:'ไม่พบไฟล์',PLAYER_NOT_FOUND:'ไม่พบนักฟุตบอล',WRONG_EVENT_PLAYER:'นักฟุตบอลไม่ได้อยู่ในงานนี้',
 RIGHTS_NOT_CONFIRMED:'ต้องกรอกฐานกฎหมาย หลักฐาน และยืนยันการตรวจสิทธิ์',
 INTEGRITY_NOT_VERIFIED:'ไฟล์ต้นฉบับยังไม่ผ่านการตรวจ SHA-256',
 PLAYER_RIGHTS_NOT_RECORDED:'ยังไม่ได้บันทึกฐานกฎหมายและหลักฐานของเด็กทุกคนที่แท็ก',
 PLAYER_CONSENT_REVOKED:'มีเด็กในภาพที่ผู้ปกครองถอนความยินยอมแล้ว เอาชื่อเด็กคนนั้นออกหรือซ่อนภาพนี้',
 GPS_CONFIRMATION_REQUIRED:'กรุณายืนยันว่าได้ตรวจความเสี่ยงจากพิกัดในต้นฉบับทุกไฟล์แล้ว',
 NO_CHILDREN_CONFIRMATION_REQUIRED:'ภาพที่ไม่ได้แท็กเด็กต้องยืนยันว่าไม่มีเด็กที่ระบุตัวได้',
 MEDIA_HIDDEN:'ไฟล์นี้ถูกซ่อนอยู่ ต้องกู้คืนเพื่อตรวจใหม่ก่อน',
 PRIVACY_NOTICE_REQUIRED:'ต้องระบุประกาศความเป็นส่วนตัว (อย่างน้อย 40 ตัวอักษร) และวันสิ้นสุดการเก็บรักษาก่อนเผยแพร่',
 EVENT_DATE_REQUIRED:'ต้องระบุวันจัดงานก่อนเผยแพร่เพื่อกำหนดระยะเวลาเก็บภาพ',
 RETENTION_OUT_OF_RANGE:'วันสิ้นสุดการเข้าถึงต้องอยู่หลังวันงานและไม่เกินระยะเวลาที่เจ้าของตั้งไว้',
 EVENT_NOT_PUBLISHED:'งานยังไม่ได้เผยแพร่',EVENT_NOT_SUSPENDED:'งานไม่ได้อยู่ในสถานะระงับ',EVENT_NOT_DRAFT:'เผยแพร่ได้เฉพาะงาน Draft',
 UNKNOWN_ACTION:'คำสั่งไม่ถูกต้อง'
};
const text=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max?v.trim():null;

export async function POST(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let d;try{d=await request.json()}catch{return reply({message:'คำขอไม่ถูกต้อง'},400)}
 const action=d?.action,id=d?.mediaId,eventId=d?.eventId;
 if(!isUuid(eventId))return reply({message:'รหัสงานไม่ถูกต้อง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const ev=await client.query(`SELECT id,status,locked,public_grant_id,privacy_approved_at,event_date::text AS event_date,${TODAY_SQL}::text AS today FROM fg_events WHERE id=$1 FOR UPDATE`,[eventId]);
  if(!ev.rowCount)throw new ReviewError('EVENT_NOT_FOUND',404);
  const media=async(lock=false)=>{
   if(!isUuid(id))throw new ReviewError('INVALID_INPUT',400);
   const m=await client.query(`SELECT id,status FROM fg_media WHERE id=$1 AND event_id=$2${lock?' FOR UPDATE':''}`,[id,eventId]);
   if(!m.rowCount)throw new ReviewError('MEDIA_NOT_FOUND',404);
   return m.rows[0];
  };
  let detail=null,resource=id||null;
  if(action==='hide'){
   await media(true);
   await client.query("UPDATE fg_media SET status='hidden',publish_allowed=false WHERE id=$1 AND event_id=$2",[id,eventId]);
  }else if(action==='restore'){
   const m=await media(true);if(m.status!=='hidden')throw new ReviewError('INVALID_INPUT',400);
   await client.query("UPDATE fg_media SET status='review',publish_allowed=false,metadata_reviewed=false WHERE id=$1",[id]);
  }else if(action==='tag'){
   if(!Array.isArray(d.players)||d.players.length>100||d.players.some(x=>!isUuid(x)))throw new ReviewError('INVALID_INPUT',400);
   await media(true);
   const players=[...new Set(d.players)];
   if(players.length){
    const ok=await client.query('SELECT COUNT(*)::int AS n FROM fg_players WHERE event_id=$1 AND id=ANY($2::uuid[])',[eventId,players]);
    if(ok.rows[0].n!==players.length)throw new ReviewError('WRONG_EVENT_PLAYER');
   }
   await client.query('DELETE FROM fg_media_players WHERE media_id=$1',[id]);
   if(players.length)await client.query('INSERT INTO fg_media_players(media_id,player_id) SELECT $1,unnest($2::uuid[])',[id,players]);
   // Changing who appears in a published file sends it back for review.
   await client.query("UPDATE fg_media SET status=CASE WHEN status='published' THEN 'review' ELSE status END,publish_allowed=false WHERE id=$1",[id]);
   detail={players:players.length};
  }else if(action==='tag-many'){
   // Tag one child across selected photos in a single atomic admin action.
   // Never touch other photo tags; never publish revoked or unverified files.
   const ids=Array.isArray(d.mediaIds)?[...new Set(d.mediaIds)]:[];
   if(!isUuid(d.playerId)||ids.length<1||ids.length>200||ids.some(x=>!isUuid(x)))throw new ReviewError('INVALID_INPUT',400);
   const p=await client.query('SELECT id FROM fg_players WHERE event_id=$1 AND id=$2',[eventId,d.playerId]);
   if(!p.rowCount)throw new ReviewError('WRONG_EVENT_PLAYER');
   const forbidden=await client.query(`SELECT 1 FROM fg_privacy_records r WHERE r.event_id=$1 AND r.player_id=$2 AND r.revoked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fg_privacy_records a WHERE a.event_id=r.event_id AND a.player_id=r.player_id AND a.revoked_at IS NULL AND a.reviewed_at IS NOT NULL) LIMIT 1`,[eventId,d.playerId]);
   if(forbidden.rowCount)throw new ReviewError('PLAYER_CONSENT_REVOKED');
   const selected=await client.query('SELECT id FROM fg_media WHERE event_id=$1 AND kind=$2 AND status<>$3 AND id=ANY($4::uuid[]) FOR UPDATE',[eventId,'photo','hidden',ids]);
   if(selected.rowCount!==ids.length)throw new ReviewError('MEDIA_NOT_FOUND',404);
   const inserted=await client.query(`INSERT INTO fg_media_players(media_id,player_id) SELECT unnest($1::uuid[]),$2 ON CONFLICT DO NOTHING`,[ids,d.playerId]);
   // Older approved photos remain approved when adding another child's tag.
   // New uploads become visible only after integrity checks and album publication.
   await client.query('UPDATE fg_players SET visible=true WHERE id=$1',[d.playerId]);
   detail={mediaCount:ids.length,newTags:inserted.rowCount};
   resource=d.playerId;
  }else if(action==='approve'){
   // Owner policy (2026-11-15): consent is confirmed once for the whole album when it is published,
   // so approving a photo only records who is in it. A per-photo basis and evidence are optional.
   // GPS is shown as a warning in the review screen and accepted by approving.
   const basis=text(d.basis,5,200)||'ยืนยันความยินยอมระดับอัลบั้มตอนเผยแพร่',evidence=text(d.evidence,5,1000)||'ผู้ดูแลยืนยันตอนกดเผยแพร่อัลบั้ม';
   const m=await media(true);if(m.status==='hidden')throw new ReviewError('MEDIA_HIDDEN');
   const files=await client.query(`SELECT COUNT(*)::int AS originals,COUNT(*) FILTER(WHERE verified_hash=true)::int AS verified FROM fg_media_files WHERE media_id=$1 AND variant IN('JPEG','RAW','VIDEO_ORIGINAL')`,[id]);
   if(!files.rows[0].originals||files.rows[0].originals!==files.rows[0].verified)throw new ReviewError('INTEGRITY_NOT_VERIFIED');
   // A child whose consent was withdrawn stays blocked until consent is recorded again.
   const revoked=await client.query(`SELECT COUNT(*)::int AS n FROM fg_media_players mp WHERE mp.media_id=$1 AND EXISTS(SELECT 1 FROM fg_privacy_records r WHERE r.event_id=$2 AND r.player_id=mp.player_id AND r.revoked_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM fg_privacy_records r WHERE r.event_id=$2 AND r.player_id=mp.player_id AND r.scope='private_gallery' AND r.reviewed_at IS NOT NULL AND r.revoked_at IS NULL)`,[id,eventId]);
   if(revoked.rows[0].n)throw new ReviewError('PLAYER_CONSENT_REVOKED');
   const tagged=await client.query('SELECT COUNT(*)::int AS n FROM fg_media_players WHERE media_id=$1',[id]);
   if(!tagged.rows[0].n&&d.noChildrenConfirmed!==true)throw new ReviewError('NO_CHILDREN_CONFIRMATION_REQUIRED',400);
   await client.query(`INSERT INTO fg_privacy_records(event_id,media_id,basis,evidence_ref,scope,reviewed_at) VALUES($1,$2,$3,$4,'private_gallery',NOW())`,[eventId,id,basis,evidence]);
   await client.query(`UPDATE fg_media SET publish_allowed=true,metadata_reviewed=true,status='published' WHERE id=$1 AND event_id=$2`,[id,eventId]);
   // Children tagged in an approved photo can be found by name in the parents' gallery.
   await client.query(`UPDATE fg_players SET visible=true WHERE event_id=$2 AND id IN(SELECT player_id FROM fg_media_players WHERE media_id=$1)`,[id,eventId]);
   detail={noChildrenConfirmed:!tagged.rows[0].n,consent:'album'};
  }else if(action==='player-privacy'){
   const basis=text(d.basis,5,200),evidence=text(d.evidence,5,1000);
   if(!isUuid(d.playerId)||!basis||!evidence||d.confirmed!==true)throw new ReviewError('RIGHTS_NOT_CONFIRMED',400);
   const p=await client.query('SELECT id FROM fg_players WHERE id=$1 AND event_id=$2',[d.playerId,eventId]);if(!p.rowCount)throw new ReviewError('PLAYER_NOT_FOUND',404);
   await client.query(`INSERT INTO fg_privacy_records(event_id,player_id,basis,evidence_ref,scope,reviewed_at) VALUES($1,$2,$3,$4,'private_gallery',NOW())`,[eventId,d.playerId,basis,evidence]);
   await client.query('UPDATE fg_players SET visible=true WHERE id=$1',[d.playerId]);
   resource=d.playerId;
  }else if(action==='revoke-player-privacy'){
   // Consent withdrawn: hide the child's name and send every file showing them back to review.
   if(!isUuid(d.playerId))throw new ReviewError('INVALID_INPUT',400);
   const p=await client.query('SELECT id FROM fg_players WHERE id=$1 AND event_id=$2',[d.playerId,eventId]);if(!p.rowCount)throw new ReviewError('PLAYER_NOT_FOUND',404);
   const withdrawn=await client.query('UPDATE fg_privacy_records SET revoked_at=NOW() WHERE event_id=$1 AND player_id=$2 AND revoked_at IS NULL',[eventId,d.playerId]);
   // With album-level consent a child may have no record of their own; store the withdrawal so later approvals are blocked.
   if(!withdrawn.rowCount)await client.query(`INSERT INTO fg_privacy_records(event_id,player_id,basis,evidence_ref,scope,reviewed_at,revoked_at) VALUES($1,$2,'ผู้ปกครองถอนความยินยอม',$3,'private_gallery',NOW(),NOW())`,[eventId,d.playerId,text(d.reason,0,1000)||null]);
   await client.query('UPDATE fg_players SET visible=false WHERE id=$1',[d.playerId]);
   const affected=await client.query(`UPDATE fg_media m SET status='review',publish_allowed=false WHERE m.event_id=$1 AND m.status='published' AND EXISTS(SELECT 1 FROM fg_media_players mp WHERE mp.media_id=m.id AND mp.player_id=$2)`,[eventId,d.playerId]);
   resource=d.playerId;detail={unpublished:affected.rowCount};
  }else if(action==='publish-event'){
   if(ev.rows[0].status!=='draft')throw new ReviewError('EVENT_NOT_DRAFT');
   const notice=text(d.notice,40,10000),retention=d.retentionUntil;
   if(d.confirmed!==true||!notice||!retention)throw new ReviewError('PRIVACY_NOTICE_REQUIRED',400);
   if(!ev.rows[0].event_date)throw new ReviewError('EVENT_DATE_REQUIRED',400);
   await client.query(RETENTION_SETTINGS_LOCK);
   const months=await readRetentionMonths(client);
   if(!validRetentionDate(ev.rows[0].event_date,retention,ev.rows[0].today,months))throw new ReviewError('RETENTION_OUT_OF_RANGE',400);
   const deletionAfter=addRetentionMonths(ev.rows[0].event_date,months);
   // Public albums receive a system-only grant atomically at publication. No guest can
   // access an album before consent, retention and publish checks succeed.
   let publicGrantId=ev.rows[0].public_grant_id;
   if(!ev.rows[0].locked&&!publicGrantId){
    const code=await client.query(`INSERT INTO fg_event_codes(event_id,code_hash,expires_at,label) VALUES($1,$2,($3::date + INTERVAL '1 day'),$4) RETURNING id`,[eventId,sha256('public-album:'+randomUUID()+':'+randomUUID()),retention,PUBLIC_GRANT_LABEL]);
    publicGrantId=code.rows[0].id;
   }
   await client.query(`UPDATE fg_events SET status='published',privacy_notice=$2,privacy_approved_at=NOW(),retention_until=$3,deletion_after=$4,public_grant_id=$5,updated_at=NOW() WHERE id=$1`,[eventId,notice,retention,deletionAfter,publicGrantId]);
   detail={retentionUntil:retention,deletionAfter,periodMonths:months};
  }else if(action==='suspend-event'){
   if(ev.rows[0].status!=='published')throw new ReviewError('EVENT_NOT_PUBLISHED');
   await client.query(`UPDATE fg_events SET status='suspended',updated_at=NOW() WHERE id=$1`,[eventId]);
  }else if(action==='resume-event'){
   if(ev.rows[0].status!=='suspended'||!ev.rows[0].privacy_approved_at)throw new ReviewError('EVENT_NOT_SUSPENDED');
   await client.query(`UPDATE fg_events SET status='published',updated_at=NOW() WHERE id=$1`,[eventId]);
  }else throw new ReviewError('UNKNOWN_ACTION',400);
  await audit(client,{adminId:admin.id,eventId,action:'review.'+action,resourceId:resource,detail});
  await client.query('COMMIT');return reply({ok:true});
 }catch(e){
  await client.query('ROLLBACK');
  if(e instanceof ReviewError)return reply({message:messages[e.message]||'ไม่สามารถบันทึกการตรวจ',code:e.message},e.status);
  console.error('fg review fail',e?.code||'unknown');return reply({message:'ไม่สามารถบันทึกการตรวจภาพ'},503);
 }finally{client.release()}
}
