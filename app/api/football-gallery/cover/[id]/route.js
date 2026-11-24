import {NextResponse} from 'next/server';
import {db,configured,isUuid,presignInline,privateHeaders} from '../../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../../lib/football-gallery-retention';
import {coverVariant} from '../../../../../lib/football-gallery-cover-image';
import {readDriveMedia} from '../../../../../lib/football-gallery-drive';
import {coverUrl} from '../../../../../lib/football-gallery-tickets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PUBLISHED="m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true";
// Card cover for one album on the front page: the uploaded cover, the photo the admin chose,
// or (for an unlocked album only) its first published photo. Locked albums never fall back to a photo.
export async function GET(request,{params}){
 const {id}=await params;
 if(!configured()||!isUuid(id))return new NextResponse(null,{status:404,headers:privateHeaders});
 try{
  const q=await db().query(`SELECT e.cover_drive_id,
   (SELECT json_build_object('storage',f.storage,'key',f.r2_key) FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id WHERE m.id=e.cover_media_id AND m.event_id=e.id AND m.status<>'hidden' AND f.variant='THUMB' AND f.verified_bytes=true) AS chosen,
   CASE WHEN NOT e.locked THEN (SELECT json_build_object('storage',f.storage,'key',f.r2_key) FROM fg_media m JOIN fg_media_files f ON f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true WHERE m.event_id=e.id AND m.kind='photo' AND ${PUBLISHED} ORDER BY m.captured_at NULLS LAST,m.id LIMIT 1) END AS first
   FROM fg_events e WHERE e.id=$1 AND e.status='published' AND e.privacy_approved_at IS NOT NULL AND ${ACTIVE_RETENTION_SQL}`,[id]);
  if(!q.rowCount)return new NextResponse(null,{status:404,headers:privateHeaders});
  const r=q.rows[0],pick=r.cover_drive_id?{storage:'drive',key:r.cover_drive_id}:r.chosen||r.first;
  if(!pick)return new NextResponse(null,{status:404,headers:privateHeaders});
  const width=Number(request.nextUrl.searchParams.get('width'));
  if(width===540||width===768){
   const signal=AbortSignal.any([request.signal,AbortSignal.timeout(8000)]);
   const source=pick.storage==='drive'
    ?await readDriveMedia(pick.key,signal)
    :await fetch(await presignInline(pick.key),{cache:'no-store',signal});
   const image=await coverVariant(source,width);
   return new NextResponse(image,{headers:{...privateHeaders,'Content-Type':'image/webp'}});
  }
  const target=pick.storage==='drive'?coverUrl(pick.key):await presignInline(pick.key);
  return NextResponse.redirect(target,{status:302,headers:privateHeaders});
 }catch(e){console.error('fg cover',e?.code||'unknown');return new NextResponse(null,{status:503,headers:privateHeaders})}
}
