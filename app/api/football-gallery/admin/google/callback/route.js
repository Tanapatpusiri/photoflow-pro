import {NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {configured,db,storageDriver,privateHeaders} from '../../../../../../lib/football-gallery-server';
import {audit} from '../../../../../../lib/football-gallery-admin';
import {readOauthState,connectWithCode} from '../../../../../../lib/football-gallery-drive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Google redirects here after consent. The strict admin cookie is not sent on this cross-site
// return, so the request is authorised by the signed state (owner id, 10 minutes) plus the
// per-browser nonce cookie set when the owner started the flow.
export async function GET(request){
 const url=new URL(request.url),back=new URL('/football-gallery/admin',url.origin);
 const done=(status)=>{back.searchParams.set('drive',status);const r=NextResponse.redirect(back,{status:302,headers:privateHeaders});r.cookies.set('fg_oauth','',{maxAge:0,path:'/api/football-gallery/admin/google'});return r};
 if(!configured()||storageDriver()!=='drive')return done('not-configured');
 if(url.searchParams.get('error'))return done('denied');
 const [signed,nonce]=(url.searchParams.get('state')||'').split('~');
 const cookie=request.cookies.get('fg_oauth')?.value||'';
 const state=readOauthState(signed);
 if(!state||!nonce||cookie.length!==nonce.length||!timingSafeEqual(Buffer.from(cookie),Buffer.from(nonce)))return done('invalid-state');
 const code=url.searchParams.get('code');
 if(!code||code.length>2000)return done('invalid-code');
 try{
  const owner=await db().query("SELECT id FROM fg_admins WHERE id=$1 AND role='owner' AND enabled=true",[state.a]);
  if(!owner.rowCount)return done('forbidden');
  await connectWithCode(code,url.origin);
  await audit(null,{adminId:state.a,action:'storage.drive-connected'});
  return done('connected');
 }catch(e){console.error('fg drive connect',e?.code||e?.name||'unknown');return done(e?.code==='DRIVE_NO_REFRESH_TOKEN'?'no-refresh-token':'failed')}
}
