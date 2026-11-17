import {db,isUuid} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
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
   afterDate=new Date(stamp).toISOString();afterId=id;
  }catch{return reply({message:'ตัวแบ่งหน้ารายการไม่ถูกต้อง'},400)}
 }
 if(!isUuid(event))return reply({message:'กรุณาเลือกงาน'},400);
 if(status&&!['uploading','review','published','hidden'].includes(status))return reply({message:'สถานะไม่ถูกต้อง'},400);
 try{
  const q=await db().query(`SELECT m.id,m.title,m.kind,m.status,m.publish_allowed,m.metadata_reviewed,m.captured_at,m.has_gps,m.created_at AS page_created_at,
  COALESCE((SELECT json_agg(json_build_object('id',f.id,'variant',f.variant,'filename',f.original_filename,'bytes',f.size_bytes,'sha256',f.sha256,'verifiedBytes',f.verified_bytes,'verifiedHash',f.verified_hash,'verifyOffset',f.verify_offset,'pending',f.upload_id IS NOT NULL) ORDER BY f.variant) FROM fg_media_files f WHERE f.media_id=m.id),'[]'::json) AS files,
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
   ?Buffer.from(JSON.stringify([new Date(last.page_created_at).toISOString(),last.id])).toString('base64url')
   :null;
  return reply({items,hasMore,nextCursor,page,counts});
 }catch(e){console.error('fg admin list',e?.code||'unknown');return reply({message:'โหลดไฟล์ไม่สำเร็จ'},503)}
}
