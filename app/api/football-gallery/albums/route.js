import {NextResponse} from 'next/server';
import {db,configured,grantFor,privateHeaders} from '../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../lib/football-gallery-retention';
import {thumbUrl} from '../../../../lib/football-gallery-tickets';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});

// Show published albums; private cover photographs require a valid album grant.
export async function GET(request){
 if(!configured())return reply({message:'ยังไม่สามารถโหลดอัลบั้มได้'},503);
 try{
  const rawPage=request.nextUrl.searchParams.get('page')||'1';
  if(!/^[1-9]\d{0,4}$/.test(rawPage))return reply({message:'หน้าอัลบั้มไม่ถูกต้อง'},400);
  const page=Number(rawPage),pageSize=24;
  const result=await db().query(`SELECT e.id,e.slug,e.title,e.event_date,
    (SELECT c.id FROM fg_settings s JOIN fg_event_codes c ON c.id::text=s.value AND c.event_id=e.id AND c.revoked_at IS NULL AND c.expires_at>NOW() WHERE s.key='album.public.'||e.id::text) AS public_grant,
    (SELECT f.id FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id
     WHERE m.event_id=e.id AND m.kind='photo' AND m.status='published'
       AND m.publish_allowed=true AND m.metadata_reviewed=true
       AND f.variant='THUMB' AND f.verified_bytes=true AND f.storage='drive'
     ORDER BY (m.id=e.cover_media_id) DESC NULLS LAST,m.captured_at NULLS LAST,m.id LIMIT 1) AS cover
   FROM fg_events e WHERE e.status='published' AND e.privacy_approved_at IS NOT NULL
     AND ${ACTIVE_RETENTION_SQL} ORDER BY e.event_date DESC NULLS LAST,e.id LIMIT $1 OFFSET $2`,[pageSize+1,(page-1)*pageSize]);
  const albums=await Promise.all(result.rows.slice(0,pageSize).map(async e=>{
   const grant=await grantFor(request,e.id);
   const grantId=e.public_grant||grant?.codeId;
   return {slug:e.slug,title:e.title,date:e.event_date,locked:!e.public_grant,
     ...(grantId&&e.cover?{coverUrl:thumbUrl(e.cover,grantId,e.id)}:{})};
  }));
  return reply({albums,hasMore:result.rowCount>pageSize,page});
 }catch(err){console.error('fg albums',err?.code||'unknown');return reply({message:'ยังไม่สามารถโหลดอัลบั้มได้'},503)}
}
