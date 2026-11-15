// Signed, short-lived download tickets for the download Worker (Drive storage).
// Format: base64url(JSON) "." base64url(HMAC-SHA256). The same format is verified in
// workers/football-gallery-download with WebCrypto, using FG_DOWNLOAD_SECRET.
//   k:'t' parent preview     {f: fileId, g: grantId, e: eventId} re-authorised on every request
//   k:'a' admin preview      {d: driveId}                       bearer URL issued only after an admin session check
//   k:'f' original file      {f: fileId, g: grantId, e: eventId} re-authorised by the app on every request
//   k:'z' ZIP part           {j: jobId, p: part, g: grantId, e}  re-authorised by the app on every request
import {createHmac,timingSafeEqual} from 'node:crypto';

const mac=payload=>createHmac('sha256',process.env.FG_DOWNLOAD_SECRET).update('fg-ticket:'+payload).digest('base64url');
export function signTicket(data,ttlSeconds){
 const payload=Buffer.from(JSON.stringify({...data,x:Math.floor(Date.now()/1000)+ttlSeconds})).toString('base64url');
 return payload+'.'+mac(payload);
}
export function verifyTicket(ticket){
 if(typeof ticket!=='string'||ticket.length>2000)return null;
 const [payload,sig,...rest]=ticket.split('.');
 if(!payload||!sig||rest.length)return null;
 const expected=mac(payload);
 if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 try{const d=JSON.parse(Buffer.from(payload,'base64url').toString());return Number.isFinite(d.x)&&d.x>Date.now()/1000?d:null}catch{return null}
}
const base=()=>process.env.FG_DOWNLOAD_BASE.replace(/\/$/,'');
export const thumbUrl=(fileId,grantId,eventId)=>`${base()}/t/${signTicket({k:'t',f:fileId,g:grantId,e:eventId},15*60)}`;
// Admin pages load previews through /api/football-gallery/admin/preview, which checks the admin
// session on every request; the Worker link it redirects to is only valid for two minutes.
export const ADMIN_PREVIEW_TTL=120;
export const adminThumbUrl=driveId=>`${base()}/a/${signTicket({k:'a',d:driveId},ADMIN_PREVIEW_TTL)}`;
export const originalUrl=(fileId,grantId,eventId)=>`${base()}/f/${signTicket({k:'f',f:fileId,g:grantId,e:eventId},15*60)}`;
export const archiveUrl=(jobId,part,grantId,eventId,expiresAt)=>`${base()}/z/${signTicket({k:'z',j:jobId,p:part,g:grantId,e:eventId},Math.max(60,Math.floor((new Date(expiresAt).getTime()-Date.now())/1000)))}`;
// Worker -> app authentication (constant-time bearer comparison).
export function workerAuthorized(request){
 if(!process.env.FG_DOWNLOAD_SECRET)return false;
 const header=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+process.env.FG_DOWNLOAD_SECRET);
 return header.length===expected.length&&timingSafeEqual(header,expected);
}
