import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {storageDriver,privateHeaders} from '../../../../../../lib/football-gallery-server';
import {adminGuard} from '../../../../../../lib/football-gallery-admin';
import {oauthState,authorizeUrl} from '../../../../../../lib/football-gallery-drive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Owner-only: starts Google OAuth with the drive.file scope (files created by this app only).
export async function GET(request){
 const {admin,error}=await adminGuard(request);if(error)return error;
 const back=reason=>NextResponse.redirect(new URL('/football-gallery/admin?drive='+reason,request.url),{status:303,headers:privateHeaders});
 if(admin.role!=='owner')return back('forbidden');
 if(storageDriver()!=='drive'||!process.env.GOOGLE_CLIENT_ID)return back('not-configured');
 const nonce=randomBytes(16).toString('base64url');
 const state=oauthState(admin.id)+'~'+nonce;
 const response=NextResponse.redirect(authorizeUrl(new URL(request.url).origin,state),{status:302,headers:privateHeaders});
 // Binds the callback to this browser: Lax cookies are sent on the top-level return from Google.
 response.cookies.set('fg_oauth',nonce,{httpOnly:true,secure:true,sameSite:'lax',maxAge:600,path:'/api/football-gallery/admin/google'});
 return response;
}
