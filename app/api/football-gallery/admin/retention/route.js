import {db} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
import {RETENTION_REVIEW_REASON_SQL} from '../../../../../lib/football-gallery-retention-review';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PAGE_SIZE=40;
export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const raw=request.nextUrl.searchParams.get('page')||'1';
 if(!/^[1-9]\d{0,4}$/.test(raw))return reply({message:'หน้ารายการไม่ถูกต้อง'},400);
 const page=Number(raw);
 try{
  const q=await db().query(`WITH flagged AS (
   SELECT e.id,e.title,e.slug,e.venue,e.event_date,e.status,e.privacy_approved_at,e.retention_until,
    (SELECT COUNT(*)::int FROM fg_players p WHERE p.event_id=e.id) AS players,
    (SELECT COUNT(*)::int FROM fg_media m WHERE m.event_id=e.id AND m.status<>'hidden') AS media,
    (SELECT COUNT(*)::int FROM fg_media m WHERE m.event_id=e.id AND m.status='published') AS published,
    (SELECT COUNT(*)::int FROM fg_removal_requests r WHERE r.event_id=e.id AND r.state IN('new','in_review')) AS open_removals,
    ${RETENTION_REVIEW_REASON_SQL} AS reason,
    LEAST(e.retention_until,(e.event_date + INTERVAL '1 year')::date) AS deadline
   FROM fg_events e
  ) SELECT * FROM flagged WHERE reason IS NOT NULL
   ORDER BY CASE WHEN reason IN ('missing_event_date','missing_retention','invalid_retention') THEN 0 WHEN reason='expired' THEN 1 ELSE 2 END,
    deadline ASC NULLS FIRST,id LIMIT $1 OFFSET $2`,[PAGE_SIZE+1,(page-1)*PAGE_SIZE]);
  return reply({events:q.rows.slice(0,PAGE_SIZE),hasMore:q.rows.length>PAGE_SIZE,page});
 }catch(e){console.error('fg retention list',e?.code||'unknown');return reply({message:'โหลดรายการครบกำหนดไม่สำเร็จ'},503)}
}
