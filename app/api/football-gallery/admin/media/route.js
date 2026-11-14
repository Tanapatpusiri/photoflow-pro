import {db,isUuid,presignInline} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
import {thumbUrl} from '../../../../../lib/football-gallery-tickets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PAGE=80;
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const sp=request.nextUrl.searchParams,event=sp.get('event'),status=sp.get('status');
 const page=Math.max(1,Math.min(10000,Number(sp.get('page'))||1));
 if(!isUuid(event))return reply({message:'กรุณาเลือกงาน'},400);
 if(status&&!['uploading','review','published','hidden'].includes(status))return reply({message:'สถานะไม่ถูกต้อง'},400);
 try{
  const q=await db().query(`SELECT m.id,m.title,m.kind,m.status,m.publish_allowed,m.metadata_reviewed,m.captured_at,m.has_gps,
  COALESCE((SELECT json_agg(json_build_object('id',f.id,'variant',f.variant,'filename',f.original_filename,'bytes',f.size_bytes,'sha256',f.sha256,'verifiedBytes',f.verified_bytes,'verifiedHash',f.verified_hash,'verifyOffset',f.verify_offset,'pending',f.upload_id IS NOT NULL) ORDER BY f.variant) FROM fg_media_files f WHERE f.media_id=m.id),'[]'::json) AS files,
  (SELECT f.r2_key FROM fg_media_files f WHERE f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true) AS thumb_key,
  (SELECT f.storage FROM fg_media_files f WHERE f.media_id=m.id AND f.variant='THUMB') AS thumb_storage,
  COALESCE((SELECT array_agg(mp.player_id) FROM fg_media_players mp WHERE mp.media_id=m.id),'{}'::uuid[]) AS players
  FROM fg_media m WHERE m.event_id=$1 AND ($3::text IS NULL OR m.status=$3) ORDER BY m.created_at DESC,m.id LIMIT ${PAGE} OFFSET $2`,[event,(page-1)*PAGE,status||null]);
  const items=await Promise.all(q.rows.map(async({thumb_key,thumb_storage,...row})=>({...row,thumb:!thumb_key?null:thumb_storage==='drive'?thumbUrl(thumb_key):await presignInline(thumb_key)})));
  return reply({items,hasMore:items.length===PAGE,page});
 }catch(e){console.error('fg admin list',e?.code||'unknown');return reply({message:'โหลดไฟล์ไม่สำเร็จ'},503)}
}
