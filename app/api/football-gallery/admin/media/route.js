import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply,audit} from '../../../../../lib/football-gallery-admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PAGE=80;
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const sp=request.nextUrl.searchParams,event=sp.get('event'),status=sp.get('status');
 const page=Math.max(1,Math.min(10000,Number(sp.get('page'))||1));
 let afterDate=null,afterId=null;
 const encodedCursor=sp.get('cursor');
 if(encodedCursor){
  try{
   if(encodedCursor.length>220)throw Error('invalid');
   const [stamp,id]=JSON.parse(Buffer.from(encodedCursor,'base64url').toString('utf8'));
   if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp))||!isUuid(id))throw Error('invalid');
   afterDate=stamp;afterId=id;
  }catch{return reply({message:'ตัวแบ่งหน้ารายการไม่ถูกต้อง'},400)}
 }
 if(!isUuid(event))return reply({message:'กรุณาเลือกงาน'},400);
 if(status&&!['uploading','review','published','hidden'].includes(status))return reply({message:'สถานะไม่ถูกต้อง'},400);
 try{
  const q=await db().query(`SELECT m.id,m.title,m.kind,m.status,m.publish_allowed,m.metadata_reviewed,m.captured_at,m.has_gps,to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS page_created_at,
  COALESCE((SELECT json_agg(json_build_object('id',f.id,'variant',f.variant,'storage',f.storage,'filename',f.original_filename,'bytes',f.size_bytes,'sha256',f.sha256,'verifiedBytes',f.verified_bytes,'verifiedHash',f.verified_hash,'verifyOffset',f.verify_offset,'pending',f.upload_id IS NOT NULL) ORDER BY f.variant) FROM fg_media_files f WHERE f.media_id=m.id),'[]'::json) AS files,
  EXISTS(SELECT 1 FROM fg_media_files f WHERE f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true) AS has_thumb,
  COALESCE((SELECT array_agg(mp.player_id) FROM fg_media_players mp WHERE mp.media_id=m.id),'{}'::uuid[]) AS players
  FROM fg_media m WHERE m.event_id=$1 AND ($3::text IS NULL OR m.status=$3)
   AND ($4::timestamptz IS NULL OR (m.created_at,m.id)<($4::timestamptz,$5::uuid))
   ORDER BY m.created_at DESC,m.id DESC LIMIT ${PAGE+1} OFFSET $2`,
   [event,afterDate?0:(page-1)*PAGE,status||null,afterDate,afterId]);
  // Counts cover the entire album, not just one paginated screen.
  const countsResult=await db().query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE status='review')::int AS ready,
    COUNT(*) FILTER (WHERE status='published')::int AS published,
    COUNT(*) FILTER (WHERE status='uploading')::int AS uploading,
    COUNT(*) FILTER (WHERE status='hidden')::int AS hidden,
    COUNT(*) FILTER (WHERE ($2::text IS NULL OR status=$2))::int AS filtered
    FROM fg_media WHERE event_id=$1`,[event,status||null]);
  const counts=countsResult.rows[0];
  // Same-origin preview URL: the admin session is checked again every time the image loads.
  const rows=q.rows.slice(0,PAGE);
  const items=rows.map(({has_thumb,page_created_at,...row})=>({...row,thumb:has_thumb?'/api/football-gallery/admin/preview?media='+row.id:null}));
  const last=rows[rows.length-1];
  const hasMore=q.rows.length>PAGE;
  const nextCursor=hasMore&&last
   ?Buffer.from(JSON.stringify([last.page_created_at,last.id])).toString('base64url')
   :null;
  return reply({items,hasMore,nextCursor,page,counts});
 }catch(e){console.error('fg admin list',e?.code||'unknown');return reply({message:'โหลดไฟล์ไม่สำเร็จ'},503)}
}

export async function PATCH(request){
 const {admin,error}=await adminGuard(request,{mutation:true});if(error)return error;
 let data;try{data=await request.json()}catch{return reply({message:'ข้อมูลไม่ถูกต้อง'},400)}
 const {mediaId,from,to}=data||{};
 if(![mediaId,from,to].every(isUuid)||from===to)return reply({message:'กรุณาเลือกสื่อและวันแข่งขันปลายทาง'},400);
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  const {rows:events}=await client.query(`SELECT id,parent_event_id,status FROM fg_events
   WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[[from,to]]);
  if(events.length!==2||!events[0].parent_event_id||events[0].parent_event_id!==events[1].parent_event_id||
   events.find(event=>event.id===from)?.status!=='draft'||events.some(event=>!['draft','published'].includes(event.status))){
   await client.query('ROLLBACK');return reply({message:'ย้ายจากวันแข่งขันฉบับร่างไปยังวันอื่นในอัลบั้มเดียวกันได้'},409);
  }
  const media=await client.query(`SELECT id FROM fg_media WHERE id=$1 AND event_id=$2
   AND status IN ('review','published') FOR UPDATE`,[mediaId,from]);
  if(!media.rowCount){
   await client.query('ROLLBACK');return reply({message:'ไม่พบสื่อที่ย้ายได้ในวันเดิม'},409);
  }
  const {rows:[block]}=await client.query(`SELECT
   EXISTS(SELECT 1 FROM fg_media_files WHERE media_id=$1 AND (storage<>'s3' OR upload_id IS NOT NULL OR NOT verified_bytes)) OR
   NOT EXISTS(SELECT 1 FROM fg_media_files WHERE media_id=$1) AS storage,
   EXISTS(SELECT 1 FROM fg_removal_requests WHERE media_id=$1) OR
   EXISTS(SELECT 1 FROM fg_events WHERE cover_media_id=$1) OR
   EXISTS(SELECT 1 FROM fg_privacy_records WHERE media_id=$1) OR
   EXISTS(SELECT 1 FROM fg_privacy_records r JOIN fg_media_players mp ON mp.player_id=r.player_id
    WHERE mp.media_id=$1 AND r.event_id=$2 AND r.revoked_at IS NOT NULL) AS referenced`,[mediaId,from]);
  if(block.storage||block.referenced){
   await client.query('ROLLBACK');return reply({message:block.storage?'ย้ายได้เฉพาะไฟล์ S3 ที่อัปโหลดเสร็จสมบูรณ์':'สื่อนี้มีประวัติสิทธิ์ คำขอถอดภาพ หรือใช้เป็นหน้าปกอยู่'},409);
  }
  const {rows:tags}=await client.query(`SELECT mp.player_id AS source,p.id AS target
   FROM fg_media_players mp JOIN fg_players s ON s.id=mp.player_id AND s.event_id=$2
   LEFT JOIN fg_players p ON p.event_id=$3 AND p.registry_id=s.registry_id
    AND ROW(p.name,p.jersey,p.team,p.age_group) IS NOT DISTINCT FROM ROW(s.name,s.jersey,s.team,s.age_group)
   WHERE mp.media_id=$1`,[mediaId,from,to]);
  const {rows:[count]}=await client.query('SELECT count(*)::int AS count FROM fg_media_players WHERE media_id=$1',[mediaId]);
  if(count.count!==tags.length||tags.some(tag=>!tag.target)){
   await client.query('ROLLBACK');return reply({message:'กรุณาเชื่อมนักฟุตบอลจากทะเบียนเดียวกันและใช้ข้อมูลตรงกันในวันปลายทางก่อนย้าย'},409);
  }
  for(const tag of tags)await client.query('UPDATE fg_media_players SET player_id=$3 WHERE media_id=$1 AND player_id=$2',[mediaId,tag.source,tag.target]);
  await client.query(`UPDATE fg_media SET event_id=$2,status='review',publish_allowed=false,metadata_reviewed=false,
   upload_batch=NULL,pair_key=NULL WHERE id=$1`,[mediaId,to]);
  await audit(client,{adminId:admin.id,eventId:from,action:'media.move_out',resourceId:mediaId,detail:{to}});
  await audit(client,{adminId:admin.id,eventId:to,action:'media.move_in',resourceId:mediaId,detail:{from}});
  await client.query('COMMIT');return reply({ok:true});
 }catch(err){await client.query('ROLLBACK');console.error('fg media move',err?.code||'unknown');return reply({message:'ย้ายสื่อไม่สำเร็จ'},503)}
 finally{client.release()}
}
