import {NextResponse} from 'next/server';
import {configured,db,sha256,issueGrant,privateHeaders} from '../../../../lib/football-gallery-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}){
 const fallback=new URL('/football-gallery',request.url);
 if(!configured())return NextResponse.redirect(fallback,{headers:privateHeaders});
 const {token}=await params;
 if(typeof token!=='string'||token.length<32||token.length>120)return NextResponse.redirect(fallback,{headers:privateHeaders});
 const hash=sha256(process.env.FG_SESSION_SECRET+':invite:'+token);
 try{
  const q=await db().query(`SELECT i.id AS grant_id,e.id AS event_id,e.slug FROM fg_invites i JOIN fg_events e ON e.id=i.event_id WHERE i.token_hash=$1 AND i.revoked_at IS NULL AND i.expires_at>NOW() AND e.status='published' AND e.privacy_approved_at IS NOT NULL LIMIT 1`,[hash]);
  if(!q.rowCount)return NextResponse.redirect(fallback,{headers:privateHeaders});
  const {grant_id,event_id,slug}=q.rows[0];
  const response=NextResponse.redirect(new URL('/football-gallery/'+encodeURIComponent(slug),request.url),{headers:privateHeaders});
  response.cookies.set('fg_grant',issueGrant(event_id,grant_id),{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:43200});
  return response;
 }catch(err){console.error('fg invite verification',err?.code||'unknown');return NextResponse.redirect(fallback,{headers:privateHeaders})}
}
