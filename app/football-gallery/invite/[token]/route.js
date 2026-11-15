import {NextResponse} from 'next/server';
import {configured,db,sha256,setGrantCookie,privateHeaders} from '../../../../lib/football-gallery-server';
import {ACTIVE_RETENTION_SQL} from '../../../../lib/football-gallery-retention';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}){
 const fallback=new URL('/football-gallery?invite=invalid',request.url);
 if(!configured())return NextResponse.redirect(fallback,{headers:privateHeaders});
 const {token}=await params;
 if(typeof token!=='string'||token.length<32||token.length>120||!/^[A-Za-z0-9_-]+$/.test(token))return NextResponse.redirect(fallback,{headers:privateHeaders});
 const hash=sha256(process.env.FG_SESSION_SECRET+':invite:'+token);
 try{
  const q=await db().query(`SELECT i.id AS grant_id,e.id AS event_id,e.slug FROM fg_invites i JOIN fg_events e ON e.id=i.event_id WHERE i.token_hash=$1 AND i.revoked_at IS NULL AND i.expires_at>NOW() AND e.status='published' AND e.privacy_approved_at IS NOT NULL AND ${ACTIVE_RETENTION_SQL} LIMIT 1`,[hash]);
  if(!q.rowCount)return NextResponse.redirect(fallback,{headers:privateHeaders});
  const {grant_id,event_id,slug}=q.rows[0];
  // The token is removed from the address bar by redirecting to the album URL.
  return setGrantCookie(NextResponse.redirect(new URL('/football-gallery/'+encodeURIComponent(slug),request.url),{headers:privateHeaders}),event_id,grant_id);
 }catch(err){console.error('fg invite verification',err?.code||'unknown');return NextResponse.redirect(fallback,{headers:privateHeaders})}
}
