import {NextResponse} from 'next/server';
import {db,configured,grantFor,privateHeaders,setGrantCookie} from '../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../lib/football-gallery-retention';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request){
 const slug=request.nextUrl.searchParams.get('slug');
 if(!configured()||!slug||slug.length>140)return NextResponse.json({ok:false},{status:400,headers:privateHeaders});
 try{
  const q=await db().query(`SELECT e.id,c.id AS grant_id FROM fg_events e
   JOIN fg_settings s ON s.key='album.public.'||e.id::text
   JOIN fg_event_codes c ON c.id::text=s.value AND c.event_id=e.id AND c.revoked_at IS NULL AND c.expires_at>NOW()
   WHERE e.slug=$1 AND e.status='published' AND e.privacy_approved_at IS NOT NULL AND ${ACTIVE_RETENTION_SQL}`,[slug]);
  if(!q.rowCount)return NextResponse.json({ok:false},{status:404,headers:privateHeaders});
  if(await grantFor(request,q.rows[0].id))return NextResponse.json({ok:true},{headers:privateHeaders});
  return setGrantCookie(NextResponse.json({ok:true},{headers:privateHeaders}),q.rows[0].id,q.rows[0].grant_id);
 }catch(e){console.error('fg public access',e?.code||'unknown');return NextResponse.json({ok:false},{status:503,headers:privateHeaders})}
}
