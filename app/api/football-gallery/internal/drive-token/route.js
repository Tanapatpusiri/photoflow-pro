import {NextResponse} from 'next/server';
import {configured,storageDriver,privateHeaders} from '../../../../../lib/football-gallery-server';
import {accessToken} from '../../../../../lib/football-gallery-drive';
import {workerAuthorized} from '../../../../../lib/football-gallery-tickets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Called only by the download Worker (shared secret). Returns a short-lived Google access token
// for drive.file; the refresh token itself never leaves this app.
export async function POST(request){
 if(!configured()||storageDriver()!=='drive')return NextResponse.json({error:'not-configured'},{status:503,headers:privateHeaders});
 if(!workerAuthorized(request))return NextResponse.json({error:'unauthorized'},{status:401,headers:privateHeaders});
 try{const t=await accessToken();return NextResponse.json({accessToken:t.token,expiresAt:t.exp},{headers:privateHeaders})}
 catch(e){console.error('fg drive token',e?.code||'unknown');return NextResponse.json({error:e?.code||'token-failed'},{status:503,headers:privateHeaders})}
}
