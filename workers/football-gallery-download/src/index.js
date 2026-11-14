// Football Gallery download Worker (Cloudflare Workers, Free plan compatible).
// Streams private originals, ZIP parts and previews from Google Drive to parents so no file
// bytes pass through Vercel. It holds no Google refresh token and no database access:
//   /t/<ticket>  preview JPEG (self-contained signed ticket, 15 minutes)
//   /f/<ticket>  original file  -> re-authorised by the app on every request
//   /z/<ticket>  ZIP part       -> re-authorised by the app on every request
// File bodies are piped natively (no per-chunk JavaScript) to stay within the Free plan CPU limit;
// a ZIP part needs one subrequest per file, so the app limits Drive ZIP parts to 45 files.
import {buildZipLayout,parseRange} from '../../../lib/football-gallery-zip.js';

const enc=new TextEncoder();
const API=env=>(env.GOOGLE_DRIVE_API_BASE||'https://www.googleapis.com').replace(/\/$/,'');
const appUrl=(env,path)=>env.FG_APP_ORIGIN.replace(/\/$/,'')+path;
const b64url=s=>{const p=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(p+'='.repeat((4-p.length%4)%4)),c=>c.charCodeAt(0))};
const text=(message,status)=>new Response(message,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex'}});
const disposition=(kind,name)=>{const safe=String(name).replace(/[\r\n"\\/]/g,'_').slice(0,180);return `${kind}; filename="${safe.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(safe)}`};

let hmac={secret:null,key:null};
async function verifyTicket(env,ticket){
 if(typeof ticket!=='string'||ticket.length>2000)return null;
 const [payload,sig,...rest]=ticket.split('.');
 if(!payload||!sig||rest.length)return null;
 if(hmac.secret!==env.FG_DOWNLOAD_SECRET)hmac={secret:env.FG_DOWNLOAD_SECRET,key:await crypto.subtle.importKey('raw',enc.encode(env.FG_DOWNLOAD_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify'])};
 try{
  if(!await crypto.subtle.verify('HMAC',hmac.key,b64url(sig),enc.encode('fg-ticket:'+payload)))return null;
  const data=JSON.parse(new TextDecoder().decode(b64url(payload)));
  return Number.isFinite(data.x)&&data.x>Date.now()/1000?data:null;
 }catch{return null}
}

const appHeaders=env=>({authorization:'Bearer '+env.FG_DOWNLOAD_SECRET,'content-type':'application/json',...(env.VERCEL_PROTECTION_BYPASS?{'x-vercel-protection-bypass':env.VERCEL_PROTECTION_BYPASS}:{})});
let token={value:null,exp:0};
async function driveToken(env,force=false){
 if(!force&&token.value&&token.exp>Date.now()+120000)return token.value;
 const r=await fetch(appUrl(env,'/api/football-gallery/internal/drive-token'),{method:'POST',headers:appHeaders(env)});
 if(!r.ok)throw new Error('token '+r.status);
 const d=await r.json();token={value:d.accessToken,exp:d.expiresAt};
 return token.value;
}
async function authorize(env,ticket,rangeStart){
 const r=await fetch(appUrl(env,'/api/football-gallery/internal/stream'),{method:'POST',headers:appHeaders(env),body:JSON.stringify({ticket,rangeStart})});
 const body=await r.json().catch(()=>({}));
 if(r.ok&&body.accessToken)token={value:body.accessToken,exp:body.expiresAt};
 return {status:r.status,body};
}
async function driveFetch(env,id,range,retry=true){
 const r=await fetch(`${API(env)}/drive/v3/files/${encodeURIComponent(id)}?alt=media`,{headers:{authorization:'Bearer '+await driveToken(env),...(range?{range}:{})}});
 if(r.status===401&&retry){r.body?.cancel();await driveToken(env,true);return driveFetch(env,id,range,false)}
 return r;
}
const requestedStart=request=>{const m=/^bytes=(\d+)-/.exec(request.headers.get('range')||'');return m?Number(m[1]):0};
const deny=status=>text(status===410?'ลิงก์หมดอายุหรือรายการเปลี่ยนแปลง กรุณากลับไปที่อัลบั้มแล้วกดดาวน์โหลดใหม่':status===404?'ไม่พบไฟล์':'ไม่มีสิทธิ์ดาวน์โหลด กรุณาเปิดอัลบั้มอีกครั้ง',status===410||status===404?status:403);

async function preview(env,t){
 const r=await driveFetch(env,t.d);
 if(!r.ok){r.body?.cancel();return text('ไม่พบภาพ',404)}
 return new Response(r.body,{status:200,headers:{'content-type':'image/jpeg','content-length':r.headers.get('content-length')||'','cache-control':'private, max-age=900','content-disposition':'inline','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}

async function original(env,request,ticket){
 const auth=await authorize(env,ticket,requestedStart(request));
 if(auth.status!==200)return deny(auth.status);
 const f=auth.body.file,rangeHeader=request.headers.get('range');
 const range=rangeHeader?parseRange(rangeHeader,f.size):null;
 if(range===false)return new Response(null,{status:416,headers:{'content-range':`bytes */${f.size}`}});
 const r=await driveFetch(env,f.driveId,range?`bytes=${range.start}-${range.end-1}`:null);
 if(!(r.status===200||r.status===206)){r.body?.cancel();return text('ดาวน์โหลดจาก Google Drive ไม่สำเร็จ กรุณาลองใหม่',r.status===403||r.status===429?503:502)}
 const headers={'content-type':f.mime||'application/octet-stream','content-disposition':disposition('attachment',f.name),'accept-ranges':'bytes','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','etag':`"${f.driveId}-${f.size}"`};
 if(range&&r.status===206){headers['content-range']=`bytes ${range.start}-${range.end-1}/${f.size}`;headers['content-length']=String(range.end-range.start)}
 else headers['content-length']=String(f.size);
 return new Response(r.body,{status:range&&r.status===206?206:200,headers});
}

async function zip(env,request,ticket,ctx){
 const auth=await authorize(env,ticket,requestedStart(request));
 if(auth.status!==200)return deny(auth.status);
 const z=auth.body.zip;
 const layout=buildZipLayout(z.entries.map(e=>({name:e.name,size:e.size,crc32:e.crc32,modified:new Date(e.modified),...(e.data?{data:b64url(e.data)}:{key:e.driveId})})));
 const etag=`"${z.etag}-${layout.length}"`;
 const ifRange=request.headers.get('if-range');
 let range=parseRange(request.headers.get('range'),layout.length);
 if(range===false)return new Response(null,{status:416,headers:{'content-range':`bytes */${layout.length}`}});
 if(range&&ifRange&&ifRange!==etag)range=null;
 const start=range?range.start:0,end=range?range.end:layout.length;
 const stream=typeof FixedLengthStream==='function'?new FixedLengthStream(end-start):new TransformStream();
 const writable=stream.writable;
 const pump=async()=>{
  let writer=writable.getWriter();
  try{
   for(const s of layout.segments){
    if(s.end<=start||s.start>=end)continue;
    const from=Math.max(start,s.start)-s.start,to=Math.min(end,s.end)-s.start;
    if(s.kind==='bytes'){await writer.write(s.data.subarray(from,to));continue}
    const r=await driveFetch(env,s.key,`bytes=${from}-${to-1}`);
    const length=Number(r.headers.get('content-length'));
    if(!(r.status===206||(r.status===200&&from===0&&to===s.size))||length!==to-from){r.body?.cancel();throw new Error('drive '+r.status)}
    writer.releaseLock();
    await r.body.pipeTo(writable,{preventClose:true});
    writer=writable.getWriter();
   }
   await writer.close();
  }catch(e){try{await writer.abort(e)}catch{}}
 };
 ctx.waitUntil(pump());
 const headers={'content-type':'application/zip','content-disposition':disposition('attachment',z.filename),'accept-ranges':'bytes','etag':etag,'cache-control':'private, no-store','x-content-type-options':'nosniff'};
 if(typeof FixedLengthStream!=='function')headers['content-length']=String(end-start);
 if(range)headers['content-range']=`bytes ${start}-${end-1}/${layout.length}`;
 return new Response(stream.readable,{status:range?206:200,headers});
}

export default {
 async fetch(request,env,ctx){
  if(!env.FG_DOWNLOAD_SECRET||!env.FG_APP_ORIGIN)return text('Download service is not configured',503);
  const url=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return text('Method not allowed',405);
  if(url.pathname==='/'||url.pathname==='/health')return text('ok',200);
  const m=/^\/([tfz])\/([A-Za-z0-9_\-.]{20,2000})$/.exec(url.pathname);
  if(!m)return text('Not found',404);
  const t=await verifyTicket(env,m[2]);
  if(!t||t.k!==m[1])return deny(403);
  try{
   if(t.k==='t')return await preview(env,t);
   if(t.k==='f')return await original(env,request,m[2]);
   return await zip(env,request,m[2],ctx);
  }catch(e){console.error('download failed',e?.message);return text('ระบบดาวน์โหลดขัดข้องชั่วคราว กรุณาลองใหม่',503)}
 }
};
